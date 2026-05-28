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
import { resolveAgentToolScope } from './tool-scope.js';
import { getAllProjects } from '../config/projects.js';
import { resolveWorkflowForTaskKey } from '../config/workflow-task-registry.js';
import { getOllamaActiveModel } from './ollama-runtime.js';

/** 各阶段耗时（毫秒）与 token 统计，用于在 Logs 中展示 */
export type AgentTiming = {
  /** 首次模型推理（解析 tool_calls）耗时 ms */
  firstLLMMs?: number;
  /** 各工具执行耗时 ms */
  tools?: { name: string; ms: number }[];
  /** 二次模型推理（生成最终回复）耗时 ms */
  secondLLMMs?: number;
  /** 本次指令消耗的 token：输入/输出（来自 Ollama prompt_eval_count / eval_count） */
  tokenUsage?: { promptTokens?: number; completionTokens?: number };
};

export type AgentResult = {
  success: boolean;
  text?: string;
  toolResults?: unknown[];
  error?: string;
  /** 被 AbortSignal 打断（切换模型或新请求覆盖） */
  aborted?: boolean;
  /** 各步骤耗时，便于在 Logs 中反馈 */
  timing?: AgentTiming;
};

const WORD_BOUNDARY = '[^a-z0-9-]';

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * // AI 生成 By Peng.Guo
 * 用户语句中若显式出现唯一项目代号，则以该代号作为强约束，避免模型将 cc-node 误映射到 cc-web。
 */
function extractExplicitProjectCode(userMessage: string): string | null {
  const text = (userMessage ?? '').toLowerCase();
  if (!text.trim()) return null;
  const candidates = new Set<string>();
  const codes = getAllProjects()
    .flatMap((p) => p.codes)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const code of codes) {
    const re = new RegExp(`(^|${WORD_BOUNDARY})${escapeRegExp(code)}(?=$|${WORD_BOUNDARY})`, 'i');
    if (re.test(text)) candidates.add(code);
  }
  if (candidates.size !== 1) return null;
  return [...candidates][0] ?? null;
}

function normalizeToolCallWithExplicitCode(call: ToolCall, explicitCode: string | null, userMessage: string): ToolCall {
  const args = (call.arguments ?? {}) as Record<string, unknown>;
  if (explicitCode && call.name === 'open_terminal') {
    const hasCode = String(args.code ?? '').trim();
    if (!hasCode && /终端\s*打开/.test((userMessage ?? '').toLowerCase())) {
      return { ...call, arguments: { ...args, code: explicitCode } };
    }
  }
  if (!explicitCode) return call;
  if (call.name === 'deploy_jenkins' || call.name === 'open_jenkins_job') {
    return { ...call, arguments: { ...args, job: explicitCode } };
  }
  if (call.name === 'open_in_ide' || call.name === 'close_ide_project') {
    return { ...call, arguments: { ...args, code: explicitCode } };
  }
  if (call.name === 'run_workflow_step' && explicitCode) {
    const taskKey = String(args.taskKey ?? explicitCode).trim() || explicitCode;
    const hint = String(args.workflow ?? '').trim() || 'start-work';
    const workflow = resolveWorkflowForTaskKey(taskKey, hint) ?? hint;
    return { ...call, arguments: { workflow, taskKey } };
  }
  return call;
}

// AI 生成 By Peng.Guo：兼容用户粘贴「You: ... / AI: ...」对话转录，提取真实用户问题
function normalizeIntentMessage(userMessage: string): string {
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

/** 解析「启动 react18」「启动 biz-solution」等单项目启动口令 */
function parseStartProjectIntent(userMessage: string): string | null {
  const text = (userMessage ?? '').trim();
  if (!/^启动/.test(text)) return null;
  const m = text.match(/^启动\s+([a-z0-9][a-z0-9-]*)\s*$/i);
  if (m?.[1]) return m[1].toLowerCase();
  return null;
}

/** 解析「部署 nova 集测」：须优先于「部署 nova」，避免误用 test 分支 */
function parseDeployNovaPretestIntent(userMessage: string): ToolCall | null {
  const text = (userMessage ?? '').trim();
  if (!/部署\s*nova(?:\s*集测|集测)/i.test(text)) return null;
  return { name: 'deploy_jenkins', arguments: { job: 'nova-pretest' } };
}

/** 解析「升级集测 react18/cc-web 的 nova 版本」：不依赖 LLM tool_calls，避免偶发未解析 */
function parseUpgradeNovaWorkflowIntent(userMessage: string): ToolCall | null {
  const text = (userMessage ?? '').trim();
  if (!text) return null;
  if (/执行工作流\s+upgrade-react18-nova\b/i.test(text)) {
    return { name: 'run_workflow', arguments: { name: 'upgrade-react18-nova' } };
  }
  if (/执行工作流\s+upgrade-cc-web-nova\b/i.test(text)) {
    return { name: 'run_workflow', arguments: { name: 'upgrade-cc-web-nova' } };
  }
  if (/升级\s*集测\s*cc-web2?\s*(?:的\s*)?nova\s*版本/i.test(text)) {
    return { name: 'run_workflow', arguments: { name: 'upgrade-cc-web-nova' } };
  }
  if (/升级\s*集测\s*react\s*18\s*(?:的\s*)?nova\s*版本/i.test(text)) {
    return { name: 'run_workflow', arguments: { name: 'upgrade-react18-nova' } };
  }
  return null;
}

// AI 生成 By Peng.Guo：关键口令「开始工作，使用外部终端」优先级最高，避免被误判为 run_workflow_step
function isStartWorkExternalTerminalIntent(userMessage: string): boolean {
  const text = (userMessage ?? '').trim().toLowerCase();
  if (!text) return false;
  return /开始工作/.test(text) && /外部终端/.test(text);
}

/**
 * // AI 生成 By Peng.Guo
 * 说明类问答优先命中知识库查询，避免被误分流到 run_workflow_step。
 */
function isKnowledgeQueryIntent(userMessage: string): boolean {
  const text = (userMessage ?? '').trim();
  if (!text) return false;
  const normalized = text.replace(/\s+/g, '');
  const kbKeyword = /(知识库|文档|AdvanceGrid|条件格式化|如何|怎么|怎样|配置|使用|接入|说明|示例)/i.test(normalized);
  if (!kbKeyword) return false;
  const startLike = /^启动\s+[a-z0-9][a-z0-9-]*\s*$/i.test(text);
  const deployLike = /^部署\s+/i.test(text) || /^合并\s+/i.test(text);
  const workflowLike = /^执行工作流\s+/i.test(text) || /^开始工作/.test(text);
  const terminalLike = /打开终端|终端打开/.test(text);
  return !startLike && !deployLike && !workflowLike && !terminalLike;
}

/** Agent 使用的 LLM：默认本地 Ollama；外部模式由前端传入密钥（经本机后端转发，不落盘） */
export type AgentLlmOptions =
  | { mode: 'local' }
  /** apiKey 可选：未传时使用进程环境变量 GEMINI_API_KEY / GOOGLE_API_KEY（与 A2UI 一致） */
  | { mode: 'external'; provider: 'gemini'; apiKey?: string; model: string; baseUrl?: string };

export type RunAgentOptions = {
  signal?: AbortSignal;
  /** 首轮 LLM 流式增量（思考 / 正文），供 SSE 实时推送 */
  onFirstLLMStream?: (chunk: { thinkingDelta?: string; contentDelta?: string }) => void;
  /** 首轮 LLM token 统计增量（来源于模型 SDK / API 的真实 usage） */
  onTokenUsage?: (usage: { promptTokens?: number; completionTokens?: number }) => void;
  /** 工具开始 / 子步骤 / 结束，供 SSE 推送执行过程 */
  onToolProgress?: ToolProgressCallback;
  /** 未传或 mode=local 时使用 Ollama */
  llm?: AgentLlmOptions;
};

// AI 生成 By Peng.Guo：工具执行心跳，避免长任务期间 UI 无反馈
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
  return {
    stop: () => clearInterval(timer),
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
}

export async function runAgent(userMessage: string, options?: RunAgentOptions): Promise<AgentResult> {
  const { signal } = options ?? {};
  const normalizedUserMessage = normalizeIntentMessage(userMessage);
  const messages: ChatMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: normalizedUserMessage },
  ];
  const { tools: scopedSchema, mode: toolScopeMode } = resolveAgentToolScope(normalizedUserMessage);
  const tools = scopedSchema.map((t) => ({
    type: t.type,
    function: t.function,
  }));

  const timing: AgentTiming = { tools: [] };
  const llm = options?.llm;
  const useGemini = llm?.mode === 'external' && llm.provider === 'gemini';

  try {
    throwIfAborted(signal);
    if (toolScopeMode !== 'full') {
      options?.onToolProgress?.({
        phase: 'progress',
        tool: 'agent',
        message: `[tool-scope] ${toolScopeMode}`,
      });
    }
    const t0 = Date.now();
    const streamCb = options?.onFirstLLMStream;
    let message: ChatMessage;
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
      message = gemMsg;
      timing.firstLLMMs = Date.now() - t0;
      if (gemUsage?.promptTokens != null || gemUsage?.completionTokens != null) {
        timing.tokenUsage = { promptTokens: gemUsage.promptTokens, completionTokens: gemUsage.completionTokens };
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
      message = oMsg;
      timing.firstLLMMs = Date.now() - t0;
      if (rawTokens?.prompt_eval_count != null || rawTokens?.eval_count != null) {
        timing.tokenUsage = {
          promptTokens: rawTokens.prompt_eval_count,
          completionTokens: rawTokens.eval_count,
        };
      }
    }

    const explicitCode = extractExplicitProjectCode(normalizedUserMessage);
    let calls = parseToolCalls(message).map((call) =>
      normalizeToolCallWithExplicitCode(call, explicitCode, normalizedUserMessage)
    );
    if (isKnowledgeQueryIntent(normalizedUserMessage)) {
      calls = [{ name: 'query_knowledge_base', arguments: { question: normalizedUserMessage } }];
    } else if (isStartWorkExternalTerminalIntent(normalizedUserMessage)) {
      calls = [{ name: 'run_workflow', arguments: { name: 'start-work-external-terminal' } }];
    } else {
      const deployPretest = parseDeployNovaPretestIntent(normalizedUserMessage);
      if (deployPretest) {
        calls = [deployPretest];
      } else {
        const upgradeNova = parseUpgradeNovaWorkflowIntent(normalizedUserMessage);
        if (upgradeNova) {
          calls = [upgradeNova];
        } else {
          const startTaskKey = parseStartProjectIntent(normalizedUserMessage);
          if (startTaskKey) {
            const workflow = resolveWorkflowForTaskKey(startTaskKey) ?? 'start-work';
            calls = [{ name: 'run_workflow_step', arguments: { workflow, taskKey: startTaskKey } }];
          }
        }
      }
    }

    if (calls.length === 0) {
      const text = (message.content ?? '').trim() || '未解析到可执行操作，请换一种说法试试。';
      return { success: true, text, timing };
    }

    const toolResults: unknown[] = [];
    const routeCtx: RouteExecuteContext = {
      onToolProgress: options?.onToolProgress,
      // AI 生成 By Peng.Guo：传递当前模型给工具路由（Gemini 用传入的，Ollama 从 runtime 获取）
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
        messages.push(message);
        messages.push({
          role: 'tool',
          tool_name: call.name,
          content: typeof result === 'object' ? JSON.stringify(result) : String(result),
        } as ChatMessage);
      } catch (err) {
        heartbeat.stop();
        if (timing.tools) timing.tools.push({ name: call.name, ms: Date.now() - tTool });
        const msg = err instanceof Error ? err.message : String(err);
        toolResults.push({ tool: call.name, error: msg });
        options?.onToolProgress?.({ phase: 'done', tool: call.name, ok: false, message: msg });
        messages.push(message);
        messages.push({ role: 'tool', tool_name: call.name, content: `错误: ${msg}` } as ChatMessage);
      }
    }

    /* 有 tool 执行时跳过第二次模型推理，直接返回固定回复以缩短耗时 */
    return { success: true, text: '已执行完成。', toolResults, timing };
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { success: false, error: '请求已取消', aborted: true };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
