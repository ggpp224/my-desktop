/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';

export type ToolCall = { name: string; arguments: Record<string, unknown> };
export type ChatMessage = { role: string; content?: string; tool_calls?: Array<{ function: { name: string; arguments: string | Record<string, unknown> } }> };

export async function chatWithTools(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>
): Promise<{ message: ChatMessage; done: boolean }> {
  const res = await fetch(`${config.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollama.model,
      messages,
      tools,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`);
  const data = (await res.json()) as { message: ChatMessage; done?: boolean };
  return { message: data.message, done: data.done !== false };
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${config.ollama.baseUrl}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export function parseToolCalls(message: ChatMessage): ToolCall[] {
  const out: ToolCall[] = [];
  const raw = message.tool_calls;
  if (!Array.isArray(raw)) return out;
  for (const c of raw) {
    const fn = c.function ?? (c as { function?: { name: string; arguments?: string | Record<string, unknown> } }).function;
    if (!fn?.name) continue;
    let args = fn.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args) as Record<string, unknown>;
      } catch {
        args = {};
      }
    }
    out.push({ name: fn.name, arguments: (args as Record<string, unknown>) ?? {} });
  }
  return out;
}
