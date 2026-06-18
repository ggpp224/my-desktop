/* AI 生成 By Peng.Guo */
import { useEffect, useRef, useState } from 'react';
import type { AgentChatLlmBody } from './domain/llm/agentLlmRequest';
import type { AppThemeTokens } from './domain/theme/appTheme';
import type { TechDigestReport } from './domain/trends/models';
import { MarkdownRenderer } from './view/MarkdownRenderer';
import { IconButton } from './view/IconButton';
import { TechDigestSubTabNav } from './view/trends/TechDigestSubTabNav';
import { useTechDigest } from './viewmodel/trends/useTechDigest';

type TechDigestPanelProps = {
  apiBase: string;
  themeTokens: AppThemeTokens;
  agentChatLlmBody?: AgentChatLlmBody;
};

const DIGEST_DESCRIPTION =
  '「今日」：GitHub 日榜 + HN + Reddit 日榜，独立刷新。「中长周期」：一键顺序刷新本月与半年度（各独立抓取与分析），缓解 Reddit 限流。';

function formatGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function buildInfoMeta(report: TechDigestReport | null): string | null {
  if (!report) return null;
  return `上次更新：${formatGeneratedAt(report.generatedAt)} · 模型 ${report.llmModel}`;
}

const TOOLBAR_ICON_STYLE = { width: 28, height: 28, minWidth: 28, borderRadius: '50%' } as const;

function ReportBlock({
  title,
  report,
  themeTokens,
}: {
  title: string;
  report: TechDigestReport | null;
  themeTokens: AppThemeTokens;
}) {
  const meta = buildInfoMeta(report);
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>{title}</h3>
        {meta && <p style={{ margin: 0, fontSize: 12, color: themeTokens.textSecondary }}>{meta}</p>}
      </div>
      {report ? (
        <MarkdownRenderer markdown={report.reportMarkdown} themeTokens={themeTokens} variant="tech-digest" />
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: themeTokens.textSecondary }}>暂无缓存，请点击右上角刷新。</p>
      )}
    </div>
  );
}

export function TechDigestPanel({ apiBase, themeTokens, agentChatLlmBody }: TechDigestPanelProps) {
  const digest = useTechDigest(apiBase, agentChatLlmBody);
  const [infoOpen, setInfoOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const emptyDaily = !digest.loading && !digest.dailyReport && !digest.errorDaily;
  const emptyLongTerm =
    !digest.loading && !digest.monthlyReport && !digest.halfYearReport && !digest.errorLongTerm;

  useEffect(() => {
    if (!infoOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [infoOpen]);

  const infoMeta = buildInfoMeta(
    digest.activeInnerTab === 'daily' ? digest.dailyReport : digest.monthlyReport ?? digest.halfYearReport
  );

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
      <style>{`@keyframes tech-digest-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <TechDigestSubTabNav
          activeTab={digest.activeInnerTab}
          themeTokens={themeTokens}
          onTabChange={digest.setActiveInnerTab}
        />

        <div
          ref={toolbarRef}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
            flexShrink: 0,
          }}
        >
        <IconButton
          themeTokens={themeTokens}
          icon={
            <span style={{ animation: digest.refreshing ? 'tech-digest-spin 0.9s linear infinite' : undefined }}>
              ↻
            </span>
          }
          title={
            digest.refreshing
              ? '刷新中…'
              : digest.activeInnerTab === 'daily'
                ? '刷新今日'
                : '刷新本月与半年度'
          }
          ariaLabel={digest.refreshing ? '刷新中' : '手动刷新'}
          variant="soft"
          size="icon"
          disabled={digest.refreshing || !apiBase}
          onClick={() => void digest.refresh()}
          style={TOOLBAR_ICON_STYLE}
        />
        {digest.refreshing && (
          <IconButton
            themeTokens={themeTokens}
            icon="×"
            title="取消刷新"
            ariaLabel="取消刷新"
            variant="ghost"
            size="icon"
            onClick={digest.cancelRefresh}
            style={TOOLBAR_ICON_STYLE}
          />
        )}
        <IconButton
          themeTokens={themeTokens}
          icon="ⓘ"
          title="功能说明"
          ariaLabel="功能说明"
          variant={infoOpen ? 'solid' : 'soft'}
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            setInfoOpen((v) => !v);
          }}
          style={TOOLBAR_ICON_STYLE}
        />
        {infoOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 8,
              width: 360,
              maxWidth: 'calc(100vw - 32px)',
              background: themeTokens.tabInactiveBackground,
              border: `1px solid ${themeTokens.tabInactiveBorder}`,
              borderRadius: 8,
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              padding: 12,
              zIndex: 100,
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.6, color: themeTokens.textSecondary }}>{DIGEST_DESCRIPTION}</div>
            {infoMeta && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: `1px solid ${themeTokens.tabInactiveBorder}`,
                  fontSize: 12,
                  color: themeTokens.textPrimary,
                }}
              >
                {infoMeta}
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {digest.refreshing && digest.progress && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: themeTokens.tabActiveBorder, flexShrink: 0 }}>
          {digest.progress}
        </p>
      )}

      {digest.error && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#e57373', flexShrink: 0 }}>{digest.error}</p>
      )}

      {digest.loading && !digest.dailyReport && !digest.monthlyReport && !digest.halfYearReport && (
        <p style={{ fontSize: 13, color: themeTokens.textSecondary }}>加载缓存…</p>
      )}

      {/* 今日子页签：常驻挂载 */}
      <div
        style={{
          display: digest.activeInnerTab === 'daily' ? 'flex' : 'none',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {emptyDaily && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: themeTokens.textSecondary,
              fontSize: 14,
              textAlign: 'center',
              padding: 24,
            }}
          >
            暂无今日报告。点击右上角刷新抓取今日热点（约 1～3 分钟）。
          </div>
        )}
        {digest.dailyReport && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              border: `1px solid ${themeTokens.inputBorder}`,
              borderRadius: 8,
              padding: 16,
              background: themeTokens.workspacePanelBackground,
            }}
          >
            <MarkdownRenderer
              markdown={digest.dailyReport.reportMarkdown}
              themeTokens={themeTokens}
              variant="tech-digest"
            />
          </div>
        )}
      </div>

      {/* 中长周期子页签：常驻挂载 */}
      <div
        style={{
          display: digest.activeInnerTab === 'longterm' ? 'flex' : 'none',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {emptyLongTerm && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: themeTokens.textSecondary,
              fontSize: 14,
              textAlign: 'center',
              padding: 24,
            }}
          >
            暂无中长周期报告。点击右上角刷新将顺序抓取本月与半年度（约 3～6 分钟）。
          </div>
        )}
        {!emptyLongTerm && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              border: `1px solid ${themeTokens.inputBorder}`,
              borderRadius: 8,
              padding: 16,
              background: themeTokens.workspacePanelBackground,
            }}
          >
            <ReportBlock title="本月" report={digest.monthlyReport} themeTokens={themeTokens} />
            <ReportBlock title="半年度" report={digest.halfYearReport} themeTokens={themeTokens} />
          </div>
        )}
      </div>

      {digest.refreshing && digest.streamPreview && (
        <details style={{ marginTop: 8, flexShrink: 0, fontSize: 12, color: themeTokens.textSecondary }}>
          <summary>LLM 流式预览</summary>
          <pre
            style={{
              margin: '8px 0 0',
              maxHeight: 120,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {digest.streamPreview.slice(-2000)}
          </pre>
        </details>
      )}
    </section>
  );
}
