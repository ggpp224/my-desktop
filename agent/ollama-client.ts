/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';

export type ToolCall = { name: string; arguments: Record<string, unknown> };
export type ChatMessage = { role: string; content?: string; tool_calls?: Array<{ function: { name: string; arguments: string | Record<string, unknown> } }> };

/** Ollama 推理参数：限制上下文与生成长度以加快速度 */
const OLLAMA_OPTIONS = {
  num_ctx: 4096,
  num_predict: 512,
};

/** Ollama 单次 chat 返回的 token 统计（可能因缓存等未返回） */
export type OllamaTokenUsage = {
  prompt_eval_count?: number;
  eval_count?: number;
};

export async function chatWithTools(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>
): Promise<{ message: ChatMessage; done: boolean; tokenUsage?: OllamaTokenUsage }> {
  const res = await fetch(`${config.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollama.model,
      messages,
      tools,
      stream: false,
      options: OLLAMA_OPTIONS,
    }),
  });
  if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`);
  const data = (await res.json()) as {
    message: ChatMessage;
    done?: boolean;
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const tokenUsage: OllamaTokenUsage | undefined =
    data.prompt_eval_count != null || data.eval_count != null
      ? { prompt_eval_count: data.prompt_eval_count, eval_count: data.eval_count }
      : undefined;
  return { message: data.message, done: data.done !== false, tokenUsage };
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
