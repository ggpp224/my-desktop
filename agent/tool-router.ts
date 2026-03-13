/* AI 生成 By Peng.Guo */
/** 集测环境（好业财）固定 URL */
const JICE_ENV_URL =
  'https://inte-cloud.chanjet.com/cc/uhwr78vnst8x/3axr8fvxct/index.html?autoLogin=true&accountNumber=15911200000#/home?pageId=home&pageParams=%7B%22activeFromTab%22%3Atrue%2C%22traceRoute%22%3Afalse%7D&tabId=home&_k=58boge';
/** 测试环境（好业财）固定 URL */
const TEST_ENV_URL =
  'https://test-cloud.chanjet.com/cc/ue255vjnqnwa/urp6o0wpbf/index.html?autoLogin=true&accountNumber=15911200000#/home?pageId=home&pageParams=%7B%22activeFromTab%22%3Atrue%2C%22jumpPageOptions%22%3A%7B%7D%2C%22traceRoute%22%3Afalse%7D&tabId=home&_k=2zf335';

import { config } from '../config/default.js';
import { getJenkinsPreset } from '../config/jenkins-presets.js';
import { getProjectByCode } from '../config/projects.js';
import { run as shellRun } from '../tools/shell-tool.js';
import { open as browserOpen } from '../tools/browser-tool.js';
import { deploy as jenkinsDeploy } from '../tools/jenkins-tool.js';
import { runWorkflow, runWorkflowStep } from '../tools/workflow-tool.js';
import { mergeNova, mergeBizSolution, mergeScm } from '../tools/merge-tool.js';
import { openInIde } from '../tools/open-ide-tool.js';
import { closeIdeProject } from '../tools/close-ide-tool.js';
import type { ToolCall } from './ollama-client.js';

export async function routeAndExecute(call: ToolCall): Promise<unknown> {
  const { name, arguments: args } = call;
  switch (name) {
    case 'run_shell':
      return shellRun((args?.command as string) ?? '', { requireConfirmation: false });
    case 'open_browser':
      return browserOpen((args?.url as string) ?? '');
    case 'open_jice_env':
      return browserOpen(JICE_ENV_URL);
    case 'open_test_env':
      return browserOpen(TEST_ENV_URL);
    case 'open_jenkins_job': {
      const jobKey = (args?.job as string) ?? '';
      const base = config.jenkins.baseUrl?.replace(/\/$/, '') ?? '';
      const preset = getJenkinsPreset(jobKey);
      const jobName = preset?.name;
      const url = jobName && base ? `${base}/job/${encodeURIComponent(jobName)}/` : base;
      return browserOpen(url || 'about:blank');
    }
    case 'deploy_jenkins': {
      const job = (args?.job as string) ?? '';
      const branch = (args?.branch as string)?.trim();
      let preset = getJenkinsPreset(job);
      if (!preset) {
        const entry = getProjectByCode(job);
        if (entry?.jenkins) {
          preset = {
            name: entry.jenkins.jobName,
            parameters: { BRANCH_NAME: branch || entry.jenkins.defaultBranch },
          };
        }
      }
      if (preset) {
        const parameters = { ...preset.parameters };
        if (branch) parameters.BRANCH_NAME = branch;
        const result = await jenkinsDeploy(preset.name, parameters);
        return { ...result, jobKey: job };
      }
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
    case 'open_in_ide': {
      const app = (args?.app as string) ?? '';
      const code = (args?.code as string) ?? '';
      return openInIde(app, code);
    }
    case 'close_ide_project': {
      const app = (args?.app as string) ?? '';
      const code = (args?.code as string) ?? '';
      return closeIdeProject(app, code);
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}
