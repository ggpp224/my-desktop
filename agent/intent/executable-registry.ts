/* AI 生成 By Peng.Guo */
import {
  buildSupportedCommandHints,
  type ProjectCapabilityInput,
} from '../../config/command-hints.js';
import {
  matchesActionPrefix,
  normalizeCommandText,
  resolveExactCommand,
} from '../../config/command-catalog.js';

export function isRegisteredExecutableCommand(
  userMessage: string,
  projects: ProjectCapabilityInput[]
): boolean {
  const text = (userMessage ?? '').trim();
  if (!text) return false;
  if (resolveExactCommand(text)) return true;
  if (matchesActionPrefix(text)) return true;

  const normalized = normalizeCommandText(text);
  const hints = buildSupportedCommandHints(projects);
  for (const hint of hints) {
    if (normalizeCommandText(hint) === normalized) return true;
  }
  return false;
}
