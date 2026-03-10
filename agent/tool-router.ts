/* AI 生成 By Peng.Guo */
import { getJenkinsPreset } from '../config/jenkins-presets.js';
import { run as shellRun } from '../tools/shell-tool.js';
import { open as browserOpen } from '../tools/browser-tool.js';
import { deploy as jenkinsDeploy } from '../tools/jenkins-tool.js';
import { runWorkflow, runWorkflowStep } from '../tools/workflow-tool.js';
import { mergeNova, mergeBizSolution, mergeScm } from '../tools/merge-tool.js';
import type { ToolCall } from './ollama-client.js';

export async function routeAndExecute(call: ToolCall): Promise<unknown> {
  const { name, arguments: args } = call;
  switch (name) {
    case 'run_shell':
      return shellRun((args?.command as string) ?? '', { requireConfirmation: false });
    case 'open_browser':
      return browserOpen((args?.url as string) ?? '');
    case 'deploy_jenkins': {
      const job = (args?.job as string) ?? '';
      const preset = getJenkinsPreset(job);
      if (preset) return jenkinsDeploy(preset.name, preset.parameters);
      return jenkinsDeploy(job);
    }
    case 'run_workflow':
      return runWorkflow((args?.name as string) ?? '');
    case 'run_workflow_step': {
      const workflow = (args?.workflow as string) ?? 'start-work';
      const taskKey = (args?.taskKey as string) ?? '';
      return runWorkflowStep(workflow, { taskKey });
    }
    case 'merge_repo': {
      const repo = (args?.repo as string) ?? '';
      if (repo === 'nova') return mergeNova();
      if (repo === 'biz-solution') return mergeBizSolution();
      if (repo === 'scm') return mergeScm();
      throw new Error(`不支持的 merge_repo: ${repo}，应为 nova、biz-solution 或 scm`);
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}
