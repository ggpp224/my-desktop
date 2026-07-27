/* AI 生成 By Peng.Guo */
import { useCallback, useEffect, useState } from 'react';
import type { AppThemeTokens } from '../domain/theme/appTheme';
import { fetchTodoBugs, fetchInProgressBugs, type JiraBugPayload } from '../infrastructure/jira/todoBugsApi';
import { Button } from './Button';

type JiraBugListKind = 'todo' | 'inProgress';

type JiraBugListPanelProps = {
  initial: JiraBugPayload;
  themeTokens: AppThemeTokens;
  apiBase?: string;
  refreshable?: boolean;
  listKind?: JiraBugListKind;
};

export function JiraBugListPanel({
  initial,
  themeTokens,
  apiBase,
  refreshable = false,
  listKind = 'todo',
}: JiraBugListPanelProps) {
  const [payload, setPayload] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issues = payload.issues ?? [];
  const iteration = payload.iteration;
  const selectedVersion = (iteration?.selected ?? '').trim();
  const showProcessedColumn = listKind === 'inProgress';
  const columnCount = showProcessedColumn ? 9 : 8;

  const iterationButtons: Array<{ key: 'previous' | 'current' | 'next'; version: string; hint: string }> = [];
  if (iteration?.previous) iterationButtons.push({ key: 'previous', version: iteration.previous, hint: '前一迭代' });
  if (iteration?.current) iterationButtons.push({ key: 'current', version: iteration.current, hint: '当前迭代' });
  if (iteration?.next) iterationButtons.push({ key: 'next', version: iteration.next, hint: '下一迭代' });

  useEffect(() => {
    setPayload(initial);
    setError(null);
  }, [initial]);

  const loadByFixVersion = useCallback(
    async (fixVersion?: string) => {
      if (!apiBase || refreshing) return;
      setRefreshing(true);
      setError(null);
      try {
        const fetcher = listKind === 'inProgress' ? fetchInProgressBugs : fetchTodoBugs;
        const next = await fetcher(apiBase, { fixVersion });
        setPayload(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setRefreshing(false);
      }
    },
    [apiBase, listKind, refreshing],
  );

  return (
    <>
      <style>{`@keyframes jira-bug-list-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          marginTop: 8,
          background: themeTokens.workspacePanelSubtleBackground,
          borderRadius: 6,
          border: `1px solid ${themeTokens.inputBorder}`,
          overflow: 'hidden',
        }}
      >
        {iterationButtons.length > 0 ? (
          <div
            style={{
              padding: '8px 10px',
              borderBottom: `1px solid ${themeTokens.inputBorder}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {iterationButtons.map((item) => {
              const selected = item.version === selectedVersion;
              return (
                <Button
                  key={item.key}
                  themeTokens={themeTokens}
                  variant={selected ? 'solid' : 'outline'}
                  size="sm"
                  selected={selected}
                  disabled={refreshing || !apiBase || !refreshable}
                  onClick={() => void loadByFixVersion(item.version)}
                  title={`${item.hint} ${item.version}`}
                  ariaLabel={`${item.hint} ${item.version}`}
                  style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                >
                  {item.version}
                </Button>
              );
            })}
          </div>
        ) : null}
        <div
          style={{
            padding: '8px 10px',
            fontSize: 12,
            color: themeTokens.textSecondary,
            borderBottom: `1px solid ${themeTokens.inputBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>
            共 {payload.total ?? issues.length} 条，当前展示 {issues.length} 条
            {selectedVersion ? ` · 迭代 ${selectedVersion}` : ''}
          </span>
          {refreshable ? (
            <Button
              themeTokens={themeTokens}
              variant="outline"
              size="sm"
              disabled={refreshing || !apiBase}
              loading={refreshing}
              onClick={() => void loadByFixVersion(selectedVersion || undefined)}
              title={refreshing ? '刷新中…' : '刷新列表'}
              ariaLabel={refreshing ? '刷新中' : listKind === 'inProgress' ? '刷新处理中 bug 列表' : '刷新待办 bug 列表'}
              style={{ flexShrink: 0, gap: 4 }}
            >
              <span style={{ animation: refreshing ? 'jira-bug-list-spin 0.9s linear infinite' : undefined, display: refreshing ? 'none' : 'inline' }}>↻</span>
              刷新
            </Button>
          ) : null}
        </div>
        {error ? (
          <div style={{ padding: '8px 10px', fontSize: 12, color: themeTokens.statusError, borderBottom: `1px solid ${themeTokens.inputBorder}` }}>
            刷新失败：{error}
          </div>
        ) : null}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: themeTokens.textPrimary, tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: themeTokens.workspacePanelBackground }}>
                <th style={{ width: 100, minWidth: 100, textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>关键字</th>
                <th style={{ width: showProcessedColumn ? '22%' : '26%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>摘要</th>
                <th style={{ width: '8%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>状态</th>
                {showProcessedColumn ? (
                  <th style={{ width: '7%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>已处理</th>
                ) : null}
                <th style={{ width: '8%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>解决结果</th>
                <th style={{ width: '10%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>修复版本</th>
                <th style={{ width: '10%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>经办人</th>
                <th style={{ width: showProcessedColumn ? '13%' : '14%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>开发人员</th>
                <th style={{ width: '12%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>特性</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, idx) => (
                <tr
                  key={`${issue.key ?? 'issue'}-${idx}`}
                  style={{
                    background: idx % 2 === 0 ? themeTokens.workspacePanelSubtleBackground : themeTokens.workspacePanelBackground,
                  }}
                >
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, whiteSpace: 'nowrap', minWidth: 100 }}>
                    {issue.url ? (
                      <a href={issue.url} target="_blank" rel="noreferrer" style={{ color: themeTokens.tabActiveBorder, textDecoration: 'none' }}>
                        {issue.key || '--'}
                      </a>
                    ) : (
                      issue.key || '--'
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.summary || '--'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.status || '--'}</td>
                  {showProcessedColumn ? (
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, whiteSpace: 'nowrap' }}>
                      {issue.processed ? (
                        <span style={{ color: themeTokens.statusError }}>是</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  ) : null}
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.resolution || '--'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.fixVersion || '--'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.assignee || '--'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.developer ?? '—'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.feature ?? '—'}</td>
                </tr>
              ))}
              {issues.length === 0 && (
                <tr>
                  <td colSpan={columnCount} style={{ padding: '10px', color: themeTokens.textSecondary }}>
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
