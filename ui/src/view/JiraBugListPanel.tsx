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

  useEffect(() => {
    setPayload(initial);
    setError(null);
  }, [initial]);

  const refresh = useCallback(async () => {
    if (!apiBase || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const fetcher = listKind === 'inProgress' ? fetchInProgressBugs : fetchTodoBugs;
      const next = await fetcher(apiBase);
      setPayload(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [apiBase, listKind, refreshing]);

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
        </span>
        {refreshable ? (
          <Button
            themeTokens={themeTokens}
            variant="outline"
            size="sm"
            disabled={refreshing || !apiBase}
            loading={refreshing}
            onClick={() => void refresh()}
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
              <th style={{ width: '11%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>关键字</th>
              <th style={{ width: '26%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>摘要</th>
              <th style={{ width: '8%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>状态</th>
              <th style={{ width: '8%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>解决结果</th>
              <th style={{ width: '10%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>修复版本</th>
              <th style={{ width: '10%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>经办人</th>
              <th style={{ width: '14%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>开发人员</th>
              <th style={{ width: '13%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>特性</th>
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
                <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, whiteSpace: 'nowrap' }}>
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
                <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.resolution || '--'}</td>
                <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.fixVersion || '--'}</td>
                <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.assignee || '--'}</td>
                <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.developer ?? '—'}</td>
                <td style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, wordBreak: 'break-word' }}>{issue.feature ?? '—'}</td>
              </tr>
            ))}
            {issues.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '10px', color: themeTokens.textSecondary }}>
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
