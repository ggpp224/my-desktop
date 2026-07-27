/* AI 生成 By Peng.Guo */
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { buildSupportedCommandHints } from '@app-config/command-hints';
import { appendToolResultsToLogs } from './log-tools';
import { withJenkinsMarkdownLink } from './domain/deploy/jenkinsDeployDisplay';
import {
  extractCompositeWorkflowResult,
  formatCompositeWorkflowStepsMarkdown,
  getCompositeWorkflowHeadline,
  isCompositeNovaMergeDeployToolResults,
} from './domain/deploy/formatDeployToolSummary';
import type { DeployPollingTarget } from './domain/deploy/models';
import { LinkifiedText } from './view/LinkifiedText';
import { isLikelyMarkdown, MarkdownRenderer } from './view/MarkdownRenderer';
import { Button } from './view/Button';
import { IconButton } from './view/IconButton';
import { startDeployPolling } from './viewmodel/deploy/useDeployPolling';
import type { WorkTerminal } from './MyWorkPanel';
import {
  fetchAgentCurrentModel,
  fetchAgentOllamaInstalledModels,
  postSwitchAgentModel,
} from './infrastructure/agent/ollamaModelApi';
import { postAgentChatStream, type AgentToolProgressEvent } from './infrastructure/agent/agentChatStreamApi';
import type { AgentChatLlmBody, LlmRuntimeMode } from './domain/llm/agentLlmRequest';
import type { AppThemeTokens } from './domain/theme/appTheme';
import {
  buildTeamSummaryCopyLeadLine,
  buildWeeklyReportLeadLine,
  escapeHtmlForClipboard,
  type ReportCopyLlmContext,
} from './domain/llm/reportCopyLeadLine';
import { extractNovaUpgradeVerifyMarkdown } from './domain/workflow/novaUpgradeVerifyReport';
import { JiraBugListPanel } from './view/JiraBugListPanel';

type AgentTiming = { firstLLMMs?: number; tools?: { name: string; ms: number }[]; secondLLMMs?: number; tokenUsage?: { promptTokens?: number; completionTokens?: number } };
type AgentResult = {
  success: boolean;
  text?: string;
  toolResults?: unknown[];
  error?: string;
  aborted?: boolean;
  timing?: AgentTiming;
};
type ToolResultItem = { tool?: string; result?: unknown; error?: string };
type JiraBugItem = {
  key?: string;
  summary?: string;
  status?: string;
  resolution?: string;
  fixVersion?: string;
  assignee?: string;
  /** Jira 自定义字段「开发人员」 */
  developer?: string;
  /** Jira 自定义字段「特性」 */
  feature?: string;
  url?: string;
  /** 处理中 bug：当前用户是否已评论「已处理」 */
  processed?: boolean;
};
type JiraBugPayload = {
  total?: number;
  issues?: JiraBugItem[];
  iteration?: {
    previous?: string | null;
    current?: string;
    next?: string | null;
    selected?: string;
  };
};
type WeeklyReportPayload = {
  total?: number;
  jiraTitles?: string[];
  /** 旧版仅 Wiki / Markdown 字符串 */
  report?: string;
  reportHtml?: string;
  reportWiki?: string;
};
type WeeklyTeamSummaryPayload = {
  success?: boolean;
  reportHtml?: string;
  reportWiki?: string;
  wikiQuarter?: string;
  wikiWeekRange?: string;
  wikiTargetUrl?: string;
  wikiPageId?: string;
  sourceHtmlChars?: number;
};
type FetchWeeklyReportInfoPayload = {
  success?: boolean;
  error?: string;
  quarter?: string;
  weekRange?: string;
  rootUrl?: string;
  searchUrl?: string;
  targetUrl?: string;
  matchMode?: string;
  pageId?: string;
  pageTitle?: string;
  bodyStorage?: string;
  versionNumber?: number;
  versionWhen?: string;
};
type KnowledgeCitation = {
  path?: string;
  score?: number;
  snippet?: string;
};
type KnowledgeBasePayload = {
  success?: boolean;
  answer?: string;
  citations?: KnowledgeCitation[];
  docsCount?: number;
  model?: { chat?: string; embed?: string };
  error?: string;
};
type RebuildKnowledgeBasePayload = {
  success?: boolean;
  docsCount?: number;
  error?: string;
};
// AI 生成 By Peng.Guo
type ClearPrivateKnowledgeBasePayload = {
  success?: boolean;
  removedDocsDir?: string;
  removedIndexDir?: string;
  error?: string;
};
// AI 生成 By Peng.Guo
type KnowledgeDocItem = {
  id?: string;
  filePath?: string;
  relativePath?: string;
  size?: number;
  modifiedAt?: string;
};
type ListKnowledgeDocsPayload = {
  success?: boolean;
  docs?: KnowledgeDocItem[];
  totalCount?: number;
  error?: string;
};

// AI 生成 By Peng.Guo：实时 Token 监控（仅展示后端 SSE 上报的真实 usage）
type LiveTokenMetrics = {
  inputTokens: number;
  outputTokens: number;
  speedTps: number;
};

// AI 生成 By Peng.Guo：知识库重建专用实时反馈模型
type KnowledgeRebuildProgress = {
  cacheTotal: number;
  preprocessDone: Array<{ doc: string; status: 'done' | 'reused' }>;
  preprocessCurrent?: string;
  vectorDone: string[];
  vectorCurrent?: string;
};

type KbProgressEvent = {
  stage: 'preprocess' | 'vector' | 'summary';
  status: 'start' | 'done' | 'reused' | 'cache_total';
  doc?: string;
  count?: number;
};

function parseKbProgressEvent(message?: string): KbProgressEvent | null {
  const text = (message ?? '').trim();
  if (!text.startsWith('[KB_PROGRESS]')) return null;
  const stageMatch = text.match(/stage=(preprocess|vector|summary)/);
  const statusMatch = text.match(/status=(start|done|reused|cache_total)/);
  const summaryCountMatch = text.match(/count=(\d+)/);
  const docMatch = text.match(/doc=([^\s]+)/);
  const stage = stageMatch?.[1];
  const status = statusMatch?.[1];
  const doc = docMatch?.[1];
  if (!stage || !status) return null;
  if (stage === 'summary' && status === 'cache_total') {
    return {
      stage: 'summary',
      status: 'cache_total',
      count: Number(summaryCountMatch?.[1] ?? 0),
    };
  }
  if (!doc) return null;
  return {
    stage: stage as KbProgressEvent['stage'],
    status: status as KbProgressEvent['status'],
    doc,
  };
}

// AI 生成 By Peng.Guo：将引用来源压缩展示，避免次要信息占据过多空间
function getCitationLabel(sourcePath?: string): string {
  const raw = (sourcePath ?? '').trim();
  if (!raw) return '未知来源';
  const normalized = raw.replace(/\\/g, '/');
  const tail = normalized.split('/').filter(Boolean).slice(-2).join('/');
  return tail || normalized;
}

// AI 生成 By Peng.Guo：摘要行仅保留可扫读的一行文本预览
function getCitationPreview(snippet?: string): string {
  const text = (snippet ?? '')
    .replace(/[`#>*_\-\[\]\(\)!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '--';
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

interface ChatPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
  onStartWorkEmbedded: (payload: { sessionId: string; terminals: WorkTerminal[] }) => void;
  onOpenKnowledgeBase: () => void;
  onOpenCommandStats: () => void;
  onOpenMdToPdf: () => void;
  onOpenKnowledgeDoc: (sourcePath: string) => void;
  /** 本地 Ollama / 外部 Gemini */
  llmRuntimeMode: LlmRuntimeMode;
  /** 外部模式且已填 Key 时传入，随请求发往本机后端 */
  agentChatLlmBody?: AgentChatLlmBody;
  themeTokens: AppThemeTokens;
}

const QUICK_ACTIONS: Array<{ label: string; message: string }> = [
  { label: '开始工作', message: '开始工作' },
  { label: '开始工作（外部终端）', message: '开始工作，使用外部终端' },
  { label: 'tun', message: 'tun' },
  { label: '经办人bug', message: '经办人bug' },
  { label: '经办人任务', message: '经办人任务' },
  { label: '待办bug', message: '待办bug' },
  { label: '处理中bug', message: '处理中bug' },
];

/** 合并菜单项：走 SSE 流式接口，每步实时写入 Logs */
type MergeTaskItem = {
  key: string;
  label: string;
  path: string;
  /** 额外自然语言匹配（如「合并nova集测」） */
  patterns?: RegExp[];
};

/** 集测合并须优先于「合并 nova」，避免 /合并\s*nova/ 误匹配「合并 nova 集测」 */
function isNovaPretestMergeMessage(msg: string): boolean {
  return /合并\s*nova\s*集测/i.test(msg.trim());
}

/** 集测合并须优先于「合并 biz-solution」，避免误匹配 test 分支合并 */
function isBizSolutionPretestMergeMessage(msg: string): boolean {
  return /合并\s*biz-solution\s*集测/i.test(msg.trim());
}

/** 集测部署须优先于「部署 nova」，避免误用 test 分支 */
function isNovaPretestDeployMessage(msg: string): boolean {
  return /部署\s*nova(?:\s*集测|集测)/i.test(msg.trim());
}

/** 复合流程口令：必须走 Agent，不走前端 merge 快捷分流 */
function isCompositeNovaMergeDeployMessage(msg: string): boolean {
  return (msg ?? '').replace(/\s+/g, '').toLowerCase() === '合并nova并部署相关服务';
}

const MERGE_TASKS: MergeTaskItem[] = [
  {
    key: 'nova-pretest',
    label: '合并 nova 集测',
    path: '/merge/nova-pretest',
    patterns: [/合并\s*nova\s*集测/i],
  },
  { key: 'nova', label: '合并 nova', path: '/merge/nova' },
  {
    key: 'biz-solution-pretest',
    label: '合并 biz-solution 集测',
    path: '/merge/biz-solution-pretest',
    patterns: [/合并\s*biz-solution\s*集测/i],
  },
  { key: 'biz-solution', label: '合并 biz-solution', path: '/merge/biz-solution' },
  { key: 'scm', label: '合并 scm', path: '/merge/scm' },
];

function matchesMergeTaskMessage(msg: string, task: MergeTaskItem): boolean {
  const trimmed = msg.trim();
  if (task.key === 'nova' && isNovaPretestMergeMessage(trimmed)) return false;
  if (task.key === 'biz-solution' && isBizSolutionPretestMergeMessage(trimmed)) return false;
  if (msg === task.label) return true;
  if (task.key === 'nova-pretest') return isNovaPretestMergeMessage(trimmed);
  if (task.key === 'biz-solution-pretest') return isBizSolutionPretestMergeMessage(trimmed);
  if (task.key === 'nova') return /合并\s*nova(?!\s*集测)/i.test(trimmed);
  if (task.key === 'biz-solution') return /合并\s*biz-solution(?!\s*集测)/i.test(trimmed);
  if (new RegExp(`合并\\s*${task.key.replace(/-/g, '\\-')}`, 'i').test(trimmed)) return true;
  return (task.patterns ?? []).some((p) => p.test(trimmed));
}

function resolveMergeTask(msg: string): MergeTaskItem | undefined {
  if (isNovaPretestMergeMessage(msg)) {
    return MERGE_TASKS.find((t) => t.key === 'nova-pretest');
  }
  if (isBizSolutionPretestMergeMessage(msg)) {
    return MERGE_TASKS.find((t) => t.key === 'biz-solution-pretest');
  }
  return MERGE_TASKS.find((t) => matchesMergeTaskMessage(msg, t));
}

/** 指令输入历史最多条数，支持 ↑↓ 切换 */
const INPUT_HISTORY_MAX = 10;
const STREAM_FLUSH_INTERVAL_MS = 80;

// AI 生成 By Peng.Guo：仅在下拉中展示可对话模型，过滤 embedding / rerank 等非聊天模型。
function isLikelyChatModelName(modelName: string): boolean {
  const name = modelName.trim().toLowerCase();
  if (!name) return false;
  const nonChatKeywords = [
    'embed',
    'embedding',
    'bge',
    'e5-',
    'mxbai',
    'rerank',
    'reranker',
    'colbert',
  ];
  return !nonChatKeywords.some((keyword) => name.includes(keyword));
}

type ProjectInfo = {
  codes: string[];
  jenkins?: { jobName: string; defaultBranch: string };
  merge?: { targetBranch: string; runRelease: boolean };
};

function buildCommandHints(projects: ProjectInfo[], inputHistory: string[]): string[] {
  return buildSupportedCommandHints(projects, inputHistory);
}

/** 仅保留指令与 Agent 文本回复，不展示专用结果 UI */
const TOOL_RESULT_UI_SUPPRESSED = new Set([
  'search_my_bugs',
  'search_online_bugs',
  'get_cursor_usage',
  'get_cursor_today_usage',
]);

function shouldSuppressToolResultDisplay(toolResults?: unknown[]): boolean {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return false;
  return toolResults.every((item) => {
    const tool = (item as ToolResultItem | undefined)?.tool;
    return typeof tool === 'string' && TOOL_RESULT_UI_SUPPRESSED.has(tool);
  });
}

function extractTodoBugsResult(toolResults?: unknown[]): JiraBugPayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      (item as ToolResultItem | undefined)?.tool === 'search_todo_bugs' &&
      (item as ToolResultItem | undefined)?.result,
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  const payload = row.result as JiraBugPayload;
  if (!Array.isArray(payload.issues)) return null;
  return payload;
}

function extractInProgressBugsResult(toolResults?: unknown[]): JiraBugPayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      (item as ToolResultItem | undefined)?.tool === 'search_in_progress_bugs' &&
      (item as ToolResultItem | undefined)?.result,
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  const payload = row.result as JiraBugPayload;
  if (!Array.isArray(payload.issues)) return null;
  return payload;
}

function extractMyBugsResult(toolResults?: unknown[]): JiraBugPayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      ((item as ToolResultItem | undefined)?.tool === 'search_my_tasks' ||
        (item as ToolResultItem | undefined)?.tool === 'search_assignee_bugs' ||
        (item as ToolResultItem | undefined)?.tool === 'search_assignee_tasks' ||
        (item as ToolResultItem | undefined)?.tool === 'search_weekly_done_tasks' ||
        (item as ToolResultItem | undefined)?.tool === 'search_weekly_handoff_bugs') &&
      (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  const payload = row.result as JiraBugPayload;
  if (!Array.isArray(payload.issues)) return null;
  return payload;
}

function extractWeeklyReportResult(toolResults?: unknown[]): WeeklyReportPayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      (item as ToolResultItem | undefined)?.tool === 'write_weekly_report' &&
      (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  return row.result as WeeklyReportPayload;
}

function extractWeeklyTeamSummaryResult(toolResults?: unknown[]): WeeklyTeamSummaryPayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      (item as ToolResultItem | undefined)?.tool === 'generate_weekly_team_summary' &&
      (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  return row.result as WeeklyTeamSummaryPayload;
}

function extractFetchWeeklyReportInfoResult(toolResults?: unknown[]): FetchWeeklyReportInfoPayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      (item as ToolResultItem | undefined)?.tool === 'fetch_weekly_report_info' &&
      (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  return row.result as FetchWeeklyReportInfoPayload;
}

function extractKnowledgeBaseResult(toolResults?: unknown[]): KnowledgeBasePayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      (item as ToolResultItem | undefined)?.tool === 'query_knowledge_base' &&
      (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  return row.result as KnowledgeBasePayload;
}

function extractRebuildKnowledgeBaseResult(toolResults?: unknown[]): RebuildKnowledgeBasePayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      ((item as ToolResultItem | undefined)?.tool === 'rebuild_knowledge_base_index' ||
        (item as ToolResultItem | undefined)?.tool === 'incremental_rebuild_knowledge_base_index') &&
      (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  return row.result as RebuildKnowledgeBasePayload;
}

// AI 生成 By Peng.Guo
function extractClearPrivateKnowledgeBaseResult(toolResults?: unknown[]): ClearPrivateKnowledgeBasePayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      (item as ToolResultItem | undefined)?.tool === 'clear_private_knowledge_base' &&
      (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  return row.result as ClearPrivateKnowledgeBasePayload;
}

// AI 生成 By Peng.Guo
function extractListKnowledgeDocsResult(toolResults?: unknown[]): ListKnowledgeDocsPayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      (item as ToolResultItem | undefined)?.tool === 'list_knowledge_docs' &&
      (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  return row.result as ListKnowledgeDocsPayload;
}

/* AI 生成 By Peng.Guo：Confluence 新版/表格粘贴优先写 text/html，纯文本槽位放 Wiki 作降级；HTML 顶部带与纯文本一致的首行说明 */
async function copyWeeklyReportToClipboard(leadLine: string, htmlFragment: string, wikiPlain: string, leadColor: string): Promise<void> {
  const leadHtml = `<p style="margin:0 0 0.75em;font-size:13px;color:${leadColor};">${escapeHtmlForClipboard(leadLine)}</p>`;
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${leadHtml}${htmlFragment}</body></html>`;
  const plain = `${leadLine}\n\n${wikiPlain}`.trim();
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([fullHtml], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}

function renderToolResults(
  toolResults: unknown[] | undefined,
  onTip: (message: string) => void,
  copyCtx: ReportCopyLlmContext,
  themeTokens: AppThemeTokens,
  onOpenKnowledgeDoc?: (sourcePath: string) => void,
  apiBase?: string,
) {
  const novaVerifyMd = extractNovaUpgradeVerifyMarkdown(toolResults);
  if (novaVerifyMd) {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: themeTokens.textSecondary, marginBottom: 6 }}>
          package.json 核对报告（Markdown）
        </div>
        <div
          style={{
            background: themeTokens.workspacePanelSubtleBackground,
            borderRadius: 6,
            border: `1px solid ${themeTokens.inputBorder}`,
            padding: 10,
            maxHeight: 480,
            overflow: 'auto',
          }}
        >
          <MarkdownRenderer markdown={novaVerifyMd} themeTokens={themeTokens} />
        </div>
      </div>
    );
  }
  // AI 生成 By Peng.Guo：列出知识库文档
  const listDocsResult = extractListKnowledgeDocsResult(toolResults);
  if (listDocsResult) {
    const docs = Array.isArray(listDocsResult.docs) ? listDocsResult.docs : [];
    return (
      <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, borderRadius: 6, border: `1px solid ${themeTokens.inputBorder}`, padding: 10 }}>
        <div style={{ fontSize: 12, color: listDocsResult.success ? themeTokens.statusSuccess : themeTokens.statusError, marginBottom: 8 }}>
          {listDocsResult.success ? '知识库文档列表' : '获取文档列表失败'}
          {typeof listDocsResult.totalCount === 'number' ? (
            <span style={{ color: themeTokens.textSecondary, marginLeft: 8 }}>共 {listDocsResult.totalCount} 个文档</span>
          ) : null}
        </div>
        {listDocsResult.error ? (
          <div style={{ fontSize: 12, color: themeTokens.statusError, marginBottom: 8 }}>{listDocsResult.error}</div>
        ) : null}
        {docs.length > 0 ? (
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {docs.map((doc, idx) => (
              <div
                key={doc.id || idx}
                style={{
                  marginBottom: 8,
                  padding: 8,
                  borderRadius: 4,
                  background: themeTokens.workspacePanelBackground,
                  border: `1px solid ${themeTokens.inputBorder}`,
                }}
              >
                <div style={{ fontSize: 12, color: themeTokens.tabActiveBorder, marginBottom: 4 }}>
                  {doc.relativePath || doc.filePath || '未知路径'}
                </div>
                <div style={{ fontSize: 11, color: themeTokens.textSecondary, display: 'flex', gap: 12 }}>
                  {typeof doc.size === 'number' ? (
                    <span>大小: {(doc.size / 1024).toFixed(2)} KB</span>
                  ) : null}
                  {doc.modifiedAt ? (
                    <span>修改时间: {new Date(doc.modifiedAt).toLocaleString('zh-CN')}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const rebuildKb = extractRebuildKnowledgeBaseResult(toolResults);
  if (rebuildKb) {
    return (
      <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, borderRadius: 6, border: `1px solid ${themeTokens.inputBorder}`, padding: 10 }}>
        <div style={{ fontSize: 12, color: rebuildKb.success ? themeTokens.statusSuccess : themeTokens.statusError, marginBottom: 8 }}>
          {rebuildKb.success ? '知识库索引重建完成' : '知识库索引重建失败'}
        </div>
        {typeof rebuildKb.docsCount === 'number' ? (
          <div style={{ fontSize: 12, color: themeTokens.textPrimary }}>纳入文档数：{rebuildKb.docsCount}</div>
        ) : null}
        {rebuildKb.error ? <div style={{ fontSize: 12, color: themeTokens.statusError, marginTop: 6 }}>{rebuildKb.error}</div> : null}
      </div>
    );
  }
  const clearKb = extractClearPrivateKnowledgeBaseResult(toolResults);
  if (clearKb) {
    return (
      <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, borderRadius: 6, border: `1px solid ${themeTokens.inputBorder}`, padding: 10 }}>
        <div style={{ fontSize: 12, color: clearKb.success ? themeTokens.statusSuccess : themeTokens.statusError, marginBottom: 8 }}>
          {clearKb.success ? '私人知识库已清除' : '清除私人知识库失败'}
        </div>
        {clearKb.removedDocsDir ? (
          <div style={{ fontSize: 12, color: themeTokens.textPrimary }}>文档目录：{clearKb.removedDocsDir}</div>
        ) : null}
        {clearKb.removedIndexDir ? (
          <div style={{ fontSize: 12, color: themeTokens.textPrimary, marginTop: 4 }}>索引目录：{clearKb.removedIndexDir}</div>
        ) : null}
        {clearKb.error ? <div style={{ fontSize: 12, color: themeTokens.statusError, marginTop: 6 }}>{clearKb.error}</div> : null}
      </div>
    );
  }
  const kbResult = extractKnowledgeBaseResult(toolResults);
  if (kbResult) {
    const citations = Array.isArray(kbResult.citations) ? kbResult.citations : [];
    const hasAnswer = typeof kbResult.answer === 'string' && kbResult.answer.trim().length > 0;
    return (
      <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, borderRadius: 6, border: `1px solid ${themeTokens.inputBorder}`, padding: 10 }}>
        <div style={{ fontSize: 12, color: kbResult.success ? themeTokens.statusSuccess : themeTokens.statusError, marginBottom: 8 }}>
          {kbResult.success ? '知识库命中' : '知识库查询失败'}
          {typeof kbResult.docsCount === 'number' ? <span style={{ color: themeTokens.textSecondary, marginLeft: 8 }}>文档数：{kbResult.docsCount}</span> : null}
          {kbResult.model?.chat ? (
            <span style={{ color: themeTokens.textSecondary, marginLeft: 8 }}>
              chat={kbResult.model.chat} / embed={kbResult.model.embed ?? '--'}
            </span>
          ) : null}
        </div>
        {kbResult.error ? <div style={{ fontSize: 12, color: themeTokens.statusError, marginBottom: 8 }}>{kbResult.error}</div> : null}
        {hasAnswer ? (
          <div style={{ marginBottom: citations.length ? 10 : 0 }}>
            {isLikelyMarkdown(kbResult.answer ?? '') ? (
              <MarkdownRenderer markdown={kbResult.answer ?? ''} themeTokens={themeTokens} />
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', color: themeTokens.textPrimary, fontSize: 13, lineHeight: 1.65 }}>{kbResult.answer}</div>
            )}
          </div>
        ) : null}
        {citations.length > 0 ? (
          <div>
            <div style={{ fontSize: 12, color: themeTokens.textSecondary, marginBottom: 6 }}>
              引用来源 <span style={{ color: themeTokens.textSecondary }}>（次要信息，默认折叠）</span>
            </div>
            {citations.slice(0, 7).map((item, idx) => (
              <div
                key={`${item.path ?? 'source'}-${idx}`}
                style={{ marginBottom: 6, padding: '6px 8px', borderRadius: 4, background: themeTokens.workspacePanelBackground, border: `1px solid ${themeTokens.inputBorder}` }}
              >
                <div style={{ fontSize: 12, color: themeTokens.tabActiveBorder, marginBottom: 2 }} title={item.path || '未知来源'}>
                  {item.path ? (
                    <Button
                      themeTokens={themeTokens}
                      type="button"
                      onClick={() => onOpenKnowledgeDoc?.(item.path ?? '')}
                      variant="text"
                      size="sm"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: themeTokens.tabActiveBorder,
                        padding: 0,
                        fontSize: 12,
                        textDecoration: 'underline',
                        height: 'auto',
                      }}
                    >
                      {getCitationLabel(item.path)}
                    </Button>
                  ) : (
                    getCitationLabel(item.path)
                  )}
                  {typeof item.score === 'number' ? <span style={{ color: themeTokens.textSecondary, marginLeft: 6 }}>score={item.score.toFixed(3)}</span> : null}
                </div>
                <div style={{ color: themeTokens.textSecondary, fontSize: 12, lineHeight: 1.45 }}>{getCitationPreview(item.snippet)}</div>
                {item.snippet ? (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: 12, color: themeTokens.textSecondary, cursor: 'pointer', userSelect: 'none' }}>展开片段</summary>
                    <div style={{ marginTop: 6 }}>
                      <MarkdownRenderer markdown={item.snippet} themeTokens={themeTokens} />
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  const weeklyReport = extractWeeklyReportResult(toolResults);
  const reportHtml = weeklyReport?.reportHtml;
  const reportWiki = weeklyReport?.reportWiki ?? weeklyReport?.report;
  if (weeklyReport && (reportHtml || reportWiki)) {
    const titleCount = Array.isArray(weeklyReport.jiraTitles) ? weeklyReport.jiraTitles.length : weeklyReport.total ?? 0;
    const reportLead = buildWeeklyReportLeadLine(titleCount, copyCtx);
    return (
      <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, borderRadius: 6, border: `1px solid ${themeTokens.inputBorder}`, padding: 10 }}>
        <div style={{ fontSize: 12, color: themeTokens.textSecondary, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>
            {reportLead}
            {reportHtml ? <span style={{ color: themeTokens.textSecondary, marginLeft: 8 }}>（复制带富文本，便于贴表格/新版编辑器）</span> : null}
          </span>
          <Button
            themeTokens={themeTokens}
            type="button"
            onClick={async () => {
              try {
                if (reportHtml) {
                  await copyWeeklyReportToClipboard(reportLead, reportHtml, reportWiki ?? '', themeTokens.textSecondary);
                  onTip('已复制：富文本 HTML + 纯文本（Wiki）');
                } else {
                  await navigator.clipboard.writeText(`${reportLead}\n\n${reportWiki ?? ''}`.trim());
                  onTip('周报已复制到剪贴板');
                }
              } catch {
                onTip('复制失败，请手动复制');
              }
            }}
            variant="solid"
            size="sm"
          >
            复制周报
          </Button>
        </div>
        {reportHtml ? (
          <>
            <style>
              {`
              .weekly-report-html { font-size: 13px; line-height: 1.55; color: ${themeTokens.textPrimary}; }
              .weekly-report-html h1 { font-size: 1.2rem; margin: 0.35em 0 0.15em; font-weight: 700; color: ${themeTokens.textPrimary}; }
              .weekly-report-html h2 { font-size: 1.05rem; margin: 0.3em 0 0.12em; font-weight: 600; color: ${themeTokens.textPrimary}; }
              .weekly-report-html h3 { font-size: 1rem; margin: 0.25em 0 0.1em; color: ${themeTokens.textSecondary}; }
              .weekly-report-html ul, .weekly-report-html ol { margin: 0.2em 0 0.3em 1em; padding: 0; }
              .weekly-report-html li { margin: 0.1em 0; }
              .weekly-report-html p { margin: 0.15em 0; }
              .weekly-report-html pre { background: ${themeTokens.workspacePanelBackground}; padding: 8px; border-radius: 4px; overflow: auto; font-size: 12px; }
              .weekly-report-html a { color: ${themeTokens.tabActiveBorder}; }
            `}
            </style>
            <div
              className="weekly-report-html"
              style={{ maxHeight: 480, overflow: 'auto' }}
              // eslint-disable-next-line react/no-danger -- 内容由本地工具链从 Markdown 生成并已 escape 片段
              dangerouslySetInnerHTML={{ __html: reportHtml }}
            />
          </>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', color: themeTokens.textPrimary, fontSize: 13, lineHeight: 1.7 }}>{reportWiki}</div>
        )}
      </div>
    );
  }
  const teamSummary = extractWeeklyTeamSummaryResult(toolResults);
  const teamReportHtml = teamSummary?.reportHtml;
  const teamReportWiki = teamSummary?.reportWiki;
  if (teamSummary && teamSummary.success === true && (teamReportHtml || teamReportWiki)) {
    const meta = [teamSummary.wikiQuarter, teamSummary.wikiWeekRange].filter(Boolean).join(' · ');
    const teamCopyLead = buildTeamSummaryCopyLeadLine(copyCtx);
    const teamSubLine = `本周组内总结${meta ? ` · ${meta}` : ''} · 来源 HTML 约 ${teamSummary.sourceHtmlChars ?? 0} 字符`;
    return (
      <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, borderRadius: 6, border: `1px solid ${themeTokens.inputBorder}`, padding: 10 }}>
        <div style={{ fontSize: 12, color: themeTokens.textSecondary, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ lineHeight: 1.45, flex: 1, minWidth: 0 }}>
            <span style={{ color: themeTokens.textPrimary }}>{teamCopyLead}</span>
            <div style={{ color: themeTokens.textSecondary, fontSize: 11, marginTop: 4 }}>{teamSubLine}</div>
            {teamReportHtml ? <span style={{ color: themeTokens.textSecondary, fontSize: 11 }}>（复制带富文本）</span> : null}
          </span>
          <Button
            themeTokens={themeTokens}
            type="button"
            onClick={async () => {
              try {
                if (teamReportHtml) {
                  await copyWeeklyReportToClipboard(teamCopyLead, teamReportHtml, teamReportWiki ?? '', themeTokens.textSecondary);
                  onTip('已复制：富文本 HTML + 纯文本（Wiki）');
                } else {
                  await navigator.clipboard.writeText(`${teamCopyLead}\n\n${teamReportWiki ?? ''}`.trim());
                  onTip('组内总结已复制到剪贴板');
                }
              } catch {
                onTip('复制失败，请手动复制');
              }
            }}
            variant="solid"
            size="sm"
          >
            复制组内总结
          </Button>
        </div>
        {teamSummary.wikiTargetUrl ? (
          <div style={{ fontSize: 11, color: themeTokens.textSecondary, marginBottom: 8 }}>
            <a href={teamSummary.wikiTargetUrl} target="_blank" rel="noreferrer" style={{ color: themeTokens.tabActiveBorder }}>
              打开 wiki 源页
            </a>
          </div>
        ) : null}
        {teamReportHtml ? (
          <>
            <style>
              {`
              .weekly-report-html { font-size: 13px; line-height: 1.55; color: ${themeTokens.textPrimary}; }
              .weekly-report-html h1 { font-size: 1.2rem; margin: 0.35em 0 0.15em; font-weight: 700; color: ${themeTokens.textPrimary}; }
              .weekly-report-html h2 { font-size: 1.05rem; margin: 0.3em 0 0.12em; font-weight: 600; color: ${themeTokens.textPrimary}; }
              .weekly-report-html h3 { font-size: 1rem; margin: 0.25em 0 0.1em; color: ${themeTokens.textSecondary}; }
              .weekly-report-html ul, .weekly-report-html ol { margin: 0.2em 0 0.3em 1em; padding: 0; }
              .weekly-report-html li { margin: 0.1em 0; }
              .weekly-report-html p { margin: 0.15em 0; }
              .weekly-report-html pre { background: ${themeTokens.workspacePanelBackground}; padding: 8px; border-radius: 4px; overflow: auto; font-size: 12px; }
              .weekly-report-html a { color: ${themeTokens.tabActiveBorder}; }
            `}
            </style>
            <div
              className="weekly-report-html"
              style={{ maxHeight: 480, overflow: 'auto' }}
              // eslint-disable-next-line react/no-danger -- 内容由本地工具链从 Markdown 生成
              dangerouslySetInnerHTML={{ __html: teamReportHtml }}
            />
          </>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', color: themeTokens.textPrimary, fontSize: 13, lineHeight: 1.7 }}>{teamReportWiki}</div>
        )}
      </div>
    );
  }
  const wikiWeeklyFetch = extractFetchWeeklyReportInfoResult(toolResults);
  if (wikiWeeklyFetch && (wikiWeeklyFetch.success !== undefined || wikiWeeklyFetch.error)) {
    const ok = wikiWeeklyFetch.success === true;
    const body = (wikiWeeklyFetch.bodyStorage ?? '').trim();
    return (
      <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, borderRadius: 6, border: `1px solid ${themeTokens.inputBorder}`, padding: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: ok ? themeTokens.statusSuccess : themeTokens.statusError, marginBottom: 8 }}>
          {ok ? '已抓取周报页信息' : '抓取周报页失败'}
        </div>
        {wikiWeeklyFetch.error ? (
          <div style={{ fontSize: 12, color: themeTokens.statusError, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{wikiWeeklyFetch.error}</div>
        ) : null}
        <div style={{ fontSize: 12, color: themeTokens.textSecondary, lineHeight: 1.6, marginBottom: 8 }}>
          {wikiWeeklyFetch.quarter ? <div>季度：{wikiWeeklyFetch.quarter}</div> : null}
          {wikiWeeklyFetch.weekRange ? <div>周区间：{wikiWeeklyFetch.weekRange}</div> : null}
          {wikiWeeklyFetch.pageId ? <div>pageId：{wikiWeeklyFetch.pageId}</div> : null}
          {wikiWeeklyFetch.pageTitle ? <div>标题：{wikiWeeklyFetch.pageTitle}</div> : null}
          {wikiWeeklyFetch.versionNumber != null ? (
            <div>
              版本：{wikiWeeklyFetch.versionNumber}
              {wikiWeeklyFetch.versionWhen ? `（${wikiWeeklyFetch.versionWhen}）` : ''}
            </div>
          ) : null}
          {wikiWeeklyFetch.targetUrl ? (
            <div style={{ marginTop: 6 }}>
              页面：{' '}
              <a href={wikiWeeklyFetch.targetUrl} target="_blank" rel="noreferrer" style={{ color: themeTokens.tabActiveBorder }}>
                打开
              </a>
            </div>
          ) : null}
        </div>
        {ok && body ? (
          <pre
            style={{
              margin: 0,
              maxHeight: 360,
              overflow: 'auto',
              fontSize: 11,
              lineHeight: 1.45,
              color: themeTokens.textPrimary,
              background: themeTokens.workspacePanelBackground,
              padding: 10,
              borderRadius: 4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {body}
          </pre>
        ) : ok && !body ? (
          <div style={{ fontSize: 12, color: themeTokens.textSecondary }}>正文为空（实例可能未返回 body.storage / body.view）。</div>
        ) : null}
      </div>
    );
  }
  const todoBugs = extractTodoBugsResult(toolResults);
  if (todoBugs) {
    return <JiraBugListPanel initial={todoBugs} themeTokens={themeTokens} apiBase={apiBase} refreshable />;
  }
  const inProgressBugs = extractInProgressBugsResult(toolResults);
  if (inProgressBugs) {
    return (
      <JiraBugListPanel
        initial={inProgressBugs}
        themeTokens={themeTokens}
        apiBase={apiBase}
        refreshable
        listKind="inProgress"
      />
    );
  }
  const myBugs = extractMyBugsResult(toolResults);
  if (myBugs) {
    return <JiraBugListPanel initial={myBugs} themeTokens={themeTokens} />;
  }
  const compositeDeployMd = formatCompositeWorkflowStepsMarkdown(extractCompositeWorkflowResult(toolResults));
  if (compositeDeployMd) {
    return (
      <div
        style={{
          marginTop: 8,
          background: themeTokens.workspacePanelSubtleBackground,
          borderRadius: 6,
          border: `1px solid ${themeTokens.inputBorder}`,
          padding: 10,
          fontSize: 13,
          lineHeight: 1.65,
          color: themeTokens.textPrimary,
        }}
      >
        <LinkifiedText text={compositeDeployMd} linkColor={themeTokens.tabActiveBorder} />
      </div>
    );
  }
  if (shouldSuppressToolResultDisplay(toolResults)) return null;
  if (toolResults && toolResults.length > 0 && !isCompositeNovaMergeDeployToolResults(toolResults)) {
    return (
      <pre
        style={{
          marginTop: 8,
          fontSize: 12,
          background: themeTokens.workspacePanelSubtleBackground,
          color: themeTokens.textPrimary,
          padding: 8,
          borderRadius: 4,
          maxWidth: '100%',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {JSON.stringify(toolResults, null, 2)}
      </pre>
    );
  }
  return null;
}

/* AI 生成 By Peng.Guo */
function formatToolProgressLogLine(e: AgentToolProgressEvent): string {
  if (e.phase === 'stream_delta') return '';
  if (e.phase === 'start') return `[工具] ${e.tool} 开始`;
  if (e.phase === 'progress') return `[${e.tool}] ${e.message ?? ''}`;
  return e.ok ? `[工具] ${e.tool} 完成` : `[工具] ${e.tool} 失败${e.message ? `: ${e.message}` : ''}`;
}

function shouldShowToolProgressInFeedback(e: AgentToolProgressEvent): boolean {
  if (e.phase === 'stream_delta') return false;
  if (e.phase === 'start' || e.phase === 'done') return true;
  if (e.phase !== 'progress') return true;
  if (e.tool !== 'composite_nova_merge_and_deploy') return true;
  const msg = (e.message ?? '').trim();
  return /^(步骤[123]\/3：正在|步骤[123]\/3完成|步骤[123]\/3失败|复合流程执行完成|步骤1\/3失败，流程终止。|步骤2\/3失败，流程终止。)/.test(
    msg
  );
}

export function ChatPanel({ apiBase, addLog, onStartWorkEmbedded, onOpenKnowledgeBase, onOpenCommandStats, onOpenMdToPdf, onOpenKnowledgeDoc, llmRuntimeMode, agentChatLlmBody, themeTokens }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; toolResults?: unknown[] }>>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [streamLive, setStreamLive] = useState<{ thinking: string; content: string } | null>(null);
  /** 工具内二次调模型（如周报）的流式正文/思考，与首轮 Agent 流式分离 */
  const [toolStreamLive, setToolStreamLive] = useState<{ thinking: string; content: string } | null>(null);
  const [toolProgressLines, setToolProgressLines] = useState<string[]>([]);
  const chatAbortRef = useRef<AbortController | null>(null);
  const streamAccumRef = useRef({ thinking: '', content: '' });
  const toolStreamAccumRef = useRef({ thinking: '', content: '' });
  const [completionList, setCompletionList] = useState<string[]>([]);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);
  const [tipMessage, setTipMessage] = useState('');
  const [liveTokenMetrics, setLiveTokenMetrics] = useState<LiveTokenMetrics | null>(null);
  const [knowledgeRebuildProgress, setKnowledgeRebuildProgress] = useState<KnowledgeRebuildProgress | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const chatModelOptions = useMemo(
    () => installedModels.filter((name) => isLikelyChatModelName(name)),
    [installedModels]
  );
  const selectedChatModel = chatModelOptions.includes(currentModel) ? currentModel : '';
  const deployPollRef = useRef<{ stop: () => void } | null>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const feedbackListRef = useRef<HTMLDivElement>(null);
  /** 工具内流式 Thinking/正文各自有 maxHeight+overflow，与外层聊天滚动分离，需单独跟到底 */
  const toolStreamThinkingPreRef = useRef<HTMLPreElement>(null);
  const toolStreamContentPreRef = useRef<HTMLPreElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const shouldStickToolThinkingBottomRef = useRef(true);
  const shouldStickToolContentBottomRef = useRef(true);
  const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolStreamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamStartedAtRef = useRef<number>(0);
  const toolStreamVisibleRef = useRef(false);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelKeyword, setModelKeyword] = useState('');
  const modelPickerWrapRef = useRef<HTMLDivElement>(null);
  const displayedModel = selectedChatModel || currentModel || '选择模型';
  const filteredChatModels = useMemo(() => {
    const keyword = modelKeyword.trim().toLowerCase();
    if (!keyword) return chatModelOptions;
    return chatModelOptions.filter((name) => name.toLowerCase().includes(keyword));
  }, [chatModelOptions, modelKeyword]);
  const isLightTheme = useMemo(() => {
    const bg = themeTokens.workspacePanelBackground.replace('#', '');
    if (bg.length !== 6) return false;
    const r = parseInt(bg.slice(0, 2), 16);
    const g = parseInt(bg.slice(2, 4), 16);
    const b = parseInt(bg.slice(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.65;
  }, [themeTokens.workspacePanelBackground]);
  const modelPickerUi = useMemo(
    () =>
      isLightTheme
        ? {
            triggerText: '#4f4f4f',
            triggerArrow: '#7a7a7a',
            panelBg: '#ffffff',
            panelBorder: '#dfe6e2',
            panelShadow: '0 18px 36px rgba(31, 42, 39, 0.16)',
            searchBg: '#f7f9f8',
            searchBorder: '#dbe5e0',
            searchText: '#1f2a27',
            rowActiveBg: '#edf2ef',
            rowText: '#2b3432',
            rowActiveText: '#1f2a27',
          }
        : {
            triggerText: '#4b4b4b',
            triggerArrow: '#666666',
            panelBg: '#1f2024',
            panelBorder: '#34363d',
            panelShadow: '0 20px 36px rgba(0,0,0,0.42)',
            searchBg: '#25272d',
            searchBorder: '#3a3d45',
            searchText: '#e9eaed',
            rowActiveBg: '#2c2f36',
            rowText: '#d4d6db',
            rowActiveText: '#ffffff',
          },
    [isLightTheme]
  );
  const inlineModelLabel = llmRuntimeMode === 'local'
    ? displayedModel
    : (agentChatLlmBody?.mode === 'external' ? agentChatLlmBody.model : '--');

  useEffect(() => () => {
    if (deployPollRef.current) deployPollRef.current.stop();
  }, []);

  useEffect(() => {
    if (!apiBase || llmRuntimeMode !== 'local') return;
    let cancelled = false;
    Promise.all([fetchAgentCurrentModel(apiBase), fetchAgentOllamaInstalledModels(apiBase)])
      .then(([model, models]) => {
        if (cancelled) return;
        if (model) setCurrentModel(model);
        setInstalledModels(models);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiBase, llmRuntimeMode]);

  useEffect(
    () => () => {
      chatAbortRef.current?.abort();
      if (streamFlushTimerRef.current) clearTimeout(streamFlushTimerRef.current);
      if (toolStreamFlushTimerRef.current) clearTimeout(toolStreamFlushTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/projects`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProjectInfo[]) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/agent/history`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: string[] } | null) => {
        if (!data || !Array.isArray(data.items)) return;
        const next = data.items
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(-INPUT_HISTORY_MAX);
        setInputHistory(next);
      })
      .catch(() => {});
  }, [apiBase]);

  const persistInputHistory = (history: string[]) => {
    if (!apiBase) return;
    fetch(`${apiBase}/agent/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: history }),
    }).catch(() => {});
  };

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (showCompletion && inputWrapRef.current && !inputWrapRef.current.contains(e.target as Node)) setShowCompletion(false);
    };
    if (showCompletion) document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [showCompletion]);

  useEffect(() => {
    const el = feedbackListRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
      shouldStickToBottomRef.current = distanceToBottom < 80;
    };
    onScroll();
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = feedbackListRef.current;
    if (!el) return;
    if (!shouldStickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  /* AI 生成 By Peng.Guo：内层 pre 在布局提交后滚到底，避免流式增量时滚动条停在顶部 */
  useLayoutEffect(() => {
    if (!toolStreamLive) return;
    const scrollElBottom = (node: HTMLElement | null, shouldStick: boolean) => {
      if (!node) return;
      if (!shouldStick) return;
      node.scrollTop = node.scrollHeight;
    };
    scrollElBottom(toolStreamThinkingPreRef.current, shouldStickToolThinkingBottomRef.current);
    scrollElBottom(toolStreamContentPreRef.current, shouldStickToolContentBottomRef.current);
  }, [toolStreamLive?.thinking, toolStreamLive?.content]);

  useEffect(() => {
    if (!tipMessage) return;
    const timer = setTimeout(() => setTipMessage(''), 2000);
    return () => clearTimeout(timer);
  }, [tipMessage]);

  useEffect(() => {
    if (!showModelPicker) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (modelPickerWrapRef.current && !modelPickerWrapRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [showModelPicker]);

  const handleDeployApiResult = (
    payload: {
      success?: boolean;
      message?: string;
      queueUrl?: string;
      jobUrl?: string;
      jobName?: string;
      jobKey?: string;
    },
    label: string
  ) => {
    const hasDeployPoll = payload && (payload.queueUrl || payload.jobName);
    const content = hasDeployPoll
      ? withJenkinsMarkdownLink(payload.message ?? '已触发，构建中…', payload.jobUrl ?? payload.queueUrl)
      : payload.success
        ? (payload.message ?? `${label}完成`)
        : (payload.message ?? '部署失败');
    setMessages((prev) => [...prev, { role: 'assistant', content }]);
    if (hasDeployPoll && apiBase) {
      const target: DeployPollingTarget | null = payload.queueUrl
        ? { kind: 'queueUrl', value: payload.queueUrl }
        : payload.jobName
          ? { kind: 'jobName', value: payload.jobName }
          : null;
      if (target) {
        startDeployPolling({
          apiBase,
          target,
          label,
          taskKey: payload.jobKey,
          jobPageUrl: payload.jobUrl,
          setMessages,
          addLog,
          pollRef: deployPollRef,
        });
      }
    } else if (!payload.success) {
      addLog(payload.message ?? '部署失败');
    } else {
      addLog(label);
    }
  };

  const executeJenkinsDeployNovaPretest = async () => {
    if (!apiBase) return;
    const label = '部署 nova 集测';
    addLog(`开始${label}…`);
    try {
      const res = await fetch(`${apiBase}/jenkins/deploy/nova-pretest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        queueUrl?: string;
        jobUrl?: string;
        jobName?: string;
        jobKey?: string;
      };
      if (!res.ok) {
        addLog(`请求失败: ${res.status} ${data.message ?? ''}`);
        setMessages((prev) => [...prev, { role: 'assistant', content: data.message ?? `请求失败: ${res.status}` }]);
        return;
      }
      handleDeployApiResult({ ...data, jobKey: data.jobKey ?? 'nova-pretest' }, label);
    } catch (e) {
      addLog(`请求失败: ${e}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${String(e)}` }]);
    }
  };

  const executeMerge = async (path: string, doneLabel: string) => {
    if (!apiBase) return;
    addLog(`开始${doneLabel}…`);
    try {
      const res = await fetch(`${apiBase}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok || !res.body) {
        addLog(`请求失败: ${res.status}`);
        setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${res.status}` }]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let lastDone: { success: boolean; error?: string } | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as { step?: string; done?: boolean; success?: boolean; error?: string };
              if (data.step != null) addLog(data.step);
              if (data.done) {
                lastDone = { success: !!data.success, error: data.error };
                if (!data.success) {
                  addLog(data.error || '合并失败');
                  if (data.error === '代码有冲突，需手工合并') alert('代码有冲突，需手工合并');
                } else addLog(doneLabel);
              }
            } catch (_) {}
          }
        }
      }
      if (buf.startsWith('data: ')) {
        try {
          const data = JSON.parse(buf.slice(6)) as { step?: string; done?: boolean; success?: boolean; error?: string };
          if (data.step != null) addLog(data.step);
          if (data.done) lastDone = { success: !!data.success, error: data.error };
        } catch (_) {}
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: lastDone?.success ? `已执行${doneLabel}，请查看下方 Logs。` : (lastDone?.error ?? '合并失败') },
      ]);
    } catch (e) {
      addLog(`请求失败: ${e}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${String(e)}` }]);
    }
  };

  const handleAgentResponse = (data: AgentResult, clearLoading: boolean) => {
    if (data.aborted) {
      addLog('推理已取消（模型切换或请求被中断）');
      if (clearLoading) setLoading(false);
      return;
    }
    addLog(data.success ? 'Agent 完成' : `错误: ${data.error}`);
    if (data.timing) {
      if (data.timing.firstLLMMs != null) addLog(`  [耗时] 模型推理（解析指令）: ${data.timing.firstLLMMs} ms`);
      if (Array.isArray(data.timing.tools))
        data.timing.tools.forEach((t) => addLog(`  [耗时] 工具 ${t.name} 执行: ${t.ms} ms`));
      if (data.timing.secondLLMMs != null) addLog(`  [耗时] 模型推理（生成回复）: ${data.timing.secondLLMMs} ms`);
      const tu = data.timing.tokenUsage;
      if (tu && (tu.promptTokens != null || tu.completionTokens != null)) {
        const p = tu.promptTokens ?? 0;
        const c = tu.completionTokens ?? 0;
        addLog(`  [Token] 本次指令：输入 ${p}，输出 ${c}，合计 ${p + c}`);
        const elapsedMs = streamStartedAtRef.current > 0 ? Date.now() - streamStartedAtRef.current : 0;
        const elapsedSec = Math.max(0.001, elapsedMs / 1000);
        setLiveTokenMetrics({
          inputTokens: p,
          outputTokens: c,
          speedTps: c / elapsedSec,
        });
      }
    }
    const compositePayload = extractCompositeWorkflowResult(data.toolResults);
    const compositeHeadline = compositePayload ? getCompositeWorkflowHeadline(compositePayload) : null;
    const deployResult = data.toolResults?.find(
      (t): t is {
        tool: string;
        result?: { queueUrl?: string; jobUrl?: string; jobName?: string; message?: string; jobKey?: string };
      } =>
        (t as { tool: string }).tool === 'deploy_jenkins' && (t as { result?: unknown }).result != null
    ) as
      | { tool: string; result?: { queueUrl?: string; jobUrl?: string; jobName?: string; message?: string; jobKey?: string } }
      | undefined;
    const deployPayload = deployResult?.result;
    const hasDeployPoll = deployPayload && (deployPayload.queueUrl || deployPayload.jobName);
    const content = compositeHeadline
      ? compositeHeadline
      : hasDeployPoll
        ? withJenkinsMarkdownLink(
            deployPayload.message ?? '已触发，构建中…',
            deployPayload.jobUrl ?? deployPayload.queueUrl
          )
        : data.success
          ? (data.text ?? '')
          : (data.error ?? '请求失败');
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content, toolResults: data.toolResults },
    ]);
    if (hasDeployPoll) {
      const target: DeployPollingTarget | null = deployPayload.queueUrl
        ? { kind: 'queueUrl', value: deployPayload.queueUrl }
        : deployPayload.jobName
          ? { kind: 'jobName', value: deployPayload.jobName }
          : null;
      if (target) {
        startDeployPolling({
          apiBase,
          target,
          label: deployPayload.jobKey ? `部署${deployPayload.jobKey}` : '部署',
          taskKey: deployPayload.jobKey,
          jobPageUrl: deployPayload.jobUrl,
          setMessages,
          addLog,
          pollRef: deployPollRef,
        });
      }
    }
    const mergeResult = data.toolResults?.find(
      (t): t is { tool: string; result?: { steps?: string[] } } =>
        (t as { tool: string }).tool === 'merge_repo' && (t as { result?: unknown }).result != null
    );
    const embeddedStartWork = data.toolResults?.find(
      (t): t is { tool: string; result?: { embedded?: boolean; sessionId?: string; terminals?: WorkTerminal[] } } =>
        ((t as { tool?: string }).tool === 'run_workflow' || (t as { tool?: string }).tool === 'open_terminal') &&
        (t as { result?: { embedded?: boolean } }).result?.embedded === true
    );
    if (embeddedStartWork?.result?.sessionId) {
      onStartWorkEmbedded({
        sessionId: embeddedStartWork.result.sessionId,
        terminals: embeddedStartWork.result.terminals ?? [],
      });
      addLog('已切换到内嵌终端（我的工作）');
    }
    const openKbToolResult = data.toolResults?.find(
      (t): t is { tool: string; result?: { openKnowledgeBaseManager?: boolean } } =>
        (t as { tool?: string }).tool === 'open_knowledge_base_manager' &&
        (t as { result?: { openKnowledgeBaseManager?: boolean } }).result?.openKnowledgeBaseManager === true
    );
    if (openKbToolResult) {
      onOpenKnowledgeBase();
      addLog('已打开私人知识库页签');
    }
    const openStatsToolResult = data.toolResults?.find(
      (t): t is { tool: string; result?: { openCommandStats?: boolean } } =>
        (t as { tool?: string }).tool === 'open_command_stats' &&
        (t as { result?: { openCommandStats?: boolean } }).result?.openCommandStats === true
    );
    if (openStatsToolResult) {
      onOpenCommandStats();
      addLog('已打开指令统计页签');
    }
    const openMdPdfToolResult = data.toolResults?.find(
      (t): t is { tool: string; result?: { openMdToPdf?: boolean } } =>
        (t as { tool?: string }).tool === 'open_md_to_pdf' &&
        (t as { result?: { openMdToPdf?: boolean } }).result?.openMdToPdf === true
    );
    if (openMdPdfToolResult) {
      onOpenMdToPdf();
      addLog('已打开 MD 生成 PDF 页签');
    }
    const mergeSteps = (mergeResult?.result?.steps as string[] | undefined);
    appendToolResultsToLogs(data.toolResults, addLog);
    if (Array.isArray(mergeSteps) && mergeSteps.length > 0) mergeSteps.forEach((step) => addLog(step));
    if (clearLoading) setLoading(false);
  };

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setInputHistory((prev) => {
      const next = prev[prev.length - 1] === msg ? prev : [...prev, msg].slice(-INPUT_HISTORY_MAX);
      if (next !== prev) persistInputHistory(next);
      return next;
    });
    historyIndexRef.current = -1;
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);
    setLiveTokenMetrics(null);
    addLog(`发送: ${msg}`);
    if (isCompositeNovaMergeDeployMessage(msg)) {
      // 明确跳过前端合并快捷分流，交给 Agent 复合编排工具执行
      addLog('检测到复合流程口令，转交 Agent 执行串并行编排');
    } else {
    const mergeTask = resolveMergeTask(msg);
      if (mergeTask) {
        setLoading(false);
        await executeMerge(mergeTask.path, mergeTask.label);
        return;
      }
    }
    if (isNovaPretestDeployMessage(msg)) {
      setLoading(false);
      await executeJenkinsDeployNovaPretest();
      return;
    }
    if (msg === '添加私人知识库') {
      setLoading(false);
      onOpenKnowledgeBase();
      addLog('已打开私人知识库页签');
      setMessages((prev) => [...prev, { role: 'assistant', content: '已打开私人知识库页签，请选择目录并导入 Markdown 文档。' }]);
      return;
    }
    if (msg === '统计常用指令') {
      setLoading(false);
      onOpenCommandStats();
      addLog('已打开指令统计页签');
      setMessages((prev) => [...prev, { role: 'assistant', content: '已打开指令统计页签，可查看柱状图、饼图与折线图。' }]);
      return;
    }
    if (/^md生成pdf$/i.test(msg)) {
      setLoading(false);
      onOpenMdToPdf();
      addLog('已打开 MD 生成 PDF 页签');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '已打开 MD 生成 PDF 页签：选择或上传 .md 文件，点击「生成」即可在同目录输出 GitLab 风格 PDF。' },
      ]);
      return;
    }
    if (/清除私人知识库|清空私人知识库/.test(msg)) {
      const ok = window.confirm('确认清除私人知识库吗？将删除已导入文档，并清理已有知识库索引，且不可恢复。');
      if (!ok) {
        setLoading(false);
        addLog('已取消清除私人知识库');
        setMessages((prev) => [...prev, { role: 'assistant', content: '已取消清除私人知识库。' }]);
        return;
      }
    }
    chatAbortRef.current?.abort();
    chatAbortRef.current = new AbortController();
    const { signal } = chatAbortRef.current;
    streamAccumRef.current = { thinking: '', content: '' };
    streamStartedAtRef.current = Date.now();
    setLiveTokenMetrics(null);
    setStreamLive({ thinking: '', content: '' });
    setToolStreamLive(null);
    toolStreamVisibleRef.current = false;
    toolStreamAccumRef.current = { thinking: '', content: '' };
    setToolProgressLines([]);
    const flushStreamLive = () => {
      if (streamFlushTimerRef.current) return;
      streamFlushTimerRef.current = setTimeout(() => {
        streamFlushTimerRef.current = null;
        setStreamLive({
          thinking: streamAccumRef.current.thinking,
          content: streamAccumRef.current.content,
        });
      }, STREAM_FLUSH_INTERVAL_MS);
    };
    const flushToolStreamLive = () => {
      if (toolStreamFlushTimerRef.current) return;
      toolStreamFlushTimerRef.current = setTimeout(() => {
        toolStreamFlushTimerRef.current = null;
        setToolStreamLive({
          thinking: toolStreamAccumRef.current.thinking,
          content: toolStreamAccumRef.current.content,
        });
      }, STREAM_FLUSH_INTERVAL_MS);
    };
    try {
      await postAgentChatStream(
        apiBase,
        msg,
        signal,
        {
        onLlmDelta: (d) => {
          streamAccumRef.current.thinking += d.thinkingDelta ?? '';
          streamAccumRef.current.content += d.contentDelta ?? '';
          flushStreamLive();
        },
        onTokenUsage: (usage) => {
          const prompt = usage.promptTokens ?? 0;
          const completion = usage.completionTokens ?? 0;
          const elapsedSec = Math.max(0.001, (Date.now() - streamStartedAtRef.current) / 1000);
          setLiveTokenMetrics({
            inputTokens: prompt,
            outputTokens: completion,
            speedTps: completion / elapsedSec,
          });
        },
        onToolProgress: (e) => {
          if (e.phase === 'stream_delta') {
            if (!toolStreamVisibleRef.current) {
              toolStreamVisibleRef.current = true;
              setToolStreamLive({ thinking: '', content: '' });
            }
            toolStreamAccumRef.current.thinking += e.thinkingDelta ?? '';
            toolStreamAccumRef.current.content += e.contentDelta ?? '';
            flushToolStreamLive();
            return;
          }
          if (
            e.phase === 'start' &&
            (e.tool === 'write_weekly_report' || e.tool === 'generate_weekly_team_summary' || e.tool === 'query_knowledge_base')
          ) {
            toolStreamAccumRef.current = { thinking: '', content: '' };
            toolStreamVisibleRef.current = true;
            setToolStreamLive({ thinking: '', content: '' });
          }
          if (
            e.phase === 'start' &&
            (e.tool === 'rebuild_knowledge_base_index' || e.tool === 'incremental_rebuild_knowledge_base_index')
          ) {
            setKnowledgeRebuildProgress({
              cacheTotal: 0,
              preprocessDone: [],
              vectorDone: [],
            });
          }
          if (
            e.phase === 'progress' &&
            (e.tool === 'rebuild_knowledge_base_index' || e.tool === 'incremental_rebuild_knowledge_base_index')
          ) {
            const progressEvent = parseKbProgressEvent(e.message);
            if (progressEvent) {
              setKnowledgeRebuildProgress((prev) => {
                const current = prev ?? { cacheTotal: 0, preprocessDone: [], vectorDone: [] };
                if (progressEvent.stage === 'summary' && progressEvent.status === 'cache_total') {
                  return { ...current, cacheTotal: progressEvent.count ?? 0 };
                }
                if (progressEvent.stage === 'preprocess') {
                  if (progressEvent.status === 'start') {
                    return { ...current, preprocessCurrent: progressEvent.doc };
                  }
                  if (progressEvent.status === 'done' || progressEvent.status === 'reused') {
                    const existed = current.preprocessDone.find((item) => item.doc === progressEvent.doc);
                    const nextDone = existed
                      ? current.preprocessDone.map((item) =>
                          item.doc === progressEvent.doc
                            ? { doc: progressEvent.doc!, status: progressEvent.status as 'done' | 'reused' }
                            : item
                        )
                      : [...current.preprocessDone, { doc: progressEvent.doc!, status: progressEvent.status as 'done' | 'reused' }];
                    return { ...current, preprocessDone: nextDone, preprocessCurrent: undefined };
                  }
                }
                if (progressEvent.stage === 'vector') {
                  if (progressEvent.status === 'start') {
                    return { ...current, vectorCurrent: progressEvent.doc };
                  }
                  if (progressEvent.status === 'done' && progressEvent.doc) {
                    const doc = progressEvent.doc;
                    const nextDone = current.vectorDone.includes(doc)
                      ? current.vectorDone
                      : [...current.vectorDone, doc];
                    return { ...current, vectorDone: nextDone, vectorCurrent: undefined };
                  }
                }
                return current;
              });
              return;
            }
          }
          if (
            e.phase === 'done' &&
            (e.tool === 'rebuild_knowledge_base_index' || e.tool === 'incremental_rebuild_knowledge_base_index')
          ) {
            setKnowledgeRebuildProgress((prev) =>
              prev
                ? {
                    ...prev,
                    preprocessCurrent: undefined,
                    vectorCurrent: undefined,
                  }
                : prev
            );
          }
          const line = formatToolProgressLogLine(e);
          if (line) addLog(line);
          if (line && shouldShowToolProgressInFeedback(e)) {
            setToolProgressLines((prev) => [...prev.slice(-40), line]);
          }
        },
        onResult: (raw) => {
          if (streamFlushTimerRef.current) clearTimeout(streamFlushTimerRef.current);
          if (toolStreamFlushTimerRef.current) clearTimeout(toolStreamFlushTimerRef.current);
          streamFlushTimerRef.current = null;
          toolStreamFlushTimerRef.current = null;
          setStreamLive(null);
          setToolStreamLive(null);
          toolStreamVisibleRef.current = false;
          setToolProgressLines([]);
          const data = raw as AgentResult;
          handleAgentResponse(data, true);
          streamStartedAtRef.current = 0;
        },
        onError: (errMsg) => {
          if (streamFlushTimerRef.current) clearTimeout(streamFlushTimerRef.current);
          if (toolStreamFlushTimerRef.current) clearTimeout(toolStreamFlushTimerRef.current);
          streamFlushTimerRef.current = null;
          toolStreamFlushTimerRef.current = null;
          setStreamLive(null);
          setToolStreamLive(null);
          toolStreamVisibleRef.current = false;
          setToolProgressLines([]);
          setLiveTokenMetrics(null);
          streamStartedAtRef.current = 0;
          setLoading(false);
          if (errMsg.trim()) {
            addLog(`请求异常: ${errMsg}`);
            setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${errMsg}` }]);
          }
        },
      },
        agentChatLlmBody ? { llm: agentChatLlmBody } : undefined
      );
    } catch (e) {
      if (streamFlushTimerRef.current) clearTimeout(streamFlushTimerRef.current);
      if (toolStreamFlushTimerRef.current) clearTimeout(toolStreamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
      toolStreamFlushTimerRef.current = null;
      setStreamLive(null);
      setToolStreamLive(null);
      toolStreamVisibleRef.current = false;
      setToolProgressLines([]);
      setLiveTokenMetrics(null);
      streamStartedAtRef.current = 0;
      if (e instanceof Error && e.name === 'AbortError') {
        addLog('请求已取消（本地中断）');
        setLoading(false);
        return;
      }
      const err = e instanceof Error ? e.message : String(e);
      addLog(`请求异常: ${err}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${err}` }]);
      setLoading(false);
    }
  };

  const refreshOllamaModels = () => {
    if (!apiBase) return;
    fetchAgentOllamaInstalledModels(apiBase).then(setInstalledModels).catch(() => {});
  };

  const handleModelSelectChange = async (next: string) => {
    if (!apiBase || !next || next === currentModel) return;
    chatAbortRef.current?.abort();
    setLoading(false);
    addLog(`切换模型: ${next}…`);
    const result = await postSwitchAgentModel(apiBase, next);
    if (result.success && result.model) {
      setCurrentModel(result.model);
      addLog(`已切换为: ${result.model}`);
      refreshOllamaModels();
    } else {
      addLog(`切换失败: ${result.error ?? '未知错误'}`);
      const m = await fetchAgentCurrentModel(apiBase);
      if (m) setCurrentModel(m);
    }
  };

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, width: '100%', overflow: 'hidden', padding: 16 }}>
      <div style={{ marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {QUICK_ACTIONS.map(({ label, message }) => (
          <Button
            key={label}
            themeTokens={themeTokens}
            type="button"
            onClick={() => send(message)}
            variant="ghost"
            size="sm"
            style={{ height: 22, padding: '0 8px', fontSize: 11, borderRadius: 6 }}
          >
            {label}
          </Button>
        ))}
        <IconButton
          themeTokens={themeTokens}
          icon="⊗"
          type="button"
          onClick={() => {
            setMessages([]);
            setKnowledgeRebuildProgress(null);
            setToolProgressLines([]);
            setToolStreamLive(null);
            setStreamLive(null);
          }}
          title="清屏"
          variant="soft"
          size="sm"
          style={{ marginLeft: 'auto', height: 22, minWidth: 22, padding: 0, borderRadius: 6 }}
        />
      </div>
      <div
        ref={feedbackListRef}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'auto',
          marginBottom: 12,
          background: themeTokens.workspacePanelBackground,
          borderRadius: 8,
          padding: 12,
          overflowAnchor: 'none',
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: themeTokens.textSecondary }}>
            [Chat] 输入指令或点击上方快捷按钮，例如：开始工作、终端打开 react18、启动 mdf-ui、启动 base、升级集测react18的nova版本、打开 Jenkins、部署 nova
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, color: themeTokens.textPrimary }}>
            <strong style={{ color: m.role === 'user' ? themeTokens.tabActiveBorder : themeTokens.accentButtonBackground }}>{m.role === 'user' ? 'You' : 'AI'}:</strong>{' '}
            <LinkifiedText text={m.content} linkColor={themeTokens.tabActiveBorder} />
            {renderToolResults(
              m.toolResults,
              setTipMessage,
              {
                llmRuntimeMode,
                ollamaModelName: currentModel,
                agentChatLlmBody,
              },
              themeTokens,
              onOpenKnowledgeDoc,
              apiBase,
            )}
          </div>
        ))}
        {streamLive && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${themeTokens.inputBorder}`,
              background: themeTokens.workspacePanelSubtleBackground,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }}
          >
            {liveTokenMetrics && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: themeTokens.textSecondary, marginBottom: 8 }}>
                <span>Input: {liveTokenMetrics.inputTokens}</span>
                <span>Output: {liveTokenMetrics.outputTokens}</span>
                <span>Speed: {liveTokenMetrics.speedTps.toFixed(1)} tok/s</span>
                <span style={{ color: themeTokens.statusSuccess }}>后端实时统计</span>
              </div>
            )}
            {streamLive.thinking ? (
              <>
                <div style={{ fontSize: 13, color: themeTokens.textSecondary, marginBottom: 8, fontWeight: 600 }}>Thinking…</div>
                <pre
                  style={{
                    margin: '0 0 8px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 12,
                    color: themeTokens.textPrimary,
                    maxHeight: 280,
                    overflow: 'auto',
                    lineHeight: 1.45,
                  }}
                >
                  {streamLive.thinking}
                </pre>
                {streamLive.content ? (
                  <div style={{ fontSize: 12, color: themeTokens.statusSuccess, margin: '0 0 8px' }}>...done thinking.</div>
                ) : null}
              </>
            ) : (
              !streamLive.content && (
                <div style={{ fontSize: 13, color: themeTokens.textSecondary, marginBottom: 8, fontWeight: 600 }}>Thinking…</div>
              )
            )}
            {!streamLive.thinking && !streamLive.content && (
              <div style={{ fontSize: 12, color: themeTokens.textSecondary }}>已请求流式推理；若久无文字请升级 Ollama；仅在使用支持 thinking 的模型且需要思考流时配置 OLLAMA_THINK</div>
            )}
            {streamLive.content ? (
              <>
                <div style={{ fontSize: 11, color: themeTokens.textSecondary, margin: '0 0 6px' }}>Answer</div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 13,
                    color: themeTokens.textPrimary,
                    maxHeight: 320,
                    overflow: 'auto',
                    lineHeight: 1.45,
                  }}
                >
                  {streamLive.content}
                </pre>
              </>
            ) : null}
          </div>
        )}
        {toolStreamLive && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${themeTokens.inputBorder}`,
              background: themeTokens.workspacePanelSubtleBackground,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }}
          >
            <div style={{ fontSize: 12, color: themeTokens.textSecondary, marginBottom: 8, fontWeight: 600 }}>工具内流式输出（知识库 / 周报 / 组内总结）</div>
            {toolStreamLive.thinking ? (
              <>
                <div style={{ fontSize: 11, color: themeTokens.textSecondary, marginBottom: 4 }}>Thinking</div>
                <pre
                  ref={toolStreamThinkingPreRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
                    shouldStickToolThinkingBottomRef.current = distanceToBottom < 24;
                  }}
                  style={{
                    margin: '0 0 10px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 12,
                    color: themeTokens.textPrimary,
                    maxHeight: 260,
                    overflow: 'auto',
                    lineHeight: 1.45,
                  }}
                >
                  {toolStreamLive.thinking}
                </pre>
              </>
            ) : null}
            {toolStreamLive.content ? (
              <>
                <div style={{ fontSize: 11, color: themeTokens.textSecondary, marginBottom: 4 }}>正文</div>
                <pre
                  ref={toolStreamContentPreRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
                    shouldStickToolContentBottomRef.current = distanceToBottom < 24;
                  }}
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 13,
                    color: themeTokens.textPrimary,
                    maxHeight: 360,
                    overflow: 'auto',
                    lineHeight: 1.45,
                  }}
                >
                  {toolStreamLive.content}
                </pre>
              </>
            ) : !toolStreamLive.thinking ? (
              <div style={{ fontSize: 12, color: themeTokens.textSecondary }}>等待模型输出…</div>
            ) : null}
          </div>
        )}
        {toolProgressLines.length > 0 && (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${themeTokens.inputBorder}`,
              background: themeTokens.workspacePanelSubtleBackground,
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            <div style={{ fontSize: 11, color: themeTokens.textSecondary, marginBottom: 6 }}>工具执行进度</div>
            {toolProgressLines.slice(-14).map((line, idx) => (
              <div key={`${idx}-${line.slice(0, 24)}`} style={{ fontSize: 12, color: themeTokens.textPrimary, marginBottom: 4, lineHeight: 1.4 }}>
                {line}
              </div>
            ))}
          </div>
        )}
        {knowledgeRebuildProgress && (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${themeTokens.inputBorder}`,
              background: themeTokens.workspacePanelSubtleBackground,
              maxHeight: 260,
              overflow: 'auto',
            }}
          >
            <div style={{ fontSize: 11, color: themeTokens.textSecondary, marginBottom: 8 }}>
              知识库重建反馈（已处理 + 实时处理中）
            </div>
            <div style={{ fontSize: 12, color: themeTokens.textPrimary, marginBottom: 8 }}>
              <strong>预处理文档：</strong>
              <span style={{ color: themeTokens.textSecondary, marginLeft: 6 }}>历史已缓存 {knowledgeRebuildProgress.cacheTotal}</span>
              <span style={{ color: themeTokens.textSecondary, marginLeft: 8 }}>
                本次已处理 {knowledgeRebuildProgress.preprocessDone.filter((item) => item.status === 'done').length}
              </span>
              <span style={{ color: themeTokens.textSecondary, marginLeft: 8 }}>
                本次复用 {knowledgeRebuildProgress.preprocessDone.filter((item) => item.status === 'reused').length}
              </span>
              {knowledgeRebuildProgress.preprocessCurrent ? (
                <span style={{ color: themeTokens.statusSuccess, marginLeft: 8 }}>
                  处理中：{knowledgeRebuildProgress.preprocessCurrent}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: themeTokens.textSecondary, marginBottom: 6 }}>已处理列表（含实时处理中）</div>
            {knowledgeRebuildProgress.preprocessDone.length > 0 || knowledgeRebuildProgress.preprocessCurrent ? (
              <div
                style={{
                  fontSize: 12,
                  color: themeTokens.textSecondary,
                  marginBottom: 10,
                  maxHeight: 120,
                  overflow: 'auto',
                  border: `1px solid ${themeTokens.inputBorder}`,
                  borderRadius: 6,
                  padding: 6,
                  background: themeTokens.workspacePanelBackground,
                }}
              >
                {knowledgeRebuildProgress.preprocessCurrent ? (
                  <div
                    key={`pre-current-${knowledgeRebuildProgress.preprocessCurrent}`}
                    style={{ marginBottom: 4, wordBreak: 'break-all', color: themeTokens.statusSuccess }}
                  >
                    [处理中] {knowledgeRebuildProgress.preprocessCurrent}
                  </div>
                ) : null}
                {knowledgeRebuildProgress.preprocessDone.map((item) => (
                  <div key={`pre-${item.doc}`} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                    {item.status === 'reused' ? '[复用] ' : '[已处理] '}
                    {item.doc}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: themeTokens.textSecondary, marginBottom: 10 }}>暂无</div>
            )}
            <div style={{ fontSize: 12, color: themeTokens.textPrimary, marginBottom: 8 }}>
              <strong>向量索引文档：</strong>
              <span style={{ color: themeTokens.textSecondary, marginLeft: 6 }}>历史已缓存 {knowledgeRebuildProgress.cacheTotal}</span>
              <span style={{ color: themeTokens.textSecondary, marginLeft: 8 }}>本次已完成 {knowledgeRebuildProgress.vectorDone.length}</span>
              {knowledgeRebuildProgress.vectorCurrent ? (
                <span style={{ color: themeTokens.statusSuccess, marginLeft: 8 }}>
                  处理中：{knowledgeRebuildProgress.vectorCurrent}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: themeTokens.textSecondary, marginBottom: 6 }}>已处理列表（含实时处理中）</div>
            {knowledgeRebuildProgress.vectorDone.length > 0 || knowledgeRebuildProgress.vectorCurrent ? (
              <div
                style={{
                  fontSize: 12,
                  color: themeTokens.textSecondary,
                  maxHeight: 120,
                  overflow: 'auto',
                  border: `1px solid ${themeTokens.inputBorder}`,
                  borderRadius: 6,
                  padding: 6,
                  background: themeTokens.workspacePanelBackground,
                }}
              >
                {knowledgeRebuildProgress.vectorCurrent ? (
                  <div
                    key={`vec-current-${knowledgeRebuildProgress.vectorCurrent}`}
                    style={{ marginBottom: 4, wordBreak: 'break-all', color: themeTokens.statusSuccess }}
                  >
                    [处理中] {knowledgeRebuildProgress.vectorCurrent}
                  </div>
                ) : null}
                {knowledgeRebuildProgress.vectorDone.map((doc) => (
                  <div key={`vec-${doc}`} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                    {doc}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: themeTokens.textSecondary }}>暂无</div>
            )}
          </div>
        )}
        {loading && (
          <p style={{ color: themeTokens.textSecondary }}>
            {toolStreamLive && (toolStreamLive.thinking || toolStreamLive.content)
              ? '流式输出中（见上方「工具内流式输出」）…'
              : streamLive
                ? '思考中…'
                : '处理中…'}
          </p>
        )}
        {tipMessage && (
          <div
            style={{
              position: 'sticky',
              bottom: 8,
              marginLeft: 'auto',
              width: 'fit-content',
              maxWidth: '80%',
              background: themeTokens.tabInactiveBackground,
              border: `1px solid ${themeTokens.inputBorder}`,
              color: themeTokens.textPrimary,
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            }}
          >
            {tipMessage}
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}
      >
        <div ref={inputWrapRef} style={{ flex: 1, position: 'relative' }}>
          <textarea
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);
              historyIndexRef.current = -1;
              const trim = v.trim();
              if (trim.length > 0) {
                const dynamicHints = buildCommandHints(projects, inputHistory);
                const list = dynamicHints.filter((h) => h.startsWith(trim));
                const dedup = Array.from(new Set(list));
                setCompletionList(dedup.slice(0, 12));
                setCompletionIndex(0);
                setShowCompletion(dedup.length > 0);
              } else {
                setCompletionList([]);
                setShowCompletion(false);
              }
            }}
            onKeyDown={(e) => {
              if (showCompletion && completionList.length > 0) {
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault();
                  setInput(completionList[completionIndex]);
                  setShowCompletion(false);
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCompletionIndex((i) => (i + 1) % completionList.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCompletionIndex((i) => (i - 1 + completionList.length) % completionList.length);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowCompletion(false);
                  return;
                }
              }
              if (e.key === 'ArrowUp') {
                if (inputHistory.length > 0) {
                  e.preventDefault();
                  if (historyIndexRef.current === -1) {
                    savedInputRef.current = input;
                    historyIndexRef.current = inputHistory.length - 1;
                    setInput(inputHistory[inputHistory.length - 1]);
                  } else if (historyIndexRef.current > 0) {
                    historyIndexRef.current -= 1;
                    setInput(inputHistory[historyIndexRef.current]);
                  }
                }
                return;
              }
              if (e.key === 'ArrowDown') {
                if (historyIndexRef.current !== -1) {
                  e.preventDefault();
                  if (historyIndexRef.current < inputHistory.length - 1) {
                    historyIndexRef.current += 1;
                    setInput(inputHistory[historyIndexRef.current]);
                  } else {
                    historyIndexRef.current = -1;
                    setInput(savedInputRef.current);
                  }
                }
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) send(input);
              }
            }}
            placeholder="输入指令...（Enter 发送，Shift+Enter 换行，↑↓ 切换历史，Tab 补全）"
            rows={3}
            style={{
              width: '100%',
              minHeight: 60,
              padding: '10px 166px 10px 12px',
              background: themeTokens.inputBackground,
              border: `1px solid ${themeTokens.inputBorder}`,
              borderRadius: 6,
              color: themeTokens.textPrimary,
              resize: 'vertical',
              font: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div
            ref={llmRuntimeMode === 'local' ? modelPickerWrapRef : undefined}
            style={{
              position: 'absolute',
              right: 48,
              bottom: 10,
              zIndex: 3,
            }}
          >
            {/* AI 生成 By Peng.Guo */}
            <button
              type="button"
              onClick={
                llmRuntimeMode === 'local'
                  ? () => {
                      if (!showModelPicker) refreshOllamaModels();
                      setShowModelPicker((prev) => !prev);
                    }
                  : undefined
              }
              title="选择模型"
              style={{
                height: 30,
                border: 'none',
                background: 'transparent',
                color: modelPickerUi.triggerText,
                padding: '0 6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: llmRuntimeMode === 'local' ? 'pointer' : 'default',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span style={{ maxWidth: 108, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {inlineModelLabel}
              </span>
              {llmRuntimeMode === 'local' ? (
                <span style={{ fontSize: 10, color: modelPickerUi.triggerArrow }}>{showModelPicker ? '▲' : '▼'}</span>
              ) : null}
            </button>
            {llmRuntimeMode === 'local' && showModelPicker && (
              <div
                style={{
                  position: 'absolute',
                  right: -6,
                  bottom: 'calc(100% + 8px)',
                  width: 320,
                  maxHeight: 360,
                  background: modelPickerUi.panelBg,
                  border: `1px solid ${modelPickerUi.panelBorder}`,
                  borderRadius: 14,
                  boxShadow: modelPickerUi.panelShadow,
                  zIndex: 40,
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: 10, borderBottom: `1px solid ${modelPickerUi.panelBorder}` }}>
                  <input
                    value={modelKeyword}
                    onChange={(e) => setModelKeyword(e.target.value)}
                    placeholder="Search models"
                    autoFocus
                    style={{
                      width: '100%',
                      height: 34,
                      border: `1px solid ${modelPickerUi.searchBorder}`,
                      borderRadius: 9,
                      background: modelPickerUi.searchBg,
                      color: modelPickerUi.searchText,
                      padding: '0 10px',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ maxHeight: 300, overflow: 'auto', padding: 8 }}>
                  {filteredChatModels.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: themeTokens.textSecondary }}>No models found</div>
                  ) : (
                    filteredChatModels.map((name) => {
                      const isActive = name === currentModel;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setShowModelPicker(false);
                            setModelKeyword('');
                            void handleModelSelectChange(name);
                          }}
                          style={{
                            width: '100%',
                            height: 38,
                            border: 'none',
                            borderRadius: 9,
                            background: isActive ? modelPickerUi.rowActiveBg : 'transparent',
                            color: isActive ? modelPickerUi.rowActiveText : modelPickerUi.rowText,
                            fontWeight: 400,
                            padding: '0 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            fontSize: 13,
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{name}</span>
                          {isActive ? <span style={{ color: '#9fe19b', fontSize: 12 }}>✓</span> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
          {/* AI 生成 By Peng.Guo */}
          <button
            type="submit"
            title="发送"
            aria-label="发送"
            disabled={loading || !input.trim()}
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              width: 30,
              height: 30,
              borderRadius: 999,
              border: 'none',
              outline: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              background: loading || !input.trim() ? '#a3a3a3' : '#111111',
              color: '#ffffff',
              boxShadow: loading || !input.trim()
                ? 'none'
                : '0 4px 10px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(255,255,255,0.08)',
              transition: 'all 0.15s ease',
              zIndex: 2,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3L8 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M4.8 6.2L8 3L11.2 6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showCompletion && completionList.length > 0 && (
            <ul
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: '100%',
                margin: 0,
                marginBottom: 4,
                padding: 4,
                listStyle: 'none',
                background: themeTokens.tabInactiveBackground,
                border: `1px solid ${themeTokens.panelBorder}`,
                borderRadius: 6,
                boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
                zIndex: 20,
                maxHeight: 240,
                overflow: 'auto',
              }}
            >
              {completionList.map((item, i) => (
                <li
                  key={item}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInput(item);
                    setCompletionIndex(i);
                    setShowCompletion(false);
                  }}
                  style={{
                    padding: '8px 10px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    background: i === completionIndex ? themeTokens.accentButtonBackground : 'transparent',
                    color: themeTokens.textPrimary,
                    fontSize: 13,
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </section>
  );
}
