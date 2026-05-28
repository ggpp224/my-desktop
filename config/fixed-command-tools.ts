/* AI 生成 By Peng.Guo */
/**
 * 固定口令 → 候选 Agent 工具名（与 command-hints.FIXED_COMMAND_HINTS 一一对应）。
 * 用于首轮 tool_calls 时收窄工具全集，降低小模型在相近「打开*」工具间的误选，不替代 LLM 决策。
 */
import { FIXED_COMMAND_HINTS } from './command-hints.js';

export type FixedCommandHint = (typeof FIXED_COMMAND_HINTS)[number];

/** 归一化用户输入：去首尾空白、合并连续空白，便于与固定口令比对 */
export function normalizeFixedCommandText(userMessage: string): string {
  return (userMessage ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * 固定口令命中时，仅向模型暴露这些工具（仍由模型发起 tool_calls）。
 * 未列出的固定口令返回 undefined，表示沿用全量 toolsSchema。
 */
export const FIXED_COMMAND_TOOL_NAMES: Partial<Record<FixedCommandHint, readonly string[]>> = {
  开始工作: ['run_workflow'],
  '开始工作，使用外部终端': ['run_workflow'],
  打开终端: ['open_terminal'],
  我的bug: ['search_my_bugs'],
  线上bug: ['search_online_bugs'],
  本周已完成任务: ['search_weekly_done_tasks'],
  '本周经我手的bug': ['search_weekly_handoff_bugs'],
  写周报: ['write_weekly_report'],
  抓取周报信息: ['fetch_weekly_report_info'],
  本周组内总结: ['generate_weekly_team_summary'],
  cursor用量: ['get_cursor_usage'],
  同步cursor登录态: ['sync_cursor_cookie'],
  cursor今日用量: ['get_cursor_today_usage'],
  添加私人知识库: ['open_knowledge_base_manager'],
  清除私人知识库: ['clear_private_knowledge_base'],
  重建知识库索引: ['rebuild_knowledge_base_index'],
  增量重建知识库索引: ['incremental_rebuild_knowledge_base_index'],
  已添加到知识库的文档: ['list_knowledge_docs'],
  知识库有哪些文档: ['list_knowledge_docs'],
  统计常用指令: ['open_command_stats'],
  md生成pdf: ['open_md_to_pdf'],
  合并nova并部署相关服务: ['composite_nova_merge_and_deploy'],
  打开集测环境: ['open_jice_env'],
  打开测试环境: ['open_test_env'],
  打开json配置中心: ['open_json_config_center'],
  '打开 Jenkins': ['open_browser'],
};

/** 用户话术含云环境/配置中心时，不应出现 open_terminal（与「打开终端」区分） */
export const TERMINAL_TOOL_NAME = 'open_terminal';

export function isCloudEnvOpenIntent(userMessage: string): boolean {
  const compact = normalizeFixedCommandText(userMessage).replace(/\s/g, '');
  return /打开(测试环境|集测环境|json配置中心)/i.test(compact);
}

export function resolveFixedCommandToolNames(userMessage: string): readonly string[] | undefined {
  const normalized = normalizeFixedCommandText(userMessage);
  return FIXED_COMMAND_TOOL_NAMES[normalized as FixedCommandHint];
}
