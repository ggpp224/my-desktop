/* AI 生成 By Peng.Guo */
/**
 * Google Gemini：`@google/genai` 内部仍用 Node 全局 `fetch`（undici），默认 **连接阶段约 10s** 即会 UND_ERR_CONNECT_TIMEOUT，
 * 与 SDK 的 `httpOptions.timeout`（整段请求）不同。此处仅在调用 Gemini 期间临时替换 `globalThis.fetch`：
 * - `HTTPS_PROXY` 等为 **http(s) 代理**时用 undici `ProxyAgent`；
 * - **`socks5://` 等**（常见于 macOS「系统代理」仅开 SOCKS、浏览器能上网而 Node 直连超时）用 `fetch-socks` 的 `socksDispatcher`（undici 原生 `ProxyAgent` 不支持 socks URL）；
 * - 未配置环境代理时，**macOS** 下尝试读取 `scutil --proxy` 中的 SOCKS（可用 `GEMINI_USE_MAC_SYSTEM_SOCKS=0` 关闭）。
 * API Key：GEMINI_API_KEY / GOOGLE_API_KEY（与 A2UI 一致）或请求体 apiKey。
 */
import { execFileSync } from 'node:child_process';
import dns from 'node:dns';
import { socksDispatcher } from 'fetch-socks';
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici';
import type { Dispatcher } from 'undici';
import { FunctionCallingConfigMode, GoogleGenAI, type FunctionDeclaration } from '@google/genai';
import { mergeStreamFragment } from './ollama-client.js';
import type { ChatMessage, ToolCall } from './ollama-client.js';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export type GeminiChatOptions = {
  signal?: AbortSignal;
  onDelta: (d: { thinkingDelta?: string; contentDelta?: string }) => void;
};

export type GeminiTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
};

export type GeminiClientConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
};

function parseGeminiConnectTimeoutMs(): number {
  const n = Number(process.env.GEMINI_CONNECT_TIMEOUT_MS);
  if (!Number.isFinite(n) || n < 15_000) return 120_000;
  return Math.min(Math.floor(n), 600_000);
}

let geminiDispatcher: Dispatcher | undefined;

/** 从 `socks5://host:port` 等 URL 解析 fetch-socks 所需参数 */
function socksEndpointFromUrl(raw: string): { type: 4 | 5; host: string; port: number } | null {
  const u = raw.trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    const protocol = parsed.protocol.replace(':', '').toLowerCase();
    const isSocks4 = protocol === 'socks4' || protocol === 'socks4a';
    const isSocks5 = protocol === 'socks5' || protocol === 'socks5h' || protocol === 'socks';
    if (!isSocks4 && !isSocks5) return null;
    const host = parsed.hostname;
    if (!host) return null;
    const port = parsed.port ? Number(parsed.port) : 1080;
    if (!Number.isFinite(port) || port <= 0) return null;
    return { type: isSocks4 ? 4 : 5, host, port };
  } catch {
    return null;
  }
}

/** macOS：系统设置里「仅 SOCKS 代理」时，Node 不会自动走代理；从 scutil 读取 SOCKS 主机与端口 */
function readMacSystemSocksEndpoint(): { type: 5; host: string; port: number } | null {
  if (process.platform !== 'darwin') return null;
  if (process.env.GEMINI_USE_MAC_SYSTEM_SOCKS === '0') return null;
  try {
    const out = execFileSync('scutil', ['--proxy'], { encoding: 'utf8', timeout: 3000 });
    if (!/(?:^|\n)\s*SOCKSEnable\s*:\s*1\s*(?:\n|$)/m.test(out)) return null;
    const portM = out.match(/(?:^|\n)\s*SOCKSPort\s*:\s*(\d+)/);
    const hostM = out.match(/(?:^|\n)\s*SOCKSProxy\s*:\s*(\S+)/);
    const host = hostM?.[1]?.trim();
    const port = portM ? Number(portM[1]) : 1080;
    if (!host || !Number.isFinite(port)) return null;
    return { type: 5, host, port };
  } catch {
    return null;
  }
}

function getGeminiDispatcher(): Dispatcher {
  if (geminiDispatcher) return geminiDispatcher;

  const candidates = [
    process.env.GEMINI_SOCKS_URL,
    process.env.ALL_PROXY,
    process.env.HTTPS_PROXY,
    process.env.HTTP_PROXY,
  ]
    .map((x) => (x ?? '').trim())
    .filter(Boolean);

  for (const raw of candidates) {
    const socksEp = socksEndpointFromUrl(raw);
    if (socksEp) {
      geminiDispatcher = socksDispatcher(socksEp) as unknown as Dispatcher;
      return geminiDispatcher;
    }
    if (/^https?:\/\//i.test(raw)) {
      geminiDispatcher = new ProxyAgent(raw);
      return geminiDispatcher;
    }
  }

  const macSocks = readMacSystemSocksEndpoint();
  if (macSocks) {
    geminiDispatcher = socksDispatcher(macSocks) as unknown as Dispatcher;
    return geminiDispatcher;
  }

  geminiDispatcher = new Agent({
    connectTimeout: parseGeminiConnectTimeoutMs(),
    headersTimeout: 300_000,
  });
  return geminiDispatcher;
}

/** 与全局 fetch 兼容（undici Response 与 DOM Response 类型略有差异，运行时一致） */
function createGeminiProcessFetch(): typeof globalThis.fetch {
  const dispatcher = getGeminiDispatcher();
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(input as never, { ...(init ?? {}), dispatcher } as never)) as unknown as typeof globalThis.fetch;
}

async function withPatchedGlobalFetch<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalThis.fetch;
  globalThis.fetch = createGeminiProcessFetch();
  try {
    return await fn();
  } finally {
    globalThis.fetch = prev;
  }
}

function resolveGeminiApiKey(cfg: GeminiClientConfig): string {
  const fromEnv = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
  const fromCfg = (cfg.apiKey ?? '').trim();
  return fromEnv || fromCfg;
}

function splitSystemAndUserText(messages: ChatMessage[]): { systemInstruction?: string; userText: string } {
  let system = '';
  let userText = '';
  for (const m of messages) {
    const role = (m.role ?? '').toLowerCase();
    if (role === 'system') system += `${m.content ?? ''}\n`;
    else if (role === 'user') userText = m.content ?? '';
  }
  const s = system.trim();
  return { ...(s ? { systemInstruction: s } : {}), userText };
}

function toFunctionDeclarations(
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>
): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parametersJsonSchema: t.function.parameters as Record<string, unknown>,
  }));
}

function formatNodeFetchError(context: string, err: unknown): string {
  if (!(err instanceof Error)) return `${context}: ${String(err)}`;
  const bits: string[] = [`${err.name}: ${err.message}`];
  const code = (err as NodeJS.ErrnoException).code;
  if (code) bits.push(`code=${code}`);
  const c = err.cause;
  if (c instanceof Error) {
    bits.push(`cause: ${c.name}: ${c.message}`);
    const cc = (c as NodeJS.ErrnoException).code;
    if (cc) bits.push(`causeCode=${cc}`);
  } else if (c && typeof c === 'object' && 'code' in c) {
    bits.push(`causeCode=${String((c as { code?: unknown }).code)}`);
  } else if (c != null && typeof c !== 'object') {
    bits.push(`cause: ${String(c)}`);
  }
  return `${context}: ${bits.join(' · ')}`;
}

function mergeFunctionCallsFromSdk(calls: Array<{ name?: string; args?: Record<string, unknown> }> | undefined, into: ToolCall[], seen: Set<string>): void {
  if (!Array.isArray(calls)) return;
  for (const fc of calls) {
    const name = fc.name;
    if (!name) continue;
    const args = (fc.args as Record<string, unknown>) ?? {};
    const key = `${name}:${JSON.stringify(args)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    into.push({ name, arguments: args });
  }
}

const GEMINI_HTTP_TIMEOUT_MS = 180_000;

export type GeminiTestResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * 设置页「连接测试」：发起一次极短 generateContent，与对话共用同一套 fetch/代理/超时逻辑。
 * apiKey 优先使用 cfg（表单），否则与对话一致读环境变量。
 */
export async function testGeminiConnection(cfg: GeminiClientConfig): Promise<GeminiTestResult> {
  const apiKey = (cfg.apiKey ?? '').trim() || (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
  if (!apiKey) {
    return { ok: false, error: '缺少 API Key：请在输入框填写，或在启动 API 的进程中设置 GEMINI_API_KEY' };
  }
  const model = (cfg.model ?? '').trim() || 'gemini-2.0-flash';
  const base = (cfg.baseUrl ?? '').trim().replace(/\/$/, '');

  return withPatchedGlobalFetch(async () => {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: GEMINI_HTTP_TIMEOUT_MS,
          ...(base ? { baseUrl: base } : {}),
        },
      });
      const res = await ai.models.generateContent({
        model,
        contents: 'Reply with exactly one word: OK',
      });
      const text = typeof res.text === 'string' ? res.text.trim() : '';
      const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
      return { ok: true, message: preview ? `模型返回：${preview}` : '连接成功，已收到响应' };
    } catch (err) {
      return { ok: false, error: formatNodeFetchError('请求失败', err) };
    }
  });
}

/**
 * Gemini 流式 + tools：@google/genai + 临时替换 fetch（长 connect、可走代理）。
 */
export async function chatWithToolsGeminiStream(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>,
  cfg: GeminiClientConfig,
  options: GeminiChatOptions
): Promise<{ message: ChatMessage; done: boolean; tokenUsage?: GeminiTokenUsage }> {
  const apiKey = resolveGeminiApiKey(cfg);
  if (!apiKey) {
    throw new Error(
      '缺少 Gemini API Key：请在运行 API 的 shell 中执行 `export GEMINI_API_KEY=...`（与 A2UI 一致），或在界面「设置」中填写并保存。'
    );
  }

  const model = (cfg.model ?? '').trim() || 'gemini-2.0-flash';
  const base = (cfg.baseUrl ?? '').trim().replace(/\/$/, '');

  return withPatchedGlobalFetch(async () => {
    let ai: GoogleGenAI;
    try {
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: GEMINI_HTTP_TIMEOUT_MS,
          ...(base ? { baseUrl: base } : {}),
        },
      });
    } catch (err) {
      throw new Error(formatNodeFetchError('初始化 GoogleGenAI 失败', err));
    }

    const { systemInstruction, userText } = splitSystemAndUserText(messages);
    const functionDeclarations = toFunctionDeclarations(tools);

    let stream: AsyncGenerator<unknown, void, unknown>;
    try {
      stream = await ai.models.generateContentStream({
        model,
        contents: userText,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(options.signal ? { abortSignal: options.signal } : {}),
          tools: [{ functionDeclarations }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.AUTO,
            },
          },
        },
      });
    } catch (err) {
      const proxyHint = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim()
        ? ''
        : ' 若在国内网络，请在启动 API 的同一终端设置 HTTPS_PROXY（如 export HTTPS_PROXY=http://127.0.0.1:7890）后重试。';
      throw new Error(
        `${formatNodeFetchError('Gemini generateContentStream 失败（默认全局 fetch 连接阶段仅约 10s；本服务已换用更长 connect 超时，仍失败多为网络不可达 Google）', err)}${proxyHint}`
      );
    }

    const toolCalls: ToolCall[] = [];
    const seenKeys = new Set<string>();
    const accumText = { prev: '', full: '' };
    const accumThought = { prev: '', full: '' };
    let tokenUsage: GeminiTokenUsage | undefined;

    try {
      for await (const chunk of stream) {
        const c = chunk as {
          text?: string;
          functionCalls?: Array<{ name?: string; args?: Record<string, unknown> }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        if (typeof c.text === 'string' && c.text.length > 0) {
          const { next, delta } = mergeStreamFragment(accumText.prev, c.text);
          accumText.prev = next;
          accumText.full = next;
          if (delta) options.onDelta({ contentDelta: delta });
        }
        mergeFunctionCallsFromSdk(c.functionCalls, toolCalls, seenKeys);
        if (c.usageMetadata) {
          const p = c.usageMetadata.promptTokenCount;
          const q = c.usageMetadata.candidatesTokenCount;
          if (p != null || q != null) tokenUsage = { promptTokens: p, completionTokens: q };
        }
      }
    } catch (err) {
      throw new Error(formatNodeFetchError('Gemini 流式读取失败', err));
    }

    const message: ChatMessage = {
      role: 'assistant',
      content: accumText.full,
      thinking: accumThought.full || undefined,
      tool_calls:
        toolCalls.length > 0
          ? toolCalls.map((tc) => ({
              function: { name: tc.name, arguments: tc.arguments },
            }))
          : undefined,
    };
    return { message, done: true, tokenUsage };
  });
}
