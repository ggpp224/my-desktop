/* AI 生成 By Peng.Guo */
import type { ToolCall } from '../ollama-client.js';
import { toolsSchema } from '../tools-schema.js';
import type { ResolvedIntent } from './types.js';

const ALL_TOOL_NAMES = new Set(toolsSchema.map((t) => t.function.name));

export function validateToolCalls(
  calls: ToolCall[],
  intent: ResolvedIntent
): ToolCall[] {
  const valid = calls.filter((c) => ALL_TOOL_NAMES.has(c.name));
  if (intent.kind !== 'llm') return valid;
  if (intent.llmPolicy === 'full') return valid;
  const allowed = new Set(intent.allowedTools ?? []);
  return valid.filter((c) => allowed.has(c.name));
}
