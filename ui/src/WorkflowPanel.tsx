/* AI 生成 By Peng.Guo */
import { useState } from 'react';

interface WorkflowPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
}

export function WorkflowPanel({ apiBase, addLog }: WorkflowPanelProps) {
  const [workflows] = useState<string[]>(['start-work']);
  const [running, setRunning] = useState(false);

  const runWorkflow = async (name: string) => {
    setRunning(true);
    addLog(`执行工作流: ${name}`);
    try {
      const res = await fetch(`${apiBase}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `执行工作流 ${name}` }),
      });
      const data = await res.json();
      addLog(data.success ? `工作流 ${name} 完成` : `失败: ${data.error}`);
    } catch (e) {
      addLog(`请求失败: ${e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section style={{ padding: 16, borderBottom: '1px solid #333' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Workflow</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {workflows.map((name) => (
          <li key={name} style={{ marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => runWorkflow(name)}
              disabled={running}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#0f3460',
                color: '#eaeaea',
                border: '1px solid #333',
                borderRadius: 6,
                cursor: running ? 'not-allowed' : 'pointer',
                textAlign: 'left',
              }}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
