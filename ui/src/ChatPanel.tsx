/* AI 生成 By Peng.Guo */
import { useState, useRef, useEffect } from 'react';

type AgentResult = { success: boolean; text?: string; toolResults?: unknown[]; error?: string };

interface ChatPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
}

const QUICK_ACTIONS: Array<{ label: string; message: string; url?: string }> = [
  { label: '开始工作', message: '执行工作流 start-work' },
  { label: '打开 Jenkins', message: '打开 Jenkins', url: 'https://jenkins.rd.chanjet.com/' },
];

/** 合并任务类型：与菜单项、指令、API 对应 */
const MERGE_TASKS = [
  { key: 'nova', label: '合并 nova', path: '/merge/nova', cmd: /合并\s*nova/i },
  { key: 'biz-solution', label: '合并 biz-solution', path: '/merge/biz-solution', cmd: /合并\s*biz-solution/i },
  { key: 'scm', label: '合并 scm', path: '/merge/scm', cmd: /合并\s*scm/i },
] as const;

function getMergeCommandType(msg: string): (typeof MERGE_TASKS)[number] | null {
  const t = msg.trim();
  for (const task of MERGE_TASKS) {
    if (task.cmd.test(t)) return task;
  }
  return null;
}

/** 开始工作子任务及独立任务：通过指令单独执行；workflow 默认为 start-work，独立任务用 standalone（不参与「开始工作」流程） */
const START_WORK_TASKS: Array<{ key: string; label: string; cmd: RegExp; workflow?: string }> = [
  { key: 'cpxy', label: '启动 cpxy', cmd: /启动\s*cpxy/i },
  { key: 'react18', label: '启动 react18', cmd: /启动\s*react18/i },
  { key: 'cc-web', label: '启动 cc-web', cmd: /启动\s*cc-web/i },
  { key: 'biz-solution', label: '启动 biz-solution', cmd: /启动\s*biz-solution/i },
  { key: 'uikit', label: '启动 uikit', cmd: /启动\s*uikit/i },
  { key: 'shared', label: '启动 shared', cmd: /启动\s*shared/i },
  { key: 'scm', label: '启动 scm', cmd: /启动\s*scm/i, workflow: 'standalone' },
];

function getStartWorkStepTask(msg: string): (typeof START_WORK_TASKS)[number] | null {
  const t = msg.trim();
  for (const task of START_WORK_TASKS) {
    if (task.cmd.test(t)) return task;
  }
  return null;
}

/** 下拉列表：快捷部署 Jenkins 任务 */
const DEPLOY_OPTIONS = [
  { value: '', label: '快捷部署...' },
  { value: 'nova', label: '部署nova' },
  { value: 'cc-web', label: '部署 cc-web' },
  { value: 'react18', label: '部署 react18' },
  { value: 'biz-solution', label: '部署 biz-solution' },
  { value: 'biz-guide', label: '部署 biz-guide' },
  { value: 'scm', label: '部署 scm' },
];

type DeployResult = { success: boolean; message: string; queueUrl?: string; jobName?: string };
type DeployStatusResult = { status: string; message?: string; buildUrl?: string; buildNumber?: number; buildName?: string; progressPercent?: number };

const DEPLOY_POLL_INTERVAL_MS = 3000;
const DEPLOY_POLL_MAX = 200; // 3 秒一次，约 10 分钟
const DEPLOY_CONSECUTIVE_FAIL_MAX = 4;
/** 至少轮询几次后才把 success/failure/aborted 当作最终结果，避免任务未出现在 buildHistory 时误用上一次构建状态 */
const DEPLOY_POLL_MIN_BEFORE_TERMINAL = 4;

export function ChatPanel({ apiBase, addLog }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [deploySelect, setDeploySelect] = useState('');
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);
  const [mergeRunning, setMergeRunning] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; toolResults?: unknown[] }>>([]);
  const deployPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mergeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (deployPollRef.current) clearInterval(deployPollRef.current);
  }, []);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (mergeMenuRef.current && !mergeMenuRef.current.contains(e.target as Node)) setMergeMenuOpen(false);
    };
    if (mergeMenuOpen) document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [mergeMenuOpen]);

  const executeMerge = async (endpoint: string, doneLabel: string): Promise<{ success: boolean; error?: string }> => {
    if (!apiBase) return { success: false, error: '未就绪' };
    try {
      const res = await fetch(`${apiBase}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok || !res.body) {
        addLog(`请求失败: ${res.status}`);
        return { success: false, error: `请求失败: ${res.status}` };
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
          if (data.done) {
            lastDone = { success: !!data.success, error: data.error };
            if (!data.success) {
              addLog(data.error || '合并失败');
              if (data.error === '代码有冲突，需手工合并') alert('代码有冲突，需手工合并');
            } else addLog(doneLabel);
          }
        } catch (_) {}
      }
      return lastDone ?? { success: false, error: '未收到完成事件' };
    } catch (e) {
      addLog(`请求失败: ${e}`);
      return { success: false, error: String(e) };
    }
  };

  const runMerge = (task: (typeof MERGE_TASKS)[number]) => async () => {
    if (!apiBase || mergeRunning) return;
    setMergeMenuOpen(false);
    setMergeRunning(true);
    addLog(`开始${task.label}…`);
    try {
      await executeMerge(task.path, `${task.label} 完成`);
    } finally {
      setMergeRunning(false);
    }
  };

  const openUrl = async (url: string, label: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: label }]);
    setLoading(true);
    addLog(`${label}: ${url}`);
    try {
      const res = await fetch(`${apiBase}/open-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setLoading(false);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.success ? '已打开' : (data.error ?? '打开失败') }]);
      if (!data.success) addLog(`打开失败: ${data.error}`);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setLoading(false);
      addLog(`打开异常: ${err}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${err}` }]);
    }
  };

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);
    setMergeRunning(true);
    addLog(`发送: ${msg}`);
    try {
      const mergeTask = getMergeCommandType(msg);
      if (mergeTask) {
        addLog(`开始${mergeTask.label}…`);
        const result = await executeMerge(mergeTask.path, `${mergeTask.label} 完成`);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: result.success ? `已执行${mergeTask.label}，请查看下方 Logs。` : (result.error ?? '合并失败'),
          },
        ]);
        return;
      }
      const startWorkTask = getStartWorkStepTask(msg);
      if (startWorkTask) {
        addLog(`${startWorkTask.label}…`);
        try {
          const stepRes = await fetch(`${apiBase}/workflow/${startWorkTask.workflow ?? 'start-work'}/step`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskKey: startWorkTask.key }),
          });
          const stepData = await stepRes.json();
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: stepData.success
                ? `已执行${startWorkTask.label}，请查看终端。`
                : (stepData.error ?? '执行失败'),
            },
          ]);
          if (stepData.success) addLog(`${startWorkTask.label} 已触发`);
          else addLog(`失败: ${stepData.error}`);
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          addLog(`请求异常: ${err}`);
          setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${err}` }]);
        }
        return;
      }
      const res = await fetch(`${apiBase}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data: AgentResult = await res.json();
      addLog(data.success ? 'Agent 完成' : `错误: ${data.error}`);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.success ? (data.text ?? '') : (data.error ?? '请求失败'),
          toolResults: data.toolResults,
        },
      ]);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      addLog(`请求异常: ${err}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${err}` }]);
    } finally {
      setLoading(false);
      setMergeRunning(false);
    }
  };

  const runDeploy = async (jobKey: string) => {
    if (!jobKey) return;
    const label = DEPLOY_OPTIONS.find((o) => o.value === jobKey)?.label ?? jobKey;
    setMessages((prev) => [...prev, { role: 'user', content: label }]);
    setDeploySelect('');
    setLoading(true);
    addLog(`部署: ${label}`);
    try {
      const res = await fetch(`${apiBase}/jenkins/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: jobKey }),
      });
      const data: DeployResult = await res.json();
      setLoading(false);
      if (!data.success) {
        addLog(`部署失败: ${data.message}`);
        setMessages((prev) => [...prev, { role: 'assistant', content: `失败: ${data.message}` }]);
        return;
      }
      addLog('已触发，构建中…');
      setMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
      const pollByQueueUrl = data.queueUrl;
      const pollByJobName = data.jobName;
      if (!pollByQueueUrl && !pollByJobName) return;
      let pollCount = 0;
      let consecutiveFail = 0;
      const statusUrl = pollByQueueUrl
        ? `${apiBase}/jenkins/deploy/status?queueUrl=${encodeURIComponent(pollByQueueUrl)}`
        : `${apiBase}/jenkins/deploy/status?jobName=${encodeURIComponent(pollByJobName!)}`;

      const formatDeployMsg = (s: DeployStatusResult) => {
        const name = s.buildName ?? label;
        const num = s.buildNumber != null ? ` #${s.buildNumber}` : '';
        const progress = s.message ?? '';
        return progress ? `${name}${num} ${progress}` : `${name}${num}`;
      };

      deployPollRef.current = setInterval(async () => {
        pollCount += 1;
        if (pollCount > DEPLOY_POLL_MAX) {
          if (deployPollRef.current) clearInterval(deployPollRef.current);
          deployPollRef.current = null;
          setMessages((prev) => [...prev, { role: 'assistant', content: '部署状态查询超时，请到 Jenkins 查看。' }]);
          addLog('部署轮询超时');
          return;
        }
        try {
          const statusRes = await fetch(statusUrl);
          const status: DeployStatusResult = await statusRes.json();
          const isTerminal = status.status === 'success' || status.status === 'failure' || status.status === 'aborted';
          const isFail = status.status === 'unknown' || !statusRes.ok;
          if (isTerminal) {
            consecutiveFail = 0;
            if (pollCount < DEPLOY_POLL_MIN_BEFORE_TERMINAL) {
              return;
            }
            if (deployPollRef.current) clearInterval(deployPollRef.current);
            deployPollRef.current = null;
            const msg = formatDeployMsg(status);
            addLog(status.status === 'success' ? '部署成功' : msg);
            setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
            return;
          }
          if (isFail) {
            consecutiveFail += 1;
          if (consecutiveFail >= DEPLOY_CONSECUTIVE_FAIL_MAX) {
            if (deployPollRef.current) clearInterval(deployPollRef.current);
            deployPollRef.current = null;
            const errMsg = `轮询失败：连续 ${DEPLOY_CONSECUTIVE_FAIL_MAX} 次无法获取状态，请到 Jenkins 查看。`;
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
            if (deployPollRef.current) clearInterval(deployPollRef.current);
            deployPollRef.current = null;
            const errMsg = `轮询失败：连续 ${DEPLOY_CONSECUTIVE_FAIL_MAX} 次请求异常，请到 Jenkins 查看。`;
            setMessages((prev) => [...prev, { role: 'assistant', content: errMsg }]);
            addLog(errMsg);
          }
        }
      }, DEPLOY_POLL_INTERVAL_MS);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      addLog(`部署请求异常: ${err}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${err}` }]);
      setLoading(false);
    }
  };

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {QUICK_ACTIONS.map(({ label, message, url }) => (
          <button
            key={label}
            type="button"
            onClick={() => (url ? openUrl(url, label) : send(message))}
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
            setDeploySelect(v);
            if (v) runDeploy(v);
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
            disabled={loading || mergeRunning}
            style={{
              padding: '8px 14px',
              background: mergeMenuOpen ? '#0f3460' : '#16213e',
              color: '#eaeaea',
              border: '1px solid #333',
              borderRadius: 6,
              cursor: loading || mergeRunning ? 'not-allowed' : 'pointer',
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
                  onClick={runMerge(task)}
                  disabled={mergeRunning}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    color: '#eaeaea',
                    border: 'none',
                    borderRadius: 4,
                    cursor: mergeRunning ? 'not-allowed' : 'pointer',
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
          <p style={{ color: '#888' }}>[Chat] 输入指令或点击上方快捷按钮，例如：开始工作、启动 cpxy、启动 react18、启动 scm、打开 Jenkins、部署 order-service</p>
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
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入指令..."
          disabled={loading}
          style={{
            flex: 1,
            padding: 10,
            background: '#16213e',
            border: '1px solid #333',
            borderRadius: 6,
            color: '#eaeaea',
          }}
        />
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
      </form>
    </section>
  );
}
