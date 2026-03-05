/* AI 生成 By Peng.Guo */
import { useState } from 'react';

type AgentResult = { success: boolean; text?: string; toolResults?: unknown[]; error?: string };

interface ChatPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
}

const QUICK_ACTIONS = [
  { label: '开始工作', message: '执行工作流 start-work' },
  { label: '打开开发环境', message: '打开开发环境' },
  { label: '打开 Jenkins', message: '打开 Jenkins' },
];

export function ChatPanel({ apiBase, addLog }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; toolResults?: unknown[] }>>([]);

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
    }
  };

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
      </div>
      <div style={{ flex: 1, overflow: 'auto', marginBottom: 12, background: '#0d0d1a', borderRadius: 8, padding: 12 }}>
        {messages.length === 0 && (
          <p style={{ color: '#888' }}>[Chat] 输入指令或点击上方快捷按钮，例如：开始工作、打开开发环境、部署 order-service</p>
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
        {loading && <p style={{ color: '#888' }}>Loading...</p>}
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
