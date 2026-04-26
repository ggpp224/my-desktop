/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';
import { getOllamaActiveModel } from './ollama-runtime.js';

export type ToolCall = { name: string; arguments: Record<string, unknown> };
export type ChatMessage = {
  role: string;
  content?: string;
  /** 部分推理模型在流式响应中返回的思考文本 */
  thinking?: string;
  tool_calls?: Array<{ function: { name: string; arguments: string | Record<string, unknown> } }>;
};

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

export type ChatWithToolsOptions = {
  /** 取消进行中的推理（切换模型或用户中止时） */
  signal?: AbortSignal;
};

/** Ollama 返回 400 且模型不支持 thinking 时用于去掉 think 重试 */
export function isOllamaThinkingUnsupportedMessage(bodyText: string): boolean {
  return /does not support thinking/i.test(bodyText);
}

function buildOllamaToolChatBody(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>,
  stream: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: getOllamaActiveModel(),
    messages,
    tools,
    stream,
    options: OLLAMA_OPTIONS,
  };
  const think = config.ollama.think;
  if (think !== undefined) {
    body.think = think;
  }
  return body;
}

/**
 * POST /api/chat：若因 think 不被模型支持而 400，自动去掉 think 再请求一次（流式/非流式共用）。
 */
export async function fetchOllamaApiChatWithThinkFallback(
  body: Record<string, unknown>,
  init: Omit<RequestInit, 'body'>
): Promise<Response> {
  const url = `${config.ollama.baseUrl}/api/chat`;
  let res = await fetch(url, { ...init, body: JSON.stringify(body) });
  if (res.ok) return res;
  const errText = await res.text().catch(() => '');
  if (res.status === 400 && isOllamaThinkingUnsupportedMessage(errText) && body.think !== undefined) {
    const next = { ...body };
    delete next.think;
    res = await fetch(url, { ...init, body: JSON.stringify(next) });
    return res;
  }
  return new Response(errText, { status: res.status, statusText: res.statusText });
}

export async function chatWithTools(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>,
  options?: ChatWithToolsOptions
): Promise<{ message: ChatMessage; done: boolean; tokenUsage?: OllamaTokenUsage }> {
  const baseInit = { method: 'POST' as const, headers: { 'Content-Type': 'application/json' }, signal: options?.signal };
  let res = await fetchOllamaApiChatWithThinkFallback(buildOllamaToolChatBody(messages, tools, false), baseInit);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Ollama chat failed: ${res.status} ${t}`.trim());
  }
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

/** Ollama 流式行：content/thinking 可能为增量或累计片段，用于合并去重（周报等非 tools 流式复用） */
export function mergeStreamFragment(previous: string, fragment: string): { next: string; delta: string } {
  if (!fragment) return { next: previous, delta: '' };
  if (previous && fragment.startsWith(previous)) {
    return { next: fragment, delta: fragment.slice(previous.length) };
  }
  return { next: previous + fragment, delta: fragment };
}

type OllamaChatStreamLine = {
  message?: ChatMessage | null;
  thinking?: string;
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
};

/**
 * 流式 chat + tools：边读 Ollama NDJSON 边回调增量（思考/正文），结束时返回与 chatWithTools 相同结构的 message。
 */
export async function chatWithToolsStream(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>,
  options: ChatWithToolsOptions & {
    onDelta: (d: { thinkingDelta?: string; contentDelta?: string }) => void;
    onTokenUsage?: (u: OllamaTokenUsage) => void;
  }
): Promise<{ message: ChatMessage; done: boolean; tokenUsage?: OllamaTokenUsage }> {
  const baseInit = { method: 'POST' as const, headers: { 'Content-Type': 'application/json' }, signal: options.signal };
  let res = await fetchOllamaApiChatWithThinkFallback(buildOllamaToolChatBody(messages, tools, true), baseInit);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Ollama chat failed: ${res.status} ${t}`.trim());
  }
  if (!res.body) throw new Error('Ollama chat: empty response body');

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let accumContent = '';
  let accumThinking = '';
  /** Ollama 常在 done:false 的中间帧给出完整 tool_calls，末帧 message 可能无 tool_calls，必须跨帧保留 */
  let bestToolCalls: ChatMessage['tool_calls'] | undefined;
  let lastDoneMessage: ChatMessage | undefined;
  let tokenUsage: OllamaTokenUsage | undefined;

  const captureToolCalls = (msg: ChatMessage | null | undefined) => {
    if (!msg?.tool_calls || !Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0) return;
    bestToolCalls = msg.tool_calls;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let data: OllamaChatStreamLine;
      try {
        data = JSON.parse(line) as OllamaChatStreamLine;
      } catch {
        continue;
      }
      const msg = data.message;
      captureToolCalls(msg ?? undefined);
      if (msg && typeof msg.content === 'string' && msg.content.length > 0) {
        const { next, delta } = mergeStreamFragment(accumContent, msg.content);
        if (delta) options.onDelta({ contentDelta: delta });
        accumContent = next;
      }
      const lineThinking =
        typeof data.thinking === 'string' && data.thinking.length > 0
          ? data.thinking
          : typeof msg?.thinking === 'string' && msg.thinking.length > 0
            ? msg.thinking
            : '';
      if (lineThinking) {
        const { next, delta } = mergeStreamFragment(accumThinking, lineThinking);
        if (delta) options.onDelta({ thinkingDelta: delta });
        accumThinking = next;
      }
      if (data.done === true) {
        if (data.prompt_eval_count != null || data.eval_count != null) {
          tokenUsage = { prompt_eval_count: data.prompt_eval_count, eval_count: data.eval_count };
          options.onTokenUsage?.(tokenUsage);
        }
        if (msg) lastDoneMessage = msg;
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      const data = JSON.parse(tail) as OllamaChatStreamLine;
      captureToolCalls(data.message ?? undefined);
      if (data.message) lastDoneMessage = data.message;
      if (data.done && (data.prompt_eval_count != null || data.eval_count != null)) {
        tokenUsage = { prompt_eval_count: data.prompt_eval_count, eval_count: data.eval_count };
        options.onTokenUsage?.(tokenUsage);
      }
    } catch {
      /* ignore trailing garbage */
    }
  }

  const finalContent =
    lastDoneMessage?.content && String(lastDoneMessage.content).length > accumContent.length
      ? String(lastDoneMessage.content)
      : accumContent;
  const message: ChatMessage = {
    role: 'assistant',
    content: finalContent,
    tool_calls: bestToolCalls ?? lastDoneMessage?.tool_calls,
  };
  return { message, done: true, tokenUsage };
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${config.ollama.baseUrl}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

function normalizeToolCallCandidate(input: unknown): ToolCall | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) return null;
  let args = row.arguments;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args) as Record<string, unknown>;
    } catch {
      args = {};
    }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
  return { name, arguments: args as Record<string, unknown> };
}

function parseToolCallsFromContent(content: string | undefined): ToolCall[] {
  const text = (content ?? '').trim();
  if (!text) return [];
  const candidates: string[] = [text];
  const codeBlockMatches = text.match(/```(?:json)?\s*([\s\S]*?)```/gi) ?? [];
  for (const block of codeBlockMatches) {
    const inner = block.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    if (inner) candidates.push(inner);
  }
  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const calls = parsed.map((item) => normalizeToolCallCandidate(item)).filter((item): item is ToolCall => !!item);
        if (calls.length > 0) return calls;
      } else {
        const single = normalizeToolCallCandidate(parsed);
        if (single) return [single];
      }
    } catch {
      // ignore invalid JSON
    }
  }
  return [];
}

export function parseToolCalls(message: ChatMessage): ToolCall[] {
  const out: ToolCall[] = [];
  const raw = message.tool_calls;
  if (Array.isArray(raw)) {
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
  }
  // AI 生成 By Peng.Guo：兼容部分模型把函数调用以 JSON 文本写在 content 中
  if (out.length === 0) {
    return parseToolCallsFromContent(message.content);
  }
  return out;
}
