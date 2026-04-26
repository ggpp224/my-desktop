/* AI 生成 By Peng.Guo */
import { useEffect, useRef } from 'react';
import type { AppThemeTokens } from './domain/theme/appTheme';

interface LogsPanelProps {
  logs: string[];
  width?: number;
  onClear?: () => void;
  themeTokens: AppThemeTokens;
}

export function LogsPanel({ logs, width = 400, onClear, themeTokens }: LogsPanelProps) {
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
        borderLeft: `1px solid ${themeTokens.panelBorder}`,
        background: themeTokens.workspacePanelBackground,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 12px 12px', borderBottom: `1px solid ${themeTokens.panelBorder}`, flexShrink: 0 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: themeTokens.textPrimary }}>Logs</h3>
        <button
          type="button"
          onClick={onClear}
          title="清空 Logs"
          disabled={!onClear}
          style={{
            width: 28,
            height: 28,
            padding: 0,
            border: `1px solid ${themeTokens.panelBorder}`,
            borderRadius: 6,
            background: onClear ? themeTokens.inputBackground : themeTokens.tabInactiveBackground,
            color: themeTokens.textSecondary,
            cursor: onClear ? 'pointer' : 'default',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ⊗
        </button>
      </div>
      <pre
        ref={preRef}
        style={{
          margin: 0,
          padding: 12,
          fontSize: 12,
          fontFamily: 'monospace',
          color: themeTokens.textSecondary,
          flex: 1,
          overflow: 'auto',
        }}
      >
        {logs.length === 0 ? '—' : logs.join('\n')}
      </pre>
    </section>
  );
}
