/* AI 生成 By Peng.Guo */
/** 依赖 Electron 页签或与 Cursor Shell 重复的工具，CLI 返回 desktop_only */
export const DESKTOP_ONLY_TOOL_NAMES = new Set([
  'open_knowledge_base_manager',
  'open_command_stats',
  'open_md_to_pdf',
  'open_terminal',
  'run_shell',
]);

export function isDesktopOnlyTool(name: string): boolean {
  return DESKTOP_ONLY_TOOL_NAMES.has(name);
}
