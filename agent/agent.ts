/* AI 生成 By Peng.Guo */
import {
  chatWithTools,
  chatWithToolsStream,
  parseToolCalls,
  type ChatMessage,
  type ToolCall,
} from './ollama-client.js';
import { chatWithToolsGeminiStream } from './gemini-client.js';
import type { RouteExecuteContext, ToolProgressCallback } from './tool-progress.js';
import { routeAndExecute } from './tool-router.js';
import { AGENT_SYSTEM_PROMPT } from './system-prompt.js';
import { resolveToolsFromIntent } from './tool-scope.js';
import { getAllProjects } from '../config/projects.js';
import { getOllamaActiveModel } from './ollama-runtime.js';
import {
  formatIntentLogLine,
  resolveIntent,
  resolvePatternFallbackIntent,
} from './intent/intent-resolver.js';
import { normalizeIntentMessage } from './intent/normalize.js';
import {
  extractExplicitProjectCode,
  normalizeToolCallWithExplicitCode,
} from './intent/tool-call-normalize.js';
import { validateToolCalls } from './intent/validate-tool-calls.js';
import type { ResolvedIntent } from './intent/types.js';

/** 各阶段耗时（毫秒）与 token 统计，用于在 Logs 中展示 */
export type AgentTiming = {
  firstLLMMs?: number;
  tools?: { name: string; ms: number }[];
  secondLLMMs?: number;
  tokenUsage?: { promptTokens?: number; completionTokens?: number };
};

export type AgentResult = {
  success: boolean;
  text?: string;
  toolResults?: unknown[];
  error?: string;
  aborted?: boolean;
  timing?: AgentTiming;
};

export type AgentLlmOptions =
  | { mode: 'local' }
  | { mode: 'external'; provider: 'gemini'; apiKey?: string; model: string; baseUrl?: string };

export type RunAgentOptions = {
  signal?: AbortSignal;
  onFirstLLMStream?: (chunk: { thinkingDelta?: string; contentDelta?: string }) => void;
  onTokenUsage?: (usage: { promptTokens?: number; completionTokens?: number }) => void;
  onToolProgress?: ToolProgressCallback;
  llm?: AgentLlmOptions;
};

type ToolHeartbeatControl = { stop: () => void };

function startToolHeartbeat(
  onToolProgress: ToolProgressCallback | undefined,
  tool: string,
  startedAtMs: number,
  intervalMs = 5000
): ToolHeartbeatControl {
  if (!onToolProgress) return { stop: () => {} };
  const timer = setInterval(() => {
    const elapsedSec = Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000));
    onToolProgress({
      phase: 'progress',
      tool,
      message: `仍在执行中（已等待 ${elapsedSec}s）`,
    });
  }, intervalMs);
  return { stop: () => clearInterval(timer) };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
}

function resolveToolCallsFromIntent(
  intent: ResolvedIntent,
  llmMessage: ChatMessage | undefined,
  normalizedUserMessage: string,
  projects: ReturnType<typeof getAllProjects>
): ToolCall[] {
  if (intent.kind === 'direct' || intent.kind === 'knowledge') {
    return [intent.toolCall];
  }

  const explicitCode = extractExplicitProjectCode(normalizedUserMessage);
  let calls =
    llmMessage != null
      ? parseToolCalls(llmMessage).map((call) =>
          normalizeToolCallWithExplicitCode(call, explicitCode, normalizedUserMessage)
        )
      : [];

  calls = validateToolCalls(calls, intent);
  if (calls.length > 0) return calls;

  const fallback = resolvePatternFallbackIntent(normalizedUserMessage, { projects });
  if (fallback?.kind === 'direct') return [fallback.toolCall];
  return [];
}

export async function runAgent(userMessage: string, options?: RunAgentOptions): Promise<AgentResult> {
  const { signal } = options ?? {};
  const normalizedUserMessage = normalizeIntentMessage(userMessage);
  const projects = getAllProjects();
  const intent = resolveIntent(normalizedUserMessage, { projects });

  options?.onToolProgress?.({
    phase: 'progress',
    tool: 'agent',
    message: formatIntentLogLine(intent),
  });

  const timing: AgentTiming = { tools: [] };
  const llm = options?.llm;
  const useGemini = llm?.mode === 'external' && llm.provider === 'gemini';

  try {
    throwIfAborted(signal);

    let llmMessage: ChatMessage | undefined;
    if (!intent.skipLlm) {
      const messages: ChatMessage[] = [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        { role: 'user', content: normalizedUserMessage },
      ];
      const { tools: scopedSchema, mode: toolScopeMode } = resolveToolsFromIntent(
        intent,
        normalizedUserMessage
      );
      if (toolScopeMode !== 'llm-full') {
        options?.onToolProgress?.({
          phase: 'progress',
          tool: 'agent',
          message: `[tool-scope] ${toolScopeMode}`,
        });
      }
      const tools = scopedSchema.map((t) => ({
        type: t.type,
        function: t.function,
      }));

      const t0 = Date.now();
      const streamCb = options?.onFirstLLMStream;
      if (useGemini) {
        const model = (llm.model ?? '').trim() || 'gemini-2.0-flash';
        const { message: gemMsg, tokenUsage: gemUsage } = await chatWithToolsGeminiStream(
          messages,
          tools,
          { apiKey: (llm.apiKey ?? '').trim(), model, baseUrl: llm.baseUrl },
          {
            signal,
            onDelta: streamCb ?? ((_d) => {}),
            onTokenUsage: options?.onTokenUsage,
          }
        );
        llmMessage = gemMsg;
        timing.firstLLMMs = Date.now() - t0;
        if (gemUsage?.promptTokens != null || gemUsage?.completionTokens != null) {
          timing.tokenUsage = {
            promptTokens: gemUsage.promptTokens,
            completionTokens: gemUsage.completionTokens,
          };
        }
      } else {
        const { message: oMsg, tokenUsage: rawTokens } = streamCb
          ? await chatWithToolsStream(messages, tools, {
              signal,
              onDelta: streamCb,
              onTokenUsage: (u) =>
                options?.onTokenUsage?.({
                  promptTokens: u.prompt_eval_count,
                  completionTokens: u.eval_count,
                }),
            })
          : await chatWithTools(messages, tools, { signal });
        llmMessage = oMsg;
        timing.firstLLMMs = Date.now() - t0;
        if (rawTokens?.prompt_eval_count != null || rawTokens?.eval_count != null) {
          timing.tokenUsage = {
            promptTokens: rawTokens.prompt_eval_count,
            completionTokens: rawTokens.eval_count,
          };
        }
      }
    } else {
      timing.firstLLMMs = 0;
    }

    const calls = resolveToolCallsFromIntent(
      intent,
      llmMessage,
      normalizedUserMessage,
      projects
    );

    if (calls.length === 0) {
      const text =
        (llmMessage?.content ?? '').trim() || '未解析到可执行操作，请换一种说法试试。';
      return { success: true, text, timing };
    }

    const toolResults: unknown[] = [];
    const routeCtx: RouteExecuteContext = {
      onToolProgress: options?.onToolProgress,
      currentModel: useGemini ? llm.model : getOllamaActiveModel(),
      currentLlm: useGemini
        ? {
            provider: 'gemini',
            apiKey: llm.apiKey,
            baseUrl: llm.baseUrl,
          }
        : undefined,
    };

    for (const call of calls) {
      throwIfAborted(signal);
      options?.onToolProgress?.({ phase: 'start', tool: call.name });
      const tTool = Date.now();
      const heartbeat = startToolHeartbeat(options?.onToolProgress, call.name, tTool);
      try {
        const result = await routeAndExecute(call, routeCtx);
        heartbeat.stop();
        if (timing.tools) timing.tools.push({ name: call.name, ms: Date.now() - tTool });
        toolResults.push({ tool: call.name, result });
        options?.onToolProgress?.({ phase: 'done', tool: call.name, ok: true });
      } catch (err) {
        heartbeat.stop();
        if (timing.tools) timing.tools.push({ name: call.name, ms: Date.now() - tTool });
        const msg = err instanceof Error ? err.message : String(err);
        toolResults.push({ tool: call.name, error: msg });
        options?.onToolProgress?.({ phase: 'done', tool: call.name, ok: false, message: msg });
      }
    }

    return { success: true, text: '已执行完成。', toolResults, timing };
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { success: false, error: '请求已取消', aborted: true };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
