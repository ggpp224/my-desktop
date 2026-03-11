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

const AGENT_SYSTEM_PROMPT = `你是开发流程助手。根据用户意图选择工具并填对参数。

【工作流】开始工作、执行工作流 start-work → run_workflow(name=start-work)。执行 standalone → run_workflow(name=standalone)。启动 cpxy、启动 react18、启动 scm、启动 cc-web、启动 biz-solution、启动 uikit、启动 shared → run_workflow_step(workflow=start-work 或 standalone，taskKey=对应 key)。

【部署】部署 nova、部署 cc-web、部署 base、部署 base18、部署 scm、部署 react18、部署 biz-solution、部署 biz-guide → deploy_jenkins(job=预定义代号：nova/cc-web/react18/biz-solution/biz-guide/scm/base/base18，或完整 Job 名)。

【合并】合并 nova、合并 biz-solution、合并 scm → merge_repo(repo=nova|biz-solution|scm)。

【打开/关闭 IDE】ws打开base、cursor打开scm、用 WebStorm 打开 nova → open_in_ide(app=ws|webstorm|cursor|vscode|code，code=项目代号)。关闭ws的nova、关闭cursor的base → close_ide_project(app=ws|cursor，code=项目代号)。项目代号与 config/projects 一致：base、base18、nova、scm、scm18、cc-web、cc-web2、react18、biz-solution、biz-guide、uikit、shared、ai-import、uikit-compat、cc-node、app-service、biz-framework、front-entity、front-pub、evoui、chanjet-grid、nova-form、nova-grid、nova-server、nova-ui、chanjet-nova、h5-biz-common、cc-web-hkj。

【浏览器】打开 Jenkins → open_browser(url=https://jenkins.rd.chanjet.com/)。打开任意 URL 同理。

【Shell】用户要求执行命令时 → run_shell(command=用户指定的命令)。`;

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
