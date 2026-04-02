/* AI 生成 By Peng.Guo */
import { useState, useRef, useEffect } from 'react';
import { appendToolResultsToLogs } from './log-tools';
import { startDeployPolling } from './viewmodel/deploy/useDeployPolling';
import type { DeployPollingTarget } from './domain/deploy/models';

type AgentTiming = { firstLLMMs?: number; tools?: { name: string; ms: number }[]; secondLLMMs?: number; tokenUsage?: { promptTokens?: number; completionTokens?: number } };
type AgentResult = { success: boolean; text?: string; toolResults?: unknown[]; error?: string; timing?: AgentTiming };

interface ChatPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
}

const QUICK_ACTIONS: Array<{ label: string; message: string }> = [
  { label: '开始工作', message: '开始工作' },
  { label: '打开 Jenkins', message: '打开 Jenkins' },
];

/** 合并菜单项：走 SSE 流式接口，每步实时写入 Logs */
const MERGE_TASKS = [
  { key: 'nova', label: '合并 nova', path: '/merge/nova' },
  { key: 'biz-solution', label: '合并 biz-solution', path: '/merge/biz-solution' },
  { key: 'scm', label: '合并 scm', path: '/merge/scm' },
] as const;

/** 下拉列表：快捷部署 Jenkins 任务（与 config/projects 中有 jenkins 的代号一致） */
const DEPLOY_OPTIONS = [
  { value: '', label: '快捷部署...' },
  { value: 'nova', label: '部署nova' },
  { value: 'cc-web', label: '部署cc-web' },
  { value: 'react18', label: '部署react18' },
  { value: 'base', label: '部署base' },
  { value: 'base18', label: '部署base18' },
  { value: 'biz-solution', label: '部署biz-solution' },
  { value: 'biz-guide', label: '部署biz-guide' },
  { value: 'scm', label: '部署scm' },
];

/** 指令输入历史最多条数，支持 ↑↓ 切换 */
const INPUT_HISTORY_MAX = 10;

type ProjectInfo = {
  codes: string[];
  jenkins?: { jobName: string; defaultBranch: string };
  merge?: { targetBranch: string; runRelease: boolean };
};

function buildCommandHints(projects: ProjectInfo[], inputHistory: string[]): string[] {
  const workflowHints = [
    '执行工作流 start-work',
    '执行工作流 standalone',
    '执行工作流 upgrade-react18-nova',
    '执行工作流 upgrade-cc-web-nova',
  ];
  const fixedHints = [
    ...QUICK_ACTIONS.map((a) => a.message),
    '升级集测react18的nova版本',
    '升级集测cc-web的nova版本',
    ...MERGE_TASKS.map((t) => t.label),
    ...DEPLOY_OPTIONS.filter((o) => o.value).map((o) => o.label),
    '打开集测环境',
    '打开测试环境',
    '打开json配置中心',
    '打开 Jenkins',
  ];
  const allCodes = Array.from(new Set(projects.flatMap((p) => p.codes)));
  const jenkinsCodes = Array.from(new Set(projects.filter((p) => p.jenkins).flatMap((p) => p.codes)));
  const mergeCodes = Array.from(new Set(projects.filter((p) => p.merge).flatMap((p) => p.codes)));
  const startHints = allCodes.map((code) => `启动 ${code}`);
  const deployHints = jenkinsCodes.flatMap((code) => [`部署 ${code}`, `部署 ${code} 分支是 test`]);
  const jenkinsOpenHints = jenkinsCodes.flatMap((code) => [`打开 Jenkins 的 ${code}`, `打开jenkins ${code}`]);
  const openIdeHints = allCodes.flatMap((code) => [
    `ws打开${code}`,
    `cursor打开${code}`,
    `code打开${code}`,
    `用 WebStorm 打开 ${code}`,
    `用 Cursor 打开 ${code}`,
    `用 VS Code 打开 ${code}`,
  ]);
  const closeIdeHints = allCodes.flatMap((code) => [
    `关闭ws的${code}`,
    `关闭cursor的${code}`,
    `关闭code的${code}`,
    `关闭 WebStorm 的 ${code}`,
    `关闭 Cursor 的 ${code}`,
    `关闭 VS Code 的 ${code}`,
  ]);
  const mergeHints = mergeCodes.map((code) => `合并 ${code}`);
  return Array.from(
    new Set([
      ...fixedHints,
      ...workflowHints,
      ...startHints,
      ...deployHints,
      ...jenkinsOpenHints,
      ...openIdeHints,
      ...closeIdeHints,
      ...mergeHints,
      ...inputHistory,
    ])
  );
}

export function ChatPanel({ apiBase, addLog }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploySelect, setDeploySelect] = useState('');
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; toolResults?: unknown[] }>>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [completionList, setCompletionList] = useState<string[]>([]);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const deployPollRef = useRef<{ stop: () => void } | null>(null);
  const mergeMenuRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef('');

  useEffect(() => () => {
    if (deployPollRef.current) deployPollRef.current.stop();
  }, []);

  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/agent/model`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { model?: string } | null) => data?.model != null && setCurrentModel(data.model))
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/projects`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProjectInfo[]) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/agent/history`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: string[] } | null) => {
        if (!data || !Array.isArray(data.items)) return;
        const next = data.items
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(-INPUT_HISTORY_MAX);
        setInputHistory(next);
      })
      .catch(() => {});
  }, [apiBase]);

  const persistInputHistory = (history: string[]) => {
    if (!apiBase) return;
    fetch(`${apiBase}/agent/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: history }),
    }).catch(() => {});
  };

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (mergeMenuRef.current && !mergeMenuRef.current.contains(e.target as Node)) setMergeMenuOpen(false);
    };
    if (mergeMenuOpen) document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [mergeMenuOpen]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (showCompletion && inputWrapRef.current && !inputWrapRef.current.contains(e.target as Node)) setShowCompletion(false);
    };
    if (showCompletion) document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [showCompletion]);

  const executeMerge = async (path: string, doneLabel: string) => {
    if (!apiBase) return;
    addLog(`开始${doneLabel}…`);
    try {
      const res = await fetch(`${apiBase}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok || !res.body) {
        addLog(`请求失败: ${res.status}`);
        setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${res.status}` }]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let lastDone: { success: boolean; error?: string } | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as { step?: string; done?: boolean; success?: boolean; error?: string };
              if (data.step != null) addLog(data.step);
              if (data.done) {
                lastDone = { success: !!data.success, error: data.error };
                if (!data.success) {
                  addLog(data.error || '合并失败');
                  if (data.error === '代码有冲突，需手工合并') alert('代码有冲突，需手工合并');
                } else addLog(doneLabel);
              }
            } catch (_) {}
          }
        }
      }
      if (buf.startsWith('data: ')) {
        try {
          const data = JSON.parse(buf.slice(6)) as { step?: string; done?: boolean; success?: boolean; error?: string };
          if (data.step != null) addLog(data.step);
          if (data.done) lastDone = { success: !!data.success, error: data.error };
        } catch (_) {}
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: lastDone?.success ? `已执行${doneLabel}，请查看下方 Logs。` : (lastDone?.error ?? '合并失败') },
      ]);
    } catch (e) {
      addLog(`请求失败: ${e}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${String(e)}` }]);
    }
  };

  const handleAgentResponse = (data: AgentResult, clearLoading: boolean) => {
    addLog(data.success ? 'Agent 完成' : `错误: ${data.error}`);
    if (data.timing) {
      if (data.timing.firstLLMMs != null) addLog(`  [耗时] 模型推理（解析指令）: ${data.timing.firstLLMMs} ms`);
      if (Array.isArray(data.timing.tools))
        data.timing.tools.forEach((t) => addLog(`  [耗时] 工具 ${t.name} 执行: ${t.ms} ms`));
      if (data.timing.secondLLMMs != null) addLog(`  [耗时] 模型推理（生成回复）: ${data.timing.secondLLMMs} ms`);
      const tu = data.timing.tokenUsage;
      if (tu && (tu.promptTokens != null || tu.completionTokens != null)) {
        const p = tu.promptTokens ?? 0;
        const c = tu.completionTokens ?? 0;
        addLog(`  [Token] 本次指令：输入 ${p}，输出 ${c}，合计 ${p + c}`);
      }
    }
    const deployResult = data.toolResults?.find(
      (t): t is { tool: string; result?: { queueUrl?: string; jobName?: string; message?: string; jobKey?: string } } =>
        (t as { tool: string }).tool === 'deploy_jenkins' && (t as { result?: unknown }).result != null
    ) as { tool: string; result?: { queueUrl?: string; jobName?: string; message?: string; jobKey?: string } } | undefined;
    const deployPayload = deployResult?.result;
    const hasDeployPoll = deployPayload && (deployPayload.queueUrl || deployPayload.jobName);
    const content = hasDeployPoll ? (deployPayload.message ?? '已触发，构建中…') : (data.success ? (data.text ?? '') : (data.error ?? '请求失败'));
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content, toolResults: data.toolResults },
    ]);
    if (hasDeployPoll) {
      const target: DeployPollingTarget | null = deployPayload.queueUrl
        ? { kind: 'queueUrl', value: deployPayload.queueUrl }
        : deployPayload.jobName
          ? { kind: 'jobName', value: deployPayload.jobName }
          : null;
      if (target) {
        startDeployPolling({
          apiBase,
          target,
          label: deployPayload.jobKey ? `部署${deployPayload.jobKey}` : '部署',
          taskKey: deployPayload.jobKey,
          setMessages,
          addLog,
          pollRef: deployPollRef,
        });
      }
    }
    const mergeResult = data.toolResults?.find(
      (t): t is { tool: string; result?: { steps?: string[] } } =>
        (t as { tool: string }).tool === 'merge_repo' && (t as { result?: unknown }).result != null
    );
    const mergeSteps = (mergeResult?.result?.steps as string[] | undefined);
    appendToolResultsToLogs(data.toolResults, addLog);
    if (Array.isArray(mergeSteps) && mergeSteps.length > 0) mergeSteps.forEach((step) => addLog(step));
    if (clearLoading) setLoading(false);
  };

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setInputHistory((prev) => {
      const next = prev[prev.length - 1] === msg ? prev : [...prev, msg].slice(-INPUT_HISTORY_MAX);
      if (next !== prev) persistInputHistory(next);
      return next;
    });
    historyIndexRef.current = -1;
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);
    addLog(`发送: ${msg}`);
    const mergeTask = MERGE_TASKS.find((t) => msg === t.label || new RegExp(`合并\\s*${t.key}`, 'i').test(msg));
    if (mergeTask) {
      setLoading(false);
      await executeMerge(mergeTask.path, mergeTask.label);
      return;
    }
    try {
      const res = await fetch(`${apiBase}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data: AgentResult = await res.json();
      handleAgentResponse(data, true);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      addLog(`请求异常: ${err}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${err}` }]);
      setLoading(false);
    }
  };

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {QUICK_ACTIONS.map(({ label, message }) => (
          <button
            key={label}
            type="button"
            onClick={() => send(message)}
            disabled={loading}
            style={{
              padding: '8px 14px',
              background: '#0f3460',
              color: '#eaeaea',
              border: '1px solid #333',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {label}
          </button>
        ))}
        <select
          value={deploySelect}
          onChange={(e) => {
            const v = e.target.value;
            setDeploySelect('');
            if (v) {
              const label = DEPLOY_OPTIONS.find((o) => o.value === v)?.label ?? v;
              send(label);
            }
          }}
          disabled={loading}
          style={{
            padding: '8px 14px',
            background: '#16213e',
            color: '#eaeaea',
            border: '1px solid #333',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {DEPLOY_OPTIONS.map((o) => (
            <option key={o.value || 'placeholder'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div ref={mergeMenuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMergeMenuOpen((o) => !o)}
            disabled={loading}
            style={{
              padding: '8px 14px',
              background: mergeMenuOpen ? '#0f3460' : '#16213e',
              color: '#eaeaea',
              border: '1px solid #333',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            合并代码 ▾
          </button>
          {mergeMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                minWidth: 160,
                background: '#16213e',
                border: '1px solid #333',
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 10,
              }}
            >
              {MERGE_TASKS.map((task) => (
                <button
                  key={task.key}
                  type="button"
                  onClick={() => {
                    setMergeMenuOpen(false);
                    setMessages((prev) => [...prev, { role: 'user', content: task.label }]);
                    addLog(`发送: ${task.label}`);
                    executeMerge(task.path, task.label);
                  }}
                  disabled={loading}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    color: '#eaeaea',
                    border: 'none',
                    borderRadius: 4,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {task.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMessages([])}
          title="清屏"
          style={{
            marginLeft: 'auto',
            width: 28,
            height: 28,
            padding: 0,
            border: '1px solid #333',
            borderRadius: 6,
            background: '#16213e',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ⊗
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', marginBottom: 12, background: '#0d0d1a', borderRadius: 8, padding: 12 }}>
        {messages.length === 0 && (
          <p style={{ color: '#888' }}>[Chat] 输入指令或点击上方快捷按钮，例如：开始工作、升级集测react18的nova版本、升级集测cc-web的nova版本、启动 react18、打开 Jenkins、部署order-service</p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <strong style={{ color: m.role === 'user' ? '#7f9cf5' : '#68d391' }}>{m.role === 'user' ? 'You' : 'AI'}:</strong>{' '}
            <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
            {m.toolResults && m.toolResults.length > 0 && (
              <pre style={{ marginTop: 8, fontSize: 12, background: '#1a1a2e', padding: 8, borderRadius: 4, overflow: 'auto' }}>
                {JSON.stringify(m.toolResults, null, 2)}
              </pre>
            )}
          </div>
        ))}
        {loading && <p style={{ color: '#888' }}>处理中…</p>}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
      >
        <div ref={inputWrapRef} style={{ flex: 1, position: 'relative' }}>
          <textarea
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);
              historyIndexRef.current = -1;
              const trim = v.trim();
              if (trim.length > 0) {
                const dynamicHints = buildCommandHints(projects, inputHistory);
                const list = dynamicHints.filter((h) => h.startsWith(trim));
                const dedup = Array.from(new Set(list));
                setCompletionList(dedup.slice(0, 12));
                setCompletionIndex(0);
                setShowCompletion(dedup.length > 0);
              } else {
                setCompletionList([]);
                setShowCompletion(false);
              }
            }}
            onKeyDown={(e) => {
              if (showCompletion && completionList.length > 0) {
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault();
                  setInput(completionList[completionIndex]);
                  setShowCompletion(false);
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCompletionIndex((i) => (i + 1) % completionList.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCompletionIndex((i) => (i - 1 + completionList.length) % completionList.length);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowCompletion(false);
                  return;
                }
              }
              if (e.key === 'ArrowUp') {
                if (inputHistory.length > 0) {
                  e.preventDefault();
                  if (historyIndexRef.current === -1) {
                    savedInputRef.current = input;
                    historyIndexRef.current = inputHistory.length - 1;
                    setInput(inputHistory[inputHistory.length - 1]);
                  } else if (historyIndexRef.current > 0) {
                    historyIndexRef.current -= 1;
                    setInput(inputHistory[historyIndexRef.current]);
                  }
                }
                return;
              }
              if (e.key === 'ArrowDown') {
                if (historyIndexRef.current !== -1) {
                  e.preventDefault();
                  if (historyIndexRef.current < inputHistory.length - 1) {
                    historyIndexRef.current += 1;
                    setInput(inputHistory[historyIndexRef.current]);
                  } else {
                    historyIndexRef.current = -1;
                    setInput(savedInputRef.current);
                  }
                }
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) send(input);
              }
            }}
            placeholder="输入指令...（Enter 发送，Shift+Enter 换行，↑↓ 切换历史，Tab 补全）"
            disabled={loading}
            rows={3}
            style={{
              width: '100%',
              minHeight: 60,
              padding: 10,
              background: '#16213e',
              border: '1px solid #333',
              borderRadius: 6,
              color: '#eaeaea',
              resize: 'vertical',
              font: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          {showCompletion && completionList.length > 0 && (
            <ul
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: '100%',
                margin: 0,
                marginBottom: 4,
                padding: 4,
                listStyle: 'none',
                background: '#1a1a2e',
                border: '1px solid #333',
                borderRadius: 6,
                boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
                zIndex: 20,
                maxHeight: 240,
                overflow: 'auto',
              }}
            >
              {completionList.map((item, i) => (
                <li
                  key={item}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInput(item);
                    setCompletionIndex(i);
                    setShowCompletion(false);
                  }}
                  style={{
                    padding: '8px 10px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    background: i === completionIndex ? '#0f3460' : 'transparent',
                    color: '#eaeaea',
                    fontSize: 13,
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {currentModel && (
            <span style={{ fontSize: 12, color: '#64748b' }} title="当前使用的本地模型">
              {currentModel}
            </span>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: '#0f3460',
              color: '#eaeaea',
              border: '1px solid #333',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            发送
          </button>
        </div>
      </form>
    </section>
  );
}
