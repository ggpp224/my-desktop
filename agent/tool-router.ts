/* AI 生成 By Peng.Guo */
import { run as shellRun } from '../tools/shell-tool.js';
import { open as browserOpen } from '../tools/browser-tool.js';
import { deploy as jenkinsDeploy } from '../tools/jenkins-tool.js';
import { runWorkflow } from '../tools/workflow-tool.js';
import type { ToolCall } from './ollama-client.js';

export async function routeAndExecute(call: ToolCall): Promise<unknown> {
  const { name, arguments: args } = call;
  switch (name) {
    case 'run_shell':
      return shellRun((args?.command as string) ?? '', { requireConfirmation: false });
    case 'open_browser':
      return browserOpen((args?.url as string) ?? '');
    case 'deploy_jenkins':
      return jenkinsDeploy((args?.jobName as string) ?? '');
    case 'run_workflow':
      return runWorkflow((args?.name as string) ?? '');
    default:
      throw new Error(`未知工具: ${name}`);
  }
}
