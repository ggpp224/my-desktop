/* AI 生成 By Peng.Guo */
interface LogsPanelProps {
  logs: string[];
}

export function LogsPanel({ logs }: LogsPanelProps) {
  return (
    <section style={{ height: 140, borderTop: '1px solid #333', overflow: 'auto', background: '#0d0d1a', padding: 12 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Logs</h3>
      <pre style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', color: '#888' }}>
        {logs.length === 0 ? '—' : logs.join('\n')}
      </pre>
    </section>
  );
}
