/* AI 生成 By Peng.Guo */
import { chatWithTools, parseToolCalls, type ChatMessage, type ToolCall } from './ollama-client.js';
import { routeAndExecute } from './tool-router.js';
import { toolsSchema } from './tools-schema.js';

export type AgentResult = {
  success: boolean;
  text?: string;
  toolResults?: unknown[];
  error?: string;
};

const AGENT_SYSTEM_PROMPT = `你是开发流程助手。用户可能用口语表达意图，请根据意图选择对应工具并填对参数。
例如：我要部署 nova、帮我部署一下 cc-web → deploy_jenkins(job 填 nova/cc-web/react18/biz-solution/biz-guide/scm/base/base18)；
合并 nova、合并一下 biz-solution → merge_repo(repo 填 nova/biz-solution/scm)；
启动 react18、启动 cpxy、启动 scm → run_workflow_step(workflow 填 start-work 或 standalone，taskKey 填对应 key)；
开始工作 → run_workflow(name=start-work)；
打开 Jenkins → open_browser(url 填 https://jenkins.rd.chanjet.com/)；
ws打开base、cursor打开base、用 WebStorm 打开 scm → open_in_ide(app 填 ws 或 cursor，code 填项目代号如 base/scm/nova/cc-web/react18 等)；
关闭ws的nova、关闭cursor的base、关闭 WebStorm 的 scm → close_ide_project(app 填 ws 或 cursor，code 填项目代号)。`;

export async function runAgent(userMessage: string): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];
  const tools = toolsSchema.map((t) => ({
    type: t.type,
    function: t.function,
  }));

  try {
    const { message } = await chatWithTools(messages, tools);
    const calls = parseToolCalls(message);

    if (calls.length === 0) {
      const text = (message.content ?? '').trim() || '未解析到可执行操作，请换一种说法试试。';
      return { success: true, text };
    }

    const toolResults: unknown[] = [];
    for (const call of calls) {
      try {
        const result = await routeAndExecute(call);
        toolResults.push({ tool: call.name, result });
        messages.push(message);
        messages.push({
          role: 'tool',
          tool_name: call.name,
          content: typeof result === 'object' ? JSON.stringify(result) : String(result),
        } as ChatMessage);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toolResults.push({ tool: call.name, error: msg });
        messages.push(message);
        messages.push({ role: 'tool', tool_name: call.name, content: `错误: ${msg}` } as ChatMessage);
      }
    }

    const finalRes = await chatWithTools(messages, tools);
    const finalText = (finalRes.message.content ?? '').trim() || '已执行完成。';
    return { success: true, text: finalText, toolResults };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
