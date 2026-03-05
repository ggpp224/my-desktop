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

export async function runAgent(userMessage: string): Promise<AgentResult> {
  const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];
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
