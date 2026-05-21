/* AI 生成 By Peng.Guo */
import type { AppThemeTokens } from './domain/theme/appTheme';
import { Button } from './view/Button';
import { useCommandCapability } from './viewmodel/capability/useCommandCapability';

interface CommandCapabilityPanelProps {
  apiBase: string;
  themeTokens: AppThemeTokens;
}

const BREAKDOWN_LABELS: Array<{ key: keyof import('./domain/capability/models').CommandCapabilityBreakdown; label: string }> = [
  { key: 'fixedCommands', label: '固定口令' },
  { key: 'jsonWorkflows', label: 'JSON 工作流' },
  { key: 'agentTools', label: 'Agent 工具' },
  { key: 'deployByProject', label: '部署' },
  { key: 'mergeByProject', label: '合并' },
  { key: 'terminalByProject', label: '内嵌终端' },
  { key: 'ideOpenByProject', label: 'IDE 打开' },
  { key: 'ideCloseByProject', label: 'IDE 关闭' },
  { key: 'jenkinsOpenByProject', label: 'Jenkins 页' },
  { key: 'startDevByProject', label: '启动开发' },
];

export function CommandCapabilityPanel({ apiBase, themeTokens }: CommandCapabilityPanelProps) {
  const { data, loading, error, reload } = useCommandCapability(apiBase);

  return (
    <section
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        padding: 16,
        boxSizing: 'border-box',
        background: themeTokens.appBackground,
        color: themeTokens.textPrimary,
      }}
    >
      <header style={{ marginBottom: 16, flexShrink: 0 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>支持指令明细</h2>
        <p style={{ margin: 0, fontSize: 13, color: themeTokens.textSecondary, lineHeight: 1.5 }}>
          每个独立指令计 1；流程内单步（如「启动 react18」）与同义多种说法不重复计入。
          {data && (
            <span style={{ marginLeft: 8, color: themeTokens.tabActiveBorder, fontWeight: 600 }}>
              合计 {data.total} 条
            </span>
          )}
        </p>
        {error && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: themeTokens.statusWarning }}>
            {error}
            <Button themeTokens={themeTokens} variant="soft" size="sm" onClick={() => void reload()} style={{ marginLeft: 8 }}>
              重试
            </Button>
          </p>
        )}
      </header>

      {loading && !data && (
        <p style={{ fontSize: 13, color: themeTokens.textSecondary }}>加载中…</p>
      )}

      {data && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 20,
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${themeTokens.panelBorder}`,
              background: themeTokens.workspacePanelSubtleBackground,
            }}
          >
            {BREAKDOWN_LABELS.map(({ key, label }) => (
              <span
                key={key}
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: themeTokens.tabInactiveBackground,
                  color: themeTokens.textSecondary,
                }}
              >
                {label} <strong style={{ color: themeTokens.textPrimary }}>{data.breakdown[key]}</strong>
              </span>
            ))}
          </div>

          {data.sections.map((section) => (
            <details
              key={section.key}
              open
              style={{
                marginBottom: 12,
                border: `1px solid ${themeTokens.panelBorder}`,
                borderRadius: 8,
                background: themeTokens.workspacePanelSubtleBackground,
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  padding: '10px 12px',
                  fontSize: 14,
                  fontWeight: 600,
                  listStyle: 'none',
                  userSelect: 'none',
                }}
              >
                {section.title}
                <span style={{ marginLeft: 8, fontWeight: 500, color: themeTokens.tabActiveBorder }}>
                  {section.items.length}
                </span>
                {section.description && (
                  <span
                    style={{
                      display: 'block',
                      marginTop: 4,
                      fontSize: 11,
                      fontWeight: 400,
                      color: themeTokens.textSecondary,
                    }}
                  >
                    {section.description}
                  </span>
                )}
              </summary>
              <ul
                style={{
                  margin: 0,
                  padding: '0 12px 12px 28px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: themeTokens.textPrimary,
                }}
              >
                {section.items.map((entry, index) => (
                  <li key={`${section.key}-${index}-${entry.label}`} style={{ marginBottom: 2 }}>
                    <code style={{ fontSize: 12 }}>{entry.label}</code>
                    {entry.note && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: themeTokens.textSecondary }}>
                        {entry.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
