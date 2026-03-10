/* AI 生成 By Peng.Guo */
interface LogsPanelProps {
  logs: string[];
}

export function LogsPanel({ logs }: LogsPanelProps) {
  return (
    <section
      style={{
        width: 300,
        minWidth: 200,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid #333',
        background: '#0d0d1a',
        overflow: 'hidden',
      }}
    >
      <h3 style={{ margin: 0, padding: 12, fontSize: 14, borderBottom: '1px solid #333', flexShrink: 0 }}>Logs</h3>
      <pre
        style={{
          margin: 0,
          padding: 12,
          fontSize: 12,
          fontFamily: 'monospace',
          color: '#888',
          flex: 1,
          overflow: 'auto',
        }}
      >
        {logs.length === 0 ? '—' : logs.join('\n')}
      </pre>
    </section>
  );
}
