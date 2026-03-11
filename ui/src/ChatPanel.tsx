/* AI 生成 By Peng.Guo */
import { useState, useRef, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

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

/** 下拉列表：快捷部署 Jenkins 任务 */
const DEPLOY_OPTIONS = [
  { value: '', label: '快捷部署...' },
  { value: 'nova', label: '部署nova' },
  { value: 'cc-web', label: '部署cc-web' },
  { value: 'react18', label: '部署react18' },
  { value: 'biz-solution', label: '部署biz-solution' },
  { value: 'biz-guide', label: '部署biz-guide' },
  { value: 'scm', label: '部署scm' },
];

type DeployStatusResult = { status: string; message?: string; buildUrl?: string; buildNumber?: number; buildName?: string; progressPercent?: number };

const DEPLOY_POLL_INTERVAL_MS = 10000;
const DEPLOY_POLL_MAX = 200; // 3 秒一次，约 10 分钟
const DEPLOY_CONSECUTIVE_FAIL_MAX = 4;
const DEPLOY_POLL_MIN_BEFORE_TERMINAL = 4;

/** 指令输入历史最多条数，支持 ↑↓ 切换 */
const INPUT_HISTORY_MAX = 10;

/** 启动部署状态轮询，用于下拉部署与 Agent 触发部署后统一展示进度；taskKey 用于 Logs 中带任务名如【nova】部署成功 */
function startDeployStatusPolling(
  apiBase: string,
  options: { queueUrl?: string; jobName?: string; label: string; taskKey?: string },
  setMessages: Dispatch<SetStateAction<Array<{ role: 'user' | 'assistant'; content: string; toolResults?: unknown[] }>>>,
  addLog: (line: string) => void,
  pollRef: MutableRefObject<ReturnType<typeof setInterval> | null>
): void {
  const { queueUrl, jobName, label, taskKey } = options;
  if (!queueUrl && !jobName) return;
  const prefix = taskKey ? `【${taskKey}】` : '';
  const statusUrl = queueUrl
    ? `${apiBase}/jenkins/deploy/status?queueUrl=${encodeURIComponent(queueUrl)}`
    : `${apiBase}/jenkins/deploy/status?jobName=${encodeURIComponent(jobName!)}`;
  const formatDeployMsg = (s: DeployStatusResult) => {
    const name = s.buildName ?? label;
    const num = s.buildNumber != null ? ` #${s.buildNumber}` : '';
    const progress = s.message ?? '';
    return progress ? `${name}${num} ${progress}` : `${name}${num}`;
  };
  let pollCount = 0;
  let consecutiveFail = 0;
  pollRef.current = setInterval(async () => {
    pollCount += 1;
    if (pollCount > DEPLOY_POLL_MAX) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setMessages((prev) => [...prev, { role: 'assistant', content: `${prefix}部署状态查询超时，请到 Jenkins 查看。` }]);
      addLog(`${prefix}部署状态查询超时，请到 Jenkins 查看。`);
      return;
    }
    try {
      const statusRes = await fetch(statusUrl);
      const status: DeployStatusResult = await statusRes.json();
      const isTerminal = status.status === 'success' || status.status === 'failure' || status.status === 'aborted';
      const isFail = status.status === 'unknown' || !statusRes.ok;
      if (isTerminal) {
        if (pollCount < DEPLOY_POLL_MIN_BEFORE_TERMINAL) return;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        const msg = formatDeployMsg(status);
        const logMsg = status.status === 'success' ? `${prefix}部署成功` : msg;
        addLog(logMsg);
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
        return;
      }
      if (isFail) {
        consecutiveFail += 1;
        if (consecutiveFail >= DEPLOY_CONSECUTIVE_FAIL_MAX) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          const errMsg = `${prefix}轮询失败：连续多次无法获取状态，请到 Jenkins 查看。`;
          setMessages((prev) => [...prev, { role: 'assistant', content: errMsg }]);
          addLog(errMsg);
        }
        return;
      }
      consecutiveFail = 0;
      const progressMsg = formatDeployMsg(status);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && (last.content.includes('构建中') || last.content.includes('排队') || last.content.includes(label))) {
          next[next.length - 1] = { ...last, content: progressMsg };
          return next;
        }
        return [...prev, { role: 'assistant', content: progressMsg }];
      });
    } catch {
      consecutiveFail += 1;
      if (consecutiveFail >= DEPLOY_CONSECUTIVE_FAIL_MAX) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        const errMsg = `${prefix}轮询失败：连续多次请求异常，请到 Jenkins 查看。`;
        setMessages((prev) => [...prev, { role: 'assistant', content: errMsg }]);
        addLog(errMsg);
      }
    }
  }, DEPLOY_POLL_INTERVAL_MS);
}

export function ChatPanel({ apiBase, addLog }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploySelect, setDeploySelect] = useState('');
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; toolResults?: unknown[] }>>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const deployPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mergeMenuRef = useRef<HTMLDivElement>(null);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef('');

  useEffect(() => () => {
    if (deployPollRef.current) clearInterval(deployPollRef.current);
  }, []);

  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/agent/model`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { model?: string } | null) => data?.model != null && setCurrentModel(data.model))
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (mergeMenuRef.current && !mergeMenuRef.current.contains(e.target as Node)) setMergeMenuOpen(false);
    };
    if (mergeMenuOpen) document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [mergeMenuOpen]);

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
      startDeployStatusPolling(
        apiBase,
        { queueUrl: deployPayload.queueUrl, jobName: deployPayload.jobName, label: deployPayload.jobKey ? `部署${deployPayload.jobKey}` : '部署', taskKey: deployPayload.jobKey },
        setMessages,
        addLog,
        deployPollRef
      );
    }
    const mergeResult = data.toolResults?.find(
      (t): t is { tool: string; result?: { steps?: string[] } } =>
        (t as { tool: string }).tool === 'merge_repo' && (t as { result?: unknown }).result != null
    );
    const mergeSteps = (mergeResult?.result?.steps as string[] | undefined);
    if (Array.isArray(mergeSteps) && mergeSteps.length > 0) mergeSteps.forEach((step) => addLog(step));
    if (clearLoading) setLoading(false);
  };

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setInputHistory((prev) => {
      const next = prev[prev.length - 1] === msg ? prev : [...prev, msg].slice(-INPUT_HISTORY_MAX);
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
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setMessages([])}
          title="清空对话输出"
          style={{
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
      </div>
      <div style={{ flex: 1, overflow: 'auto', marginBottom: 12, background: '#0d0d1a', borderRadius: 8, padding: 12 }}>
        {messages.length === 0 && (
          <p style={{ color: '#888' }}>[Chat] 输入指令或点击上方快捷按钮，例如：开始工作、启动 cpxy、启动 react18、启动 scm、打开 Jenkins、部署order-service</p>
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
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            historyIndexRef.current = -1;
          }}
          onKeyDown={(e) => {
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
          placeholder="输入指令...（Enter 发送，Shift+Enter 换行，↑↓ 切换历史）"
          disabled={loading}
          rows={3}
          style={{
            flex: 1,
            minHeight: 60,
            padding: 10,
            background: '#16213e',
            border: '1px solid #333',
            borderRadius: 6,
            color: '#eaeaea',
            resize: 'vertical',
            font: 'inherit',
          }}
        />
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
