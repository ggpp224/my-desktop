/* AI 生成 By Peng.Guo */
import { buildSupportedCommandHints, type ProjectCapabilityInput } from '../config/command-hints.js';

/** 斜杠面板应能搜到的口令：与桌面端补全同一套 hints */
export function collectSlashSpokenCommands(projects: ProjectCapabilityInput[]): string[] {
  return [...new Set(buildSupportedCommandHints(projects).map((item) => item.trim()).filter(Boolean))];
}

/** Cursor 命令文件名：保留空格，便于搜「部署 nova」 */
export function slashCommandFileStem(spoken: string): string {
  return spoken.replace(/[/\\]/g, '-');
}
