/* AI 生成 By Peng.Guo */
export { normalizeCommandText } from '../../config/command-catalog.js';

/** 兼容用户粘贴「You: ... / AI: ...」对话转录，提取真实用户问题 */
export function normalizeIntentMessage(userMessage: string): string {
  const raw = (userMessage ?? '').trim();
  if (!raw) return '';
  const youLine = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^you\s*:/i.test(l));
  if (!youLine) return raw;
  const extracted = youLine.replace(/^you\s*:\s*/i, '').trim();
  return extracted || raw;
}
