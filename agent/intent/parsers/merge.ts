/* AI 生成 By Peng.Guo */
import type { ToolCall } from '../../ollama-client.js';

/** 解析合并类口令（确定性，不依赖 LLM） */
export function parseMergeIntent(userMessage: string): ToolCall | null {
  const text = (userMessage ?? '').trim();
  if (!/^合并(?:\s|$)/i.test(text)) return null;

  if (/合并\s*nova\s*集测/i.test(text)) {
    return { name: 'merge_repo', arguments: { repo: 'nova-pretest' } };
  }
  if (/合并\s*biz-solution\s*集测/i.test(text) || /合并\s*biz-solution集测/i.test(text)) {
    return { name: 'merge_repo', arguments: { repo: 'biz-solution-pretest' } };
  }
  const m = text.match(/^合并\s+([a-z0-9][a-z0-9-]*)\s*$/i);
  if (!m?.[1]) return null;
  const repo = m[1].toLowerCase();
  if (!['nova', 'biz-solution', 'scm'].includes(repo)) return null;
  return { name: 'merge_repo', arguments: { repo } };
}
