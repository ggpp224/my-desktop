/* AI 生成 By Peng.Guo */
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { appendToolResultsToLogs } from './log-tools';
import { withJenkinsMarkdownLink } from './domain/deploy/jenkinsDeployDisplay';
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
  url?: string;
};
type JiraBugPayload = { total?: number; issues?: JiraBugItem[] };
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
type CursorUsageToolResult = {
  success?: boolean;
  fetchedAt?: string;
  data?: unknown;
};
type CursorUsageRow = {
  item: string;
  tokensText: string;
  costText: string;
  includedText: string;
  tokensNumber?: number;
  costNumber?: number;
};
type CursorTodayUsageEvent = {
  timestamp?: string;
  model?: string;
  kind?: string;
  chargedCents?: number;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
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
  onOpenKnowledgeDoc: (sourcePath: string) => void;
  /** 本地 Ollama / 外部 Gemini */
  llmRuntimeMode: LlmRuntimeMode;
  /** 外部模式且已填 Key 时传入，随请求发往本机后端 */
  agentChatLlmBody?: AgentChatLlmBody;
  themeTokens: AppThemeTokens;
}

const QUICK_ACTIONS: Array<{ label: string; message: string }> = [
  { label: '开始工作', message: '开始工作' },
  { label: '打开终端', message: '打开终端' },
  { label: '我的bug', message: '我的bug' },
  { label: '线上bug', message: '线上bug' },
  { label: 'cursor用量', message: 'cursor用量' },
  { label: 'cursor今日用量', message: 'cursor今日用量' },
];

/** 合并菜单项：走 SSE 流式接口，每步实时写入 Logs */
const MERGE_TASKS = [
  { key: 'nova', label: '合并 nova', path: '/merge/nova' },
  { key: 'biz-solution', label: '合并 biz-solution', path: '/merge/biz-solution' },
  { key: 'scm', label: '合并 scm', path: '/merge/scm' },
] as const;

/** 下拉列表：快捷部署 Jenkins 任务（与 config/projects 中有 jenkins 的代号一致） */
const DEPLOY_OPTIONS = [
  { value: '', label: '快捷部署...' },
  { value: 'nova', label: '部署nova' },
  { value: 'cc-web', label: '部署cc-web' },
  { value: 'react18', label: '部署react18' },
  { value: 'base', label: '部署base' },
  { value: 'base18', label: '部署base18' },
  { value: 'biz-solution', label: '部署biz-solution' },
  { value: 'biz-guide', label: '部署biz-guide' },
  { value: 'scm', label: '部署scm' },
];

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
  const workflowHints = [
    '执行工作流 start-work',
    '执行工作流 standalone',
    '执行工作流 upgrade-react18-nova',
    '执行工作流 upgrade-cc-web-nova',
  ];
  const fixedHints = [
    ...QUICK_ACTIONS.map((a) => a.message),
    '升级集测react18的nova版本',
    '升级集测cc-web的nova版本',
    ...MERGE_TASKS.map((t) => t.label),
    ...DEPLOY_OPTIONS.filter((o) => o.value).map((o) => o.label),
    '打开集测环境',
    '打开测试环境',
    '打开json配置中心',
    '打开 Jenkins',
    '我的bug',
    '线上bug',
    '本周已完成任务',
    '本周经我手的bug',
    '写周报',
    '抓取周报信息',
    '本周组内总结',
    'cursor用量',
    '同步cursor登录态',
    'cursor今日用量',
    '添加私人知识库',
    '清除私人知识库',
    '重建知识库索引',
    '增量重建知识库索引',
    '已添加到知识库的文档',
    '知识库有哪些文档',
  ];
  const allCodes = Array.from(new Set(projects.flatMap((p) => p.codes)));
  const jenkinsCodes = Array.from(new Set(projects.filter((p) => p.jenkins).flatMap((p) => p.codes)));
  const mergeCodes = Array.from(new Set(projects.filter((p) => p.merge).flatMap((p) => p.codes)));
  const startHints = allCodes.map((code) => `启动 ${code}`);
  const deployHints = jenkinsCodes.flatMap((code) => [`部署 ${code}`, `部署 ${code} 分支是 test`]);
  const jenkinsOpenHints = jenkinsCodes.flatMap((code) => [`打开 Jenkins 的 ${code}`, `打开jenkins ${code}`]);
  const openIdeHints = allCodes.flatMap((code) => [
    `ws打开${code}`,
    `cursor打开${code}`,
    `code打开${code}`,
    `用 WebStorm 打开 ${code}`,
    `用 Cursor 打开 ${code}`,
    `用 VS Code 打开 ${code}`,
  ]);
  const closeIdeHints = allCodes.flatMap((code) => [
    `关闭ws的${code}`,
    `关闭cursor的${code}`,
    `关闭code的${code}`,
    `关闭 WebStorm 的 ${code}`,
    `关闭 Cursor 的 ${code}`,
    `关闭 VS Code 的 ${code}`,
  ]);
  const mergeHints = mergeCodes.map((code) => `合并 ${code}`);
  const openProjectTerminalHints = allCodes.map((code) => `终端打开 ${code}`);
  return Array.from(
    new Set([
      ...fixedHints,
      ...workflowHints,
      ...startHints,
      ...deployHints,
      ...jenkinsOpenHints,
      ...openIdeHints,
      ...closeIdeHints,
      ...mergeHints,
      ...openProjectTerminalHints,
      ...inputHistory,
    ])
  );
}

function extractMyBugsResult(toolResults?: unknown[]): JiraBugPayload | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      ((item as ToolResultItem | undefined)?.tool === 'search_my_bugs' ||
        (item as ToolResultItem | undefined)?.tool === 'search_online_bugs' ||
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

function extractCursorUsageResult(toolResults?: unknown[]): CursorUsageToolResult | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) =>
      ((item as ToolResultItem | undefined)?.tool === 'get_cursor_usage' ||
        (item as ToolResultItem | undefined)?.tool === 'get_cursor_today_usage') &&
      (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  return row.result as CursorUsageToolResult;
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

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function formatTokens(value: number | undefined, fallback = '--'): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  return `${compact} tokens`;
}

function formatCost(value: number | undefined, fallback = '--'): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `US$${value.toFixed(2)}`;
}

function formatTokenCompact(value: number | undefined, fallback = '--'): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function toNumberSafe(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function formatUsageDate(timestamp: string | undefined): string {
  const ms = toNumberSafe(timestamp);
  if (ms == null) return '--';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function mapUsageKind(kind: string | undefined): string {
  if (!kind) return '--';
  if (kind.includes('INCLUDED')) return 'Included';
  if (kind.includes('PREMIUM')) return 'Premium';
  return kind.replace(/^USAGE_EVENT_KIND_/, '').toLowerCase();
}

function normalizeCursorRows(data: unknown): CursorUsageRow[] {
  const rows: CursorUsageRow[] = [];
  const pushAggregationRow = (record: Record<string, unknown>) => {
    const item = pickString(record, ['modelIntent', 'model_intent', 'intent', 'name']) || 'unknown';
    const input = pickNumber(record, ['inputTokens', 'input_tokens']) ?? 0;
    const output = pickNumber(record, ['outputTokens', 'output_tokens']) ?? 0;
    const cacheRead = pickNumber(record, ['cacheReadTokens', 'cache_read_tokens']) ?? 0;
    const cacheWrite = pickNumber(record, ['cacheWriteTokens', 'cache_write_tokens']) ?? 0;
    const tokensNumber = input + output + cacheRead + cacheWrite;
    const costCents = pickNumber(record, ['totalCents', 'total_cents']);
    const costNumber = costCents != null ? costCents / 100 : undefined;
    rows.push({
      item,
      tokensText: formatTokens(tokensNumber),
      costText: formatCost(costNumber),
      includedText: 'Included',
      tokensNumber,
      costNumber,
    });
  };
  const pushRow = (record: Record<string, unknown>) => {
    const item = pickString(record, ['item', 'name', 'model', 'label', 'type']);
    const tokensNumber = pickNumber(record, ['tokens', 'tokenCount', 'totalTokens', 'usageTokens']);
    const costNumber = pickNumber(record, ['cost', 'totalCost', 'usdCost', 'amount']);
    const tokensText = pickString(record, ['tokensText', 'tokenText']) || formatTokens(tokensNumber);
    const costText = pickString(record, ['costText']) || formatCost(costNumber);
    const includedFlag = record.included ?? record.includedInPro ?? record.isIncluded;
    const includedText =
      typeof record.includedText === 'string'
        ? record.includedText
        : includedFlag === true
          ? 'Included'
          : includedFlag === false
            ? '--'
            : 'Included';
    if (!item) return;
    rows.push({ item, tokensText, costText, includedText, tokensNumber, costNumber });
  };

  const scanArray = (input: unknown[]) => {
    for (const item of input) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        pushRow(item as Record<string, unknown>);
      }
    }
  };

  if (Array.isArray(data)) {
    scanArray(data);
    return rows;
  }
  if (!data || typeof data !== 'object') return rows;
  const dataRecord = data as Record<string, unknown>;
  const root =
    dataRecord.response && typeof dataRecord.response === 'object'
      ? (dataRecord.response as Record<string, unknown>)
      : dataRecord;
  const aggregations = root.aggregations;
  if (Array.isArray(aggregations)) {
    for (const item of aggregations) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        pushAggregationRow(item as Record<string, unknown>);
      }
    }
    if (rows.length > 0) return rows;
  }
  const candidateLists = ['items', 'rows', 'models', 'usage', 'events', 'data', 'aggregatedUsage', 'aggregated_usage'];
  for (const key of candidateLists) {
    const value = root[key];
    if (Array.isArray(value)) scanArray(value);
  }
  if (rows.length > 0) return rows;
  for (const [key, value] of Object.entries(root)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const obj = value as Record<string, unknown>;
    const tokensNumber = pickNumber(obj, ['tokens', 'tokenCount', 'totalTokens', 'usageTokens']);
    const costNumber = pickNumber(obj, ['cost', 'totalCost', 'usdCost', 'amount']);
    if (tokensNumber == null && costNumber == null) continue;
    rows.push({
      item: key,
      tokensText: formatTokens(tokensNumber),
      costText: formatCost(costNumber),
      includedText: 'Included',
      tokensNumber,
      costNumber,
    });
  }
  return rows;
}

function renderCursorUsage(toolResults: unknown[] | undefined, themeTokens: AppThemeTokens) {
  const payload = extractCursorUsageResult(toolResults);
  if (!payload) return null;
  const dataObj = payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : {};
  const rows = normalizeCursorRows(payload.data);
  if (!rows.length) return null;
  const rangeText = (() => {
    const startRaw =
      pickString(dataObj, ['startDate', 'start_date', 'from', 'periodStart']) ||
      pickString((dataObj.request as Record<string, unknown>) || {}, ['startDate', 'start_date', 'from', 'periodStart']);
    const startNum =
      pickNumber(dataObj, ['startDate', 'start_date', 'from', 'periodStart']) ??
      pickNumber((dataObj.request as Record<string, unknown>) || {}, ['startDate', 'start_date', 'from', 'periodStart']);
    const end = pickString(dataObj, ['endDate', 'end_date', 'to', 'periodEnd']);
    const startText =
      startRaw ||
      (startNum != null && Number.isFinite(startNum)
        ? new Date(startNum).toLocaleString('zh-CN', { hour12: false })
        : '');
    if (startText && end) return `${startText} - ${end}`;
    if (startText) return `Start: ${startText}`;
    return '';
  })();
  const totalTokens = rows.reduce((sum, row) => sum + (row.tokensNumber ?? 0), 0);
  const totalCost = rows.reduce((sum, row) => sum + (row.costNumber ?? 0), 0);
  return (
    <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, color: themeTokens.textPrimary, borderRadius: 6, border: `1px solid ${themeTokens.inputBorder}`, padding: 12 }}>
      {rangeText && <div style={{ fontSize: 13, marginBottom: 10, color: themeTokens.textSecondary }}>{rangeText}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, color: themeTokens.textSecondary }}>Item</th>
            <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, color: themeTokens.textSecondary }}>Tokens</th>
            <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, color: themeTokens.textSecondary }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, fontWeight: 600 }}>Included in Pro</td>
            <td style={{ borderBottom: `1px solid ${themeTokens.inputBorder}` }} />
            <td style={{ borderBottom: `1px solid ${themeTokens.inputBorder}` }} />
          </tr>
          {rows.map((row, idx) => (
            <tr key={`${row.item}-${idx}`}>
              <td style={{ padding: '9px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>{row.item}</td>
              <td style={{ padding: '9px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, textAlign: 'right', whiteSpace: 'nowrap' }}>{row.tokensText}</td>
              <td style={{ padding: '9px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {row.costText} <span style={{ color: themeTokens.textSecondary }}>{row.includedText}</span>
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: '10px', fontWeight: 600 }}>Total</td>
            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatTokens(totalTokens, '--')}</td>
            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {formatCost(totalCost, '--')} <span style={{ color: themeTokens.textSecondary, fontWeight: 400 }}>Included</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function renderCursorTodayUsage(toolResults: unknown[] | undefined, themeTokens: AppThemeTokens) {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find(
    (item) => (item as ToolResultItem | undefined)?.tool === 'get_cursor_today_usage' && (item as ToolResultItem | undefined)?.result
  ) as ToolResultItem | undefined;
  if (!row || typeof row.result !== 'object' || row.result == null) return null;
  const payload = row.result as CursorUsageToolResult;
  const dataObj =
    payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : {};
  const response =
    dataObj.response && typeof dataObj.response === 'object'
      ? (dataObj.response as Record<string, unknown>)
      : {};
  const usageEvents = Array.isArray(response.usageEventsDisplay)
    ? (response.usageEventsDisplay as CursorTodayUsageEvent[])
    : [];
  if (!usageEvents.length) return null;

  const rows = usageEvents.map((event) => {
    const input = toNumberSafe(event.tokenUsage?.inputTokens) ?? 0;
    const output = toNumberSafe(event.tokenUsage?.outputTokens) ?? 0;
    const cacheRead = toNumberSafe(event.tokenUsage?.cacheReadTokens) ?? 0;
    const cacheWrite = toNumberSafe(event.tokenUsage?.cacheWriteTokens) ?? 0;
    const tokens = input + output + cacheRead + cacheWrite;
    const cents = toNumberSafe(event.chargedCents);
    const usd = cents != null ? cents / 100 : undefined;
    return {
      date: formatUsageDate(event.timestamp),
      type: mapUsageKind(event.kind),
      model: event.model || '--',
      tokensText: formatTokenCompact(tokens),
      costText: `${formatCost(usd)} Included`,
    };
  });

  return (
    <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, color: themeTokens.textPrimary, borderRadius: 10, border: `1px solid ${themeTokens.inputBorder}`, padding: 10 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, color: themeTokens.textSecondary }}>Date</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, color: themeTokens.textSecondary }}>Type</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, color: themeTokens.textSecondary }}>Model</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, color: themeTokens.textSecondary }}>Tokens</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, color: themeTokens.textSecondary }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, idx) => (
              <tr key={`${item.date}-${idx}`}>
                <td style={{ padding: '10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>{item.date}</td>
                <td style={{ padding: '10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>{item.type}</td>
                <td style={{ padding: '10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>{item.model}</td>
                <td style={{ padding: '10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, textAlign: 'right', whiteSpace: 'nowrap' }}>{item.tokensText}</td>
                <td style={{ padding: '10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, textAlign: 'right', whiteSpace: 'nowrap' }}>{item.costText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
) {
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
            {citations.slice(0, 4).map((item, idx) => (
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
  const myBugs = extractMyBugsResult(toolResults);
  if (myBugs) {
    const issues = myBugs.issues ?? [];
    return (
      <div style={{ marginTop: 8, background: themeTokens.workspacePanelSubtleBackground, borderRadius: 6, border: `1px solid ${themeTokens.inputBorder}`, overflow: 'hidden' }}>
        <div style={{ padding: '8px 10px', fontSize: 12, color: themeTokens.textSecondary, borderBottom: `1px solid ${themeTokens.inputBorder}` }}>
          共 {myBugs.total ?? issues.length} 条，当前展示 {issues.length} 条
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: themeTokens.textPrimary, tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: themeTokens.workspacePanelBackground }}>
                <th style={{ width: '12%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>关键字</th>
                <th style={{ width: '30%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>摘要</th>
                <th style={{ width: '9%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>状态</th>
                <th style={{ width: '9%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>解决结果</th>
                <th style={{ width: '11%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>修复版本</th>
                <th style={{ width: '11%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>经办人</th>
                <th style={{ width: '18%', textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}` }}>开发人员</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, idx) => (
                <tr key={`${issue.key ?? 'issue'}-${idx}`} style={{ background: idx % 2 === 0 ? themeTokens.workspacePanelSubtleBackground : themeTokens.workspacePanelBackground }}>
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
                </tr>
              ))}
              {issues.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '10px', color: themeTokens.textSecondary }}>
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  const cursorTodayUsage = renderCursorTodayUsage(toolResults, themeTokens);
  if (cursorTodayUsage) return cursorTodayUsage;
  const cursorUsage = renderCursorUsage(toolResults, themeTokens);
  if (cursorUsage) return cursorUsage;
  if (toolResults && toolResults.length > 0) {
    return (
      <pre style={{ marginTop: 8, fontSize: 12, background: themeTokens.workspacePanelSubtleBackground, color: themeTokens.textPrimary, padding: 8, borderRadius: 4, overflow: 'auto' }}>
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

export function ChatPanel({ apiBase, addLog, onStartWorkEmbedded, onOpenKnowledgeBase, onOpenKnowledgeDoc, llmRuntimeMode, agentChatLlmBody, themeTokens }: ChatPanelProps) {
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
    const content = hasDeployPoll
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
    const mergeTask = MERGE_TASKS.find((t) => msg === t.label || new RegExp(`合并\\s*${t.key}`, 'i').test(msg));
    if (mergeTask) {
      setLoading(false);
      await executeMerge(mergeTask.path, mergeTask.label);
      return;
    }
    if (msg === '添加私人知识库') {
      setLoading(false);
      onOpenKnowledgeBase();
      addLog('已打开私人知识库页签');
      setMessages((prev) => [...prev, { role: 'assistant', content: '已打开私人知识库页签，请选择目录并导入 Markdown 文档。' }]);
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
          const line = formatToolProgressLogLine(e);
          addLog(line);
          setToolProgressLines((prev) => [...prev.slice(-40), line]);
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
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
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
          onClick={() => setMessages([])}
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
            [Chat] 输入指令或点击上方快捷按钮，例如：开始工作、终端打开 react18、升级集测react18的nova版本、启动 react18、打开 Jenkins、部署order-service
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
              onOpenKnowledgeDoc
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
        {loading && (
          <p style={{ color: themeTokens.textSecondary }}>
            {toolStreamLive && (toolStreamLive.thinking || toolStreamLive.content)
              ? '流式输出中（见上方「工具内流式输出」）…'
              : streamLive
                ? '连接模型并处理中…'
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
