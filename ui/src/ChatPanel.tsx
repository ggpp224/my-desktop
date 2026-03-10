/* AI 生成 By Peng.Guo */
import { useState, useRef, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

type AgentResult = { success: boolean; text?: string; toolResults?: unknown[]; error?: string };

interface ChatPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
}

const QUICK_ACTIONS: Array<{ label: string; message: string }> = [
  { label: '开始工作', message: '开始工作' },
  { label: '打开 Jenkins', message: '打开 Jenkins' },
];

/** 合并菜单项：点击后发送指令给 Agent 统一处理 */
const MERGE_TASKS = [
  { key: 'nova', label: '合并 nova' },
  { key: 'biz-solution', label: '合并 biz-solution' },
  { key: 'scm', label: '合并 scm' },
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

const DEPLOY_POLL_INTERVAL_MS = 3000;
const DEPLOY_POLL_MAX = 200; // 3 秒一次，约 10 分钟
const DEPLOY_CONSECUTIVE_FAIL_MAX = 4;
const DEPLOY_POLL_MIN_BEFORE_TERMINAL = 4;

/** 启动部署状态轮询，用于下拉部署与 Agent 触发部署后统一展示进度 */
function startDeployStatusPolling(
  apiBase: string,
  options: { queueUrl?: string; jobName?: string; label: string },
  setMessages: Dispatch<SetStateAction<Array<{ role: 'user' | 'assistant'; content: string; toolResults?: unknown[] }>>>,
  addLog: (line: string) => void,
  pollRef: MutableRefObject<ReturnType<typeof setInterval> | null>
): void {
  const { queueUrl, jobName, label } = options;
  if (!queueUrl && !jobName) return;
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
        if (pollCount < DEPLOY_POLL_MIN_BEFORE_TERMINAL) return;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        const msg = formatDeployMsg(status);
        addLog(status.status === 'success' ? '部署成功' : msg);
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
        return;
      }
      if (isFail) {
        consecutiveFail += 1;
        if (consecutiveFail >= DEPLOY_CONSECUTIVE_FAIL_MAX) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setMessages((prev) => [...prev, { role: 'assistant', content: '轮询失败：连续多次无法获取状态，请到 Jenkins 查看。' }]);
          addLog('部署轮询失败');
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
        setMessages((prev) => [...prev, { role: 'assistant', content: '轮询失败：连续多次请求异常，请到 Jenkins 查看。' }]);
        addLog('部署轮询失败');
      }
    }
  }, DEPLOY_POLL_INTERVAL_MS);
}

export function ChatPanel({ apiBase, addLog }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [deploySelect, setDeploySelect] = useState('');
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);
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

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);
    addLog(`发送: ${msg}`);
    try {
      const res = await fetch(`${apiBase}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data: AgentResult = await res.json();
      addLog(data.success ? 'Agent 完成' : `错误: ${data.error}`);
      const deployResult = data.toolResults?.find(
        (t): t is { tool: string; result?: { queueUrl?: string; jobName?: string; message?: string } } =>
          (t as { tool: string }).tool === 'deploy_jenkins' && (t as { result?: unknown }).result != null
      ) as { tool: string; result?: { queueUrl?: string; jobName?: string; message?: string } } | undefined;
      const deployPayload = deployResult?.result;
      const hasDeployPoll = deployPayload && (deployPayload.queueUrl || deployPayload.jobName);
      const content = hasDeployPoll ? (deployPayload.message ?? '已触发，构建中…') : (data.success ? (data.text ?? '') : (data.error ?? '请求失败'));
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content,
          toolResults: data.toolResults,
        },
      ]);
      if (hasDeployPoll) {
        startDeployStatusPolling(
          apiBase,
          { queueUrl: deployPayload.queueUrl, jobName: deployPayload.jobName, label: '部署' },
          setMessages,
          addLog,
          deployPollRef
        );
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      addLog(`请求异常: ${err}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${err}` }]);
    } finally {
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
                    send(task.label);
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
