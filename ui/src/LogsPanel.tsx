/* AI 生成 By Peng.Guo */
import { useEffect, useRef } from 'react';

interface LogsPanelProps {
  logs: string[];
  width?: number;
}

export function LogsPanel({ logs, width = 400 }: LogsPanelProps) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <section
      style={{
        width,
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
        ref={preRef}
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
