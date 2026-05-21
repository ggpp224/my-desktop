/* AI 生成 By Peng.Guo */
import { execSync } from 'child_process';
import { getJenkinsPreset } from '../config/jenkins-presets.js';
import { getProjectByCode } from '../config/projects.js';
import { deploy, type DeployResult } from './jenkins-tool.js';
import { resolveMaxSprintBranch } from './sprint-branch.js';

function runGit(cmd: string, cwd: string): { stdout: string; stderr: string; code: number } {
  try {
    const r = execSync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 });
    return { stdout: (r as string).trim(), stderr: '', code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout as string)?.trim() ?? '',
      stderr: (e.stderr as string)?.trim() ?? '',
      code: e.status ?? 1,
    };
  }
}

export type JenkinsDeployResolved = {
  jobName: string;
  parameters: Record<string, string>;
  jobKey: string;
  branch: string;
};

/**
 * 解析 Jenkins 部署参数；branchOverride 非空时覆盖预设分支。
 */
export function resolveJenkinsDeployParams(
  jobKey: string,
  branchOverride?: string
): { ok: true; resolved: JenkinsDeployResolved } | { ok: false; error: string } {
  const key = (jobKey ?? '').trim();
  if (!key) return { ok: false, error: '缺少 job' };

  const branch = (branchOverride ?? '').trim();
  let preset = getJenkinsPreset(key);
  if (!preset) {
    const entry = getProjectByCode(key);
    if (entry?.jenkins) {
      const branchParam = (entry.jenkins.branchParam || 'BRANCH_NAME').trim() || 'BRANCH_NAME';
      preset = {
        name: entry.jenkins.jobName,
        branchParam,
        parameters: { [branchParam]: branch || entry.jenkins.defaultBranch },
      };
    }
  }
  if (!preset) {
    return { ok: false, error: `未找到 Jenkins 预设: ${key}` };
  }

  const branchParam = preset.branchParam || 'BRANCH_NAME';
  const parameters: Record<string, string> = { ...(preset.parameters ?? {}) };
  const resolvedBranch = branch || parameters[branchParam] || '';
  if (!resolvedBranch) {
    return { ok: false, error: `未解析到分支参数 ${branchParam}` };
  }
  parameters[branchParam] = resolvedBranch;

  return {
    ok: true,
    resolved: {
      jobName: preset.name,
      parameters,
      jobKey: key,
      branch: resolvedBranch,
    },
  };
}

export async function deployByJobKey(
  jobKey: string,
  branchOverride?: string
): Promise<DeployResult & { jobKey?: string; branch?: string }> {
  const params = resolveJenkinsDeployParams(jobKey, branchOverride);
  if (!params.ok) return { success: false, message: params.error };
  const { jobName, parameters, jobKey: key, branch } = params.resolved;
  const result = await deploy(jobName, parameters);
  return { ...result, jobKey: key, branch };
}

export type DeployNovaPretestOptions = {
  onStep?: (msg: string) => void;
};

/**
 * 部署 nova 集测：Jenkins 任务与「部署 nova」相同，分支为 react18 远程最大 sprint-N。
 */
export async function deployNovaPretest(
  options?: DeployNovaPretestOptions
): Promise<DeployResult & { jobKey?: string; branch?: string }> {
  const add = options?.onStep ?? (() => {});
  const react18Entry = getProjectByCode('react18');
  if (!react18Entry?.path) {
    return { success: false, message: '未找到 react18 项目路径' };
  }

  const sprint = resolveMaxSprintBranch(react18Entry.path, {
    onStep: add,
    runGit,
  });
  if (!sprint.ok) {
    return { success: false, message: sprint.error };
  }

  const { branch } = sprint.result;
  add(`集测部署分支: ${branch}（nova Jenkins 任务）`);
  const result = await deployByJobKey('nova', branch);
  return { ...result, jobKey: 'nova-pretest', branch };
}
