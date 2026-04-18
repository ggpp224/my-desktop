/* AI 生成 By Peng.Guo */
import { useState, useRef, useEffect } from 'react';
import { appendToolResultsToLogs } from './log-tools';
import { withJenkinsMarkdownLink } from './domain/deploy/jenkinsDeployDisplay';
import type { DeployPollingTarget } from './domain/deploy/models';
import { LinkifiedText } from './view/LinkifiedText';
import { startDeployPolling } from './viewmodel/deploy/useDeployPolling';
import type { WorkTerminal } from './MyWorkPanel';
import {
  fetchAgentCurrentModel,
  fetchAgentOllamaInstalledModels,
  postSwitchAgentModel,
} from './infrastructure/agent/ollamaModelApi';
import { postAgentChatStream } from './infrastructure/agent/agentChatStreamApi';

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
  url?: string;
};
type JiraBugPayload = { total?: number; issues?: JiraBugItem[] };
type WeeklyReportPayload = { total?: number; jiraTitles?: string[]; report?: string };
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

interface ChatPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
  onStartWorkEmbedded: (payload: { sessionId: string; terminals: WorkTerminal[] }) => void;
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
    '写周报',
    'cursor用量',
    '同步cursor登录态',
    'cursor今日用量',
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
        (item as ToolResultItem | undefined)?.tool === 'search_weekly_done_tasks') &&
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

function renderCursorUsage(toolResults?: unknown[]) {
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
    <div style={{ marginTop: 8, background: '#f3f4f6', color: '#111827', borderRadius: 6, border: '1px solid #d1d5db', padding: 12 }}>
      {rangeText && <div style={{ fontSize: 13, marginBottom: 10, color: '#374151' }}>{rangeText}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #d1d5db', color: '#4b5563' }}>Item</th>
            <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #d1d5db', color: '#4b5563' }}>Tokens</th>
            <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #d1d5db', color: '#4b5563' }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #d1d5db', fontWeight: 600 }}>Included in Pro</td>
            <td style={{ borderBottom: '1px solid #d1d5db' }} />
            <td style={{ borderBottom: '1px solid #d1d5db' }} />
          </tr>
          {rows.map((row, idx) => (
            <tr key={`${row.item}-${idx}`}>
              <td style={{ padding: '9px 10px', borderBottom: '1px solid #e5e7eb' }}>{row.item}</td>
              <td style={{ padding: '9px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', whiteSpace: 'nowrap' }}>{row.tokensText}</td>
              <td style={{ padding: '9px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {row.costText} <span style={{ color: '#6b7280' }}>{row.includedText}</span>
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: '10px', fontWeight: 600 }}>Total</td>
            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatTokens(totalTokens, '--')}</td>
            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {formatCost(totalCost, '--')} <span style={{ color: '#6b7280', fontWeight: 400 }}>Included</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function renderCursorTodayUsage(toolResults?: unknown[]) {
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
    <div style={{ marginTop: 8, background: '#f3f4f6', color: '#111827', borderRadius: 10, border: '1px solid #d1d5db', padding: 10 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #d1d5db', color: '#6b7280' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #d1d5db', color: '#6b7280' }}>Type</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #d1d5db', color: '#6b7280' }}>Model</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #d1d5db', color: '#6b7280' }}>Tokens</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #d1d5db', color: '#6b7280' }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, idx) => (
              <tr key={`${item.date}-${idx}`}>
                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>{item.date}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>{item.type}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>{item.model}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', whiteSpace: 'nowrap' }}>{item.tokensText}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', whiteSpace: 'nowrap' }}>{item.costText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderToolResults(toolResults: unknown[] | undefined, onTip: (message: string) => void) {
  const weeklyReport = extractWeeklyReportResult(toolResults);
  if (weeklyReport?.report) {
    const titleCount = Array.isArray(weeklyReport.jiraTitles) ? weeklyReport.jiraTitles.length : weeklyReport.total ?? 0;
    const reportHeader = `已基于 ${titleCount} 条 Jira 任务生成周报`;
    return (
      <div style={{ marginTop: 8, background: '#1a1a2e', borderRadius: 6, border: '1px solid #2a2a3d', padding: 10 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>{reportHeader}</span>
          <button
            type="button"
            onClick={async () => {
              try {
                const textToCopy = `${reportHeader}\n\n${weeklyReport.report ?? ''}`.trim();
                await navigator.clipboard.writeText(textToCopy);
                onTip('周报已复制到剪贴板');
              } catch {
                onTip('复制失败，请手动复制');
              }
            }}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: '1px solid #475569',
              background: '#0f3460',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            复制周报
          </button>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', color: '#e2e8f0', fontSize: 13, lineHeight: 1.7 }}>{weeklyReport.report}</div>
      </div>
    );
  }
  const myBugs = extractMyBugsResult(toolResults);
  if (myBugs) {
    const issues = myBugs.issues ?? [];
    return (
      <div style={{ marginTop: 8, background: '#1a1a2e', borderRadius: 6, border: '1px solid #2a2a3d', overflow: 'hidden' }}>
        <div style={{ padding: '8px 10px', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid #2a2a3d' }}>
          共 {myBugs.total ?? issues.length} 条，当前展示 {issues.length} 条
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e2e8f0', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#111827' }}>
                <th style={{ width: '14%', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #2a2a3d' }}>关键字</th>
                <th style={{ width: '38%', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #2a2a3d' }}>摘要</th>
                <th style={{ width: '10%', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #2a2a3d' }}>状态</th>
                <th style={{ width: '10%', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #2a2a3d' }}>解决结果</th>
                <th style={{ width: '14%', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #2a2a3d' }}>修复版本</th>
                <th style={{ width: '14%', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #2a2a3d' }}>经办人</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, idx) => (
                <tr key={`${issue.key ?? 'issue'}-${idx}`} style={{ background: idx % 2 === 0 ? '#0f172a' : '#111827' }}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #2a2a3d', whiteSpace: 'nowrap' }}>
                    {issue.url ? (
                      <a href={issue.url} target="_blank" rel="noreferrer" style={{ color: '#93c5fd', textDecoration: 'none' }}>
                        {issue.key || '--'}
                      </a>
                    ) : (
                      issue.key || '--'
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #2a2a3d', wordBreak: 'break-word' }}>{issue.summary || '--'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #2a2a3d', wordBreak: 'break-word' }}>{issue.status || '--'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #2a2a3d', wordBreak: 'break-word' }}>{issue.resolution || '--'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #2a2a3d', wordBreak: 'break-word' }}>{issue.fixVersion || '--'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #2a2a3d', wordBreak: 'break-word' }}>{issue.assignee || '--'}</td>
                </tr>
              ))}
              {issues.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '10px', color: '#94a3b8' }}>
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
  const cursorTodayUsage = renderCursorTodayUsage(toolResults);
  if (cursorTodayUsage) return cursorTodayUsage;
  const cursorUsage = renderCursorUsage(toolResults);
  if (cursorUsage) return cursorUsage;
  if (toolResults && toolResults.length > 0) {
    return (
      <pre style={{ marginTop: 8, fontSize: 12, background: '#1a1a2e', padding: 8, borderRadius: 4, overflow: 'auto' }}>
        {JSON.stringify(toolResults, null, 2)}
      </pre>
    );
  }
  return null;
}

export function ChatPanel({ apiBase, addLog, onStartWorkEmbedded }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; toolResults?: unknown[] }>>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [streamLive, setStreamLive] = useState<{ thinking: string; content: string } | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const streamAccumRef = useRef({ thinking: '', content: '' });
  const [completionList, setCompletionList] = useState<string[]>([]);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);
  const [tipMessage, setTipMessage] = useState('');
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const deployPollRef = useRef<{ stop: () => void } | null>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const feedbackListRef = useRef<HTMLDivElement>(null);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef('');

  useEffect(() => () => {
    if (deployPollRef.current) deployPollRef.current.stop();
  }, []);

  useEffect(() => {
    if (!apiBase) return;
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
  }, [apiBase]);

  useEffect(
    () => () => {
      chatAbortRef.current?.abort();
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
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, streamLive]);

  useEffect(() => {
    if (!tipMessage) return;
    const timer = setTimeout(() => setTipMessage(''), 2000);
    return () => clearTimeout(timer);
  }, [tipMessage]);

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
    addLog(`发送: ${msg}`);
    const mergeTask = MERGE_TASKS.find((t) => msg === t.label || new RegExp(`合并\\s*${t.key}`, 'i').test(msg));
    if (mergeTask) {
      setLoading(false);
      await executeMerge(mergeTask.path, mergeTask.label);
      return;
    }
    chatAbortRef.current?.abort();
    chatAbortRef.current = new AbortController();
    const { signal } = chatAbortRef.current;
    streamAccumRef.current = { thinking: '', content: '' };
    setStreamLive({ thinking: '', content: '' });
    let streamFlushRaf: number | null = null;
    const flushStreamLive = () => {
      if (streamFlushRaf != null) cancelAnimationFrame(streamFlushRaf);
      streamFlushRaf = requestAnimationFrame(() => {
        streamFlushRaf = null;
        setStreamLive({
          thinking: streamAccumRef.current.thinking,
          content: streamAccumRef.current.content,
        });
      });
    };
    try {
      await postAgentChatStream(apiBase, msg, signal, {
        onLlmDelta: (d) => {
          streamAccumRef.current.thinking += d.thinkingDelta ?? '';
          streamAccumRef.current.content += d.contentDelta ?? '';
          flushStreamLive();
        },
        onResult: (raw) => {
          if (streamFlushRaf != null) {
            cancelAnimationFrame(streamFlushRaf);
            streamFlushRaf = null;
          }
          setStreamLive(null);
          const data = raw as AgentResult;
          handleAgentResponse(data, true);
        },
        onError: (errMsg) => {
          setStreamLive(null);
          setLoading(false);
          if (errMsg.trim()) {
            addLog(`请求异常: ${errMsg}`);
            setMessages((prev) => [...prev, { role: 'assistant', content: `请求失败: ${errMsg}` }]);
          }
        },
      });
    } catch (e) {
      setStreamLive(null);
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
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {QUICK_ACTIONS.map(({ label, message }) => (
          <button
            key={label}
            type="button"
            onClick={() => send(message)}
            disabled={loading}
            style={{
              padding: '8px 14px',
              background: '#0f3460',
              color: '#eaeaea',
              border: '1px solid #333',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMessages([])}
          title="清屏"
          style={{
            marginLeft: 'auto',
            width: 28,
            height: 28,
            padding: 0,
            border: '1px solid #333',
            borderRadius: 6,
            background: '#16213e',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ⊗
        </button>
      </div>
      <div ref={feedbackListRef} style={{ flex: 1, overflow: 'auto', marginBottom: 12, background: '#0d0d1a', borderRadius: 8, padding: 12 }}>
        {messages.length === 0 && (
          <p style={{ color: '#888' }}>
            [Chat] 输入指令或点击上方快捷按钮，例如：开始工作、终端打开 react18、升级集测react18的nova版本、启动 react18、打开 Jenkins、部署order-service
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <strong style={{ color: m.role === 'user' ? '#7f9cf5' : '#68d391' }}>{m.role === 'user' ? 'You' : 'AI'}:</strong>{' '}
            <LinkifiedText text={m.content} />
            {renderToolResults(m.toolResults, setTipMessage)}
          </div>
        ))}
        {streamLive && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#111827',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }}
          >
            {streamLive.thinking ? (
              <>
                <div style={{ fontSize: 13, color: '#c4b5fd', marginBottom: 8, fontWeight: 600 }}>Thinking…</div>
                <pre
                  style={{
                    margin: '0 0 8px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 12,
                    color: '#e9d5ff',
                    maxHeight: 280,
                    overflow: 'auto',
                    lineHeight: 1.45,
                  }}
                >
                  {streamLive.thinking}
                </pre>
                {streamLive.content ? (
                  <div style={{ fontSize: 12, color: '#86efac', margin: '0 0 8px' }}>...done thinking.</div>
                ) : null}
              </>
            ) : (
              !streamLive.content && (
                <div style={{ fontSize: 13, color: '#c4b5fd', marginBottom: 8, fontWeight: 600 }}>Thinking…</div>
              )
            )}
            {!streamLive.thinking && !streamLive.content && (
              <div style={{ fontSize: 12, color: '#64748b' }}>已请求流式推理；若久无文字请升级 Ollama，或检查 .env 中 OLLAMA_THINK</div>
            )}
            {streamLive.content ? (
              <>
                <div style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 6px' }}>Answer</div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 13,
                    color: '#e2e8f0',
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
        {loading && (
          <p style={{ color: '#888' }}>
            {streamLive && (streamLive.thinking || streamLive.content) ? '工具执行或收尾中…' : streamLive ? '连接模型…' : '处理中…'}
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
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#e2e8f0',
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
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
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
            disabled={loading}
            rows={3}
            style={{
              width: '100%',
              minHeight: 60,
              padding: 10,
              background: '#16213e',
              border: '1px solid #333',
              borderRadius: 6,
              color: '#eaeaea',
              resize: 'vertical',
              font: 'inherit',
              boxSizing: 'border-box',
            }}
          />
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
                background: '#1a1a2e',
                border: '1px solid #333',
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
                    background: i === completionIndex ? '#0f3460' : 'transparent',
                    color: '#eaeaea',
                    fontSize: 13,
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <span>Ollama 模型</span>
            <select
              value={currentModel}
              onFocus={refreshOllamaModels}
              onChange={(e) => void handleModelSelectChange(e.target.value)}
              title="从本机已安装模型中选择；切换时会停止当前推理并卸载上一模型"
              style={{
                maxWidth: 220,
                fontSize: 12,
                padding: '6px 8px',
                background: '#16213e',
                color: '#e2e8f0',
                border: '1px solid #334155',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {currentModel && !installedModels.includes(currentModel) && (
                <option value={currentModel}>{currentModel}</option>
              )}
              {installedModels.length === 0 && !currentModel && <option value="">（无已安装模型）</option>}
              {installedModels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: '#0f3460',
              color: '#eaeaea',
              border: '1px solid #333',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            发送
          </button>
        </div>
      </form>
    </section>
  );
}
