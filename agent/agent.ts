/* AI 生成 By Peng.Guo */
import { chatWithTools, parseToolCalls, type ChatMessage, type ToolCall } from './ollama-client.js';
import { routeAndExecute } from './tool-router.js';
import { toolsSchema } from './tools-schema.js';

/** 各阶段耗时（毫秒），用于在 Logs 中展示 */
export type AgentTiming = {
  /** 首次模型推理（解析 tool_calls）耗时 ms */
  firstLLMMs?: number;
  /** 各工具执行耗时 ms */
  tools?: { name: string; ms: number }[];
  /** 二次模型推理（生成最终回复）耗时 ms */
  secondLLMMs?: number;
};

export type AgentResult = {
  success: boolean;
  text?: string;
  toolResults?: unknown[];
  error?: string;
  /** 各步骤耗时，便于在 Logs 中反馈 */
  timing?: AgentTiming;
};

/* AI 生成 By Peng.Guo - 精简 system prompt 降低 token 与推理耗时 */
const AGENT_SYSTEM_PROMPT = `你是开发流程助手，根据用户意图选择工具并填对参数。项目代号见 config/projects，常用：base、base18、nova、scm、react18、cc-web、biz-solution、biz-guide、uikit、shared 等。

工作流：开始工作/执行 start-work → run_workflow(name=start-work)。standalone → run_workflow(name=standalone)。启动 cpxy/react18/scm/cc-web/biz-solution/uikit/shared → run_workflow_step(workflow=start-work 或 standalone，taskKey=对应 key)。
部署：部署 xxx → deploy_jenkins(job=预定义 key 或完整 Job 名)。合并 xxx → merge_repo(repo=nova|biz-solution|scm)。
IDE：ws打开base、cursor打开scm → open_in_ide(app=ws|webstorm|cursor|vscode|code，code=项目代号)。关闭 → close_ide_project(app=ws|cursor，code=项目代号)。
浏览器：打开 Jenkins/URL → open_browser(url=完整 URL)。Shell：执行命令 → run_shell(command=命令)。`;

export async function runAgent(userMessage: string): Promise<AgentResult> {
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
    const t0 = Date.now();
    const { message } = await chatWithTools(messages, tools);
    timing.firstLLMMs = Date.now() - t0;

    const calls = parseToolCalls(message);

    if (calls.length === 0) {
      const text = (message.content ?? '').trim() || '未解析到可执行操作，请换一种说法试试。';
      return { success: true, text, timing };
    }

    const toolResults: unknown[] = [];
    for (const call of calls) {
      const tTool = Date.now();
      try {
        const result = await routeAndExecute(call);
        if (timing.tools) timing.tools.push({ name: call.name, ms: Date.now() - tTool });
        toolResults.push({ tool: call.name, result });
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
        messages.push(message);
        messages.push({ role: 'tool', tool_name: call.name, content: `错误: ${msg}` } as ChatMessage);
      }
    }

    /* 有 tool 执行时跳过第二次模型推理，直接返回固定回复以缩短耗时 */
    return { success: true, text: '已执行完成。', toolResults, timing };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
