/* AI 生成 By Peng.Guo */
/**
 * 指令目录（单一事实源）：固定口令 exact、操作前缀 prefix、工具映射。
 */
export type ExactCommandRule = {
  label: string;
  tool: string;
  arguments?: Record<string, unknown>;
  buildArguments?: () => Record<string, unknown>;
};

/** 固定口令列表（与聊天补全 FIXED_COMMAND_HINTS 同源） */
export const COMMAND_CATALOG_EXACT_LABELS = [
  '开始工作',
  '开始工作，使用外部终端',
  '打开终端',
  '我的bug',
  '经办人bug',
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
  '统计常用指令',
  'md生成pdf',
  '合并nova并部署相关服务',
  '打开集测环境',
  '打开测试环境',
  '打开json配置中心',
  '打开 Jenkins',
] as const;

export type FixedCommandLabel = (typeof COMMAND_CATALOG_EXACT_LABELS)[number];

function jenkinsRootUrl(): string {
  const base = (process.env.JENKINS_BASE_URL ?? '').trim().replace(/\/$/, '');
  return base || 'about:blank';
}

export const EXACT_COMMAND_RULES: readonly ExactCommandRule[] = [
  { label: '开始工作', tool: 'run_workflow', arguments: { name: 'start-work' } },
  {
    label: '开始工作，使用外部终端',
    tool: 'run_workflow',
    arguments: { name: 'start-work-external-terminal' },
  },
  { label: '打开终端', tool: 'open_terminal', arguments: {} },
  { label: '我的bug', tool: 'search_my_bugs', arguments: {} },
  { label: '经办人bug', tool: 'search_assignee_bugs', arguments: {} },
  { label: '线上bug', tool: 'search_online_bugs', arguments: {} },
  { label: '本周已完成任务', tool: 'search_weekly_done_tasks', arguments: {} },
  { label: '本周经我手的bug', tool: 'search_weekly_handoff_bugs', arguments: {} },
  { label: '写周报', tool: 'write_weekly_report', arguments: {} },
  { label: '抓取周报信息', tool: 'fetch_weekly_report_info', arguments: {} },
  { label: '本周组内总结', tool: 'generate_weekly_team_summary', arguments: {} },
  { label: 'cursor用量', tool: 'get_cursor_usage', arguments: {} },
  { label: '同步cursor登录态', tool: 'sync_cursor_cookie', arguments: {} },
  { label: 'cursor今日用量', tool: 'get_cursor_today_usage', arguments: {} },
  { label: '添加私人知识库', tool: 'open_knowledge_base_manager', arguments: {} },
  { label: '清除私人知识库', tool: 'clear_private_knowledge_base', arguments: {} },
  { label: '重建知识库索引', tool: 'rebuild_knowledge_base_index', arguments: {} },
  { label: '增量重建知识库索引', tool: 'incremental_rebuild_knowledge_base_index', arguments: {} },
  { label: '已添加到知识库的文档', tool: 'list_knowledge_docs', arguments: {} },
  { label: '知识库有哪些文档', tool: 'list_knowledge_docs', arguments: {} },
  { label: '统计常用指令', tool: 'open_command_stats', arguments: {} },
  { label: 'md生成pdf', tool: 'open_md_to_pdf', arguments: {} },
  { label: '合并nova并部署相关服务', tool: 'composite_nova_merge_and_deploy', arguments: {} },
  { label: '打开集测环境', tool: 'open_jice_env', arguments: {} },
  { label: '打开测试环境', tool: 'open_test_env', arguments: {} },
  { label: '打开json配置中心', tool: 'open_json_config_center', arguments: {} },
  {
    label: '打开 Jenkins',
    tool: 'open_browser',
    buildArguments: () => ({ url: jenkinsRootUrl() }),
  },
];

/** 归一化用户输入：去首尾空白、合并连续空白 */
export function normalizeCommandText(userMessage: string): string {
  return (userMessage ?? '').trim().replace(/\s+/g, ' ');
}

/** 操作类口令前缀（用于 KB 反向闸门，命中则禁止 query_knowledge_base） */
export const ACTION_PREFIX_PATTERNS: readonly RegExp[] = [
  /^部署(?:\s|$)/i,
  /^合并(?:\s|$)/i,
  /^启动\s+[a-z0-9][a-z0-9-]*\s*$/i,
  /^执行工作流\s+/i,
  /^开始工作/i,
  /^打开终端\s*$/i,
  /^打开(?:测试环境|集测环境|json配置中心)\s*$/i,
  /^打开\s*jenkins\b/i,
  /^打开\s*jenkins\s+的\s+/i,
  /^打开jenkins\s+/i,
  /终端\s*打开/i,
  /^合并nova并部署相关服务\s*$/i,
  /^(ws|cursor|code)打开/i,
  /^用\s*(WebStorm|Cursor|VS\s*Code)\s*打开\s+/i,
  /^关闭(ws|cursor|code)的/i,
  /^关闭\s*(WebStorm|Cursor|VS\s*Code)\s*的\s+/i,
  /^升级\s*集测\s+/i,
];

export const TERMINAL_TOOL_NAME = 'open_terminal';

const exactByNormalized = new Map<string, ExactCommandRule>(
  EXACT_COMMAND_RULES.map((rule) => [normalizeCommandText(rule.label), rule])
);

export function resolveExactCommand(userMessage: string): ExactCommandRule | undefined {
  const key = normalizeCommandText(userMessage);
  return exactByNormalized.get(key);
}

export function resolveExactToolCall(userMessage: string): { tool: string; arguments: Record<string, unknown> } | null {
  const rule = resolveExactCommand(userMessage);
  if (!rule) return null;
  const args = rule.buildArguments ? rule.buildArguments() : { ...(rule.arguments ?? {}) };
  return { tool: rule.tool, arguments: args };
}

export function matchesActionPrefix(userMessage: string): boolean {
  const text = (userMessage ?? '').trim();
  if (!text) return false;
  const compact = text.replace(/\s+/g, '');
  if (/^打开(测试环境|集测环境|json配置中心)$/i.test(compact)) return true;
  return ACTION_PREFIX_PATTERNS.some((re) => re.test(text));
}

export function isCloudEnvOpenIntent(userMessage: string): boolean {
  const compact = normalizeCommandText(userMessage).replace(/\s/g, '');
  return /打开(测试环境|集测环境|json配置中心)/i.test(compact);
}

export function listExactCommandTools(): string[] {
  return [...new Set(EXACT_COMMAND_RULES.map((r) => r.tool))];
}
