/* AI 生成 By Peng.Guo */
/**
 * @deprecated 请使用 config/command-catalog.ts。本文件仅保留兼容 re-export。
 */
import {
  COMMAND_CATALOG_EXACT_LABELS,
  EXACT_COMMAND_RULES,
  type FixedCommandLabel,
  isCloudEnvOpenIntent,
  normalizeCommandText,
  resolveExactCommand,
  TERMINAL_TOOL_NAME,
} from './command-catalog.js';

export { COMMAND_CATALOG_EXACT_LABELS as FIXED_COMMAND_HINTS };
export type FixedCommandHint = FixedCommandLabel;

export const FIXED_COMMAND_TOOL_NAMES = Object.fromEntries(
  EXACT_COMMAND_RULES.map((r) => [r.label, [r.tool] as const])
) as Partial<Record<FixedCommandHint, readonly string[]>>;

export { normalizeCommandText as normalizeFixedCommandText };
export { isCloudEnvOpenIntent, TERMINAL_TOOL_NAME };

export function resolveFixedCommandToolNames(userMessage: string): readonly string[] | undefined {
  const rule = resolveExactCommand(userMessage);
  if (!rule) return undefined;
  return [rule.tool];
}
