/* AI 生成 By Peng.Guo */
import { chatWithTools, chatWithToolsStream, parseToolCalls, type ChatMessage, type ToolCall } from './ollama-client.js';
import type { RouteExecuteContext, ToolProgressCallback } from './tool-progress.js';
import { routeAndExecute } from './tool-router.js';
import { toolsSchema } from './tools-schema.js';
import { getAllProjects } from '../config/projects.js';

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

/* AI 生成 By Peng.Guo - 精简 system prompt 降低 token 与推理耗时 */
const AGENT_SYSTEM_PROMPT = `你是开发流程助手，根据用户意图选择工具并填对参数。项目代号见 config/projects，常用：base、base18、nova、scm、react18、cc-web、cc-node、biz-solution、biz-guide、uikit、shared 等。

工作流：开始工作/执行 start-work → run_workflow(name=start-work)。打开终端/新建终端（不执行开始工作）→ open_terminal()；终端打开某项目目录（内嵌新页签）→ open_terminal(code=项目代号)，如终端打开 react18、终端打开 cc-web2。standalone → run_workflow(name=standalone)。启动 cpxy/react18/scm/cc-web/biz-solution/uikit/shared → run_workflow_step(workflow=start-work 或 standalone，taskKey=对应 key)；start-work 不含 base18，需启动 base18 时用 run_shell 进入项目目录执行。升级集测react18的nova版本 → run_workflow(name=upgrade-react18-nova)。升级集测cc-web的nova版本 → run_workflow(name=upgrade-cc-web-nova)。
部署：部署 xxx → deploy_jenkins(job=…)。可指定分支，如「部署nova 分支是sprint-260326」→ deploy_jenkins(job=nova, branch=sprint-260326)。合并 xxx → merge_repo(repo=nova|biz-solution|scm)。
IDE：ws打开base、cursor打开scm → open_in_ide(app=ws|webstorm|cursor|vscode|code，code=项目代号)。关闭 → close_ide_project(app=ws|cursor，code=项目代号)。
浏览器：打开 Jenkins/URL → open_browser(url=完整 URL)。打开集测环境 → open_jice_env()。打开测试环境 → open_test_env()。打开json配置中心 → open_json_config_center()。打开某项目 Jenkins 任务页 → open_jenkins_job(job=nova|cc-web|cc-node|react18|base|base18|biz-solution|biz-guide|scm)。周报：用户说「周报」→ open_weekly_report()（按低代码单据前端空间的“最近季度+最近日期区间”定位）；用户说「写周报」→ write_weekly_report(maxResults=可选)（先查本周已完成任务，再让大模型生成周报）。Jira：我的bug/查询我的bug → search_my_bugs(maxResults=可选)；线上bug/查询线上bug → search_online_bugs(maxResults=可选)；本周已完成任务/查询本周已完成任务 → search_weekly_done_tasks(maxResults=可选)。Cursor：cursor用量/查询cursor用量 → get_cursor_usage()（若无 token/cookie 会自动尝试同步本机 Chrome 登录态）；cursor今日用量/查询cursor今日用量 → get_cursor_today_usage()；同步cursor登录态 → sync_cursor_cookie()。Shell：执行命令 → run_shell(command=命令)。`;

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
  return call;
}

export type RunAgentOptions = {
  signal?: AbortSignal;
  /** 首轮 LLM 流式增量（思考 / 正文），供 SSE 实时推送 */
  onFirstLLMStream?: (chunk: { thinkingDelta?: string; contentDelta?: string }) => void;
  /** 工具开始 / 子步骤 / 结束，供 SSE 推送执行过程 */
  onToolProgress?: ToolProgressCallback;
};

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
}

export async function runAgent(userMessage: string, options?: RunAgentOptions): Promise<AgentResult> {
  const { signal } = options ?? {};
  const messages: ChatMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];
  const tools = toolsSchema.map((t) => ({
    type: t.type,
    function: t.function,
  }));

  const timing: AgentTiming = { tools: [] };

  try {
    throwIfAborted(signal);
    const t0 = Date.now();
    const streamCb = options?.onFirstLLMStream;
    const { message, tokenUsage: rawTokens } = streamCb
      ? await chatWithToolsStream(messages, tools, {
          signal,
          onDelta: streamCb,
        })
      : await chatWithTools(messages, tools, { signal });
    timing.firstLLMMs = Date.now() - t0;
    if (rawTokens?.prompt_eval_count != null || rawTokens?.eval_count != null) {
      timing.tokenUsage = {
        promptTokens: rawTokens.prompt_eval_count,
        completionTokens: rawTokens.eval_count,
      };
    }

    const explicitCode = extractExplicitProjectCode(userMessage);
    const calls = parseToolCalls(message).map((call) => normalizeToolCallWithExplicitCode(call, explicitCode, userMessage));

    if (calls.length === 0) {
      const text = (message.content ?? '').trim() || '未解析到可执行操作，请换一种说法试试。';
      return { success: true, text, timing };
    }

    const toolResults: unknown[] = [];
    const routeCtx: RouteExecuteContext = { onToolProgress: options?.onToolProgress };
    for (const call of calls) {
      throwIfAborted(signal);
      options?.onToolProgress?.({ phase: 'start', tool: call.name });
      const tTool = Date.now();
      try {
        const result = await routeAndExecute(call, routeCtx);
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
