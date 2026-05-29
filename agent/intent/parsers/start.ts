/* AI 生成 By Peng.Guo */
import { resolveWorkflowForTaskKey } from '../../../config/workflow-task-registry.js';
import type { ToolCall } from '../../ollama-client.js';

/** 解析「启动 react18」等单项目启动口令 */
export function parseStartProjectIntent(userMessage: string): ToolCall | null {
  const text = (userMessage ?? '').trim();
  if (!/^启动/.test(text)) return null;
  const m = text.match(/^启动\s+([a-z0-9][a-z0-9-]*)\s*$/i);
  if (!m?.[1]) return null;
  const taskKey = m[1].toLowerCase();
  const workflow = resolveWorkflowForTaskKey(taskKey) ?? 'start-work';
  return { name: 'run_workflow_step', arguments: { workflow, taskKey } };
}
