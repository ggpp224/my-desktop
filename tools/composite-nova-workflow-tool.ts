/* AI 生成 By Peng.Guo */
import { deployByJobKey } from './deploy-jenkins-helper.js';
import { getDeployStatus } from './jenkins-tool.js';
import { mergeByCode } from './merge-tool.js';

type StepStatus = 'success' | 'failure';

export type CompositeWorkflowStepResult = {
  name: string;
  status: StepStatus;
  message: string;
  detail?: unknown;
};

export type CompositeWorkflowResult = {
  success: boolean;
  message: string;
  steps: CompositeWorkflowStepResult[];
};

export type CompositeWorkflowOptions = {
  onStep?: (message: string) => void;
};

const TERMINAL_DEPLOY_STATUS = new Set(['success', 'failure', 'aborted']);
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_COUNT = 240;

function appendStep(
  steps: CompositeWorkflowStepResult[],
  name: string,
  status: StepStatus,
  message: string,
  detail?: unknown
): CompositeWorkflowStepResult {
  const step = { name, status, message, detail };
  steps.push(step);
  return step;
}

function isFailure(step: CompositeWorkflowStepResult): boolean {
  return step.status === 'failure';
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitDeployDone(
  deployResult: { queueUrl?: string; message?: string },
  serviceName: string,
  onStep: (message: string) => void
): Promise<CompositeWorkflowStepResult> {
  if (!deployResult.queueUrl) {
    return {
      name: `deploy_${serviceName}`,
      status: 'failure',
      message: `${serviceName} 缺少 queueUrl，无法等待部署完成`,
      detail: deployResult,
    };
  }

  for (let i = 1; i <= MAX_POLL_COUNT; i += 1) {
    const status = await getDeployStatus(deployResult.queueUrl);
    const suffix = status.message ? `，${status.message}` : '';
    onStep(`[部署${serviceName}] 进度(${i}/${MAX_POLL_COUNT})：${status.status}${suffix}`);
    if (TERMINAL_DEPLOY_STATUS.has(status.status)) {
      return {
        name: `deploy_${serviceName}`,
        status: status.status === 'success' ? 'success' : 'failure',
        message: status.message || `${serviceName} 部署完成，状态：${status.status}`,
        detail: { deployResult, status },
      };
    }
    await delay(POLL_INTERVAL_MS);
  }

  return {
    name: `deploy_${serviceName}`,
    status: 'failure',
    message: `${serviceName} 部署等待超时`,
    detail: deployResult,
  };
}

export async function runCompositeNovaMergeAndDeploy(
  options?: CompositeWorkflowOptions
): Promise<CompositeWorkflowResult> {
  const onStep = options?.onStep ?? (() => {});
  const steps: CompositeWorkflowStepResult[] = [];

  onStep('开始执行复合流程：合并nova并部署相关服务');
  onStep('步骤1/3：正在合并 nova...');
  const mergeResult = await mergeByCode('nova', {
    onStep: (msg) => onStep(`[合并nova] ${msg}`),
  });
  if (!mergeResult.success) {
    appendStep(steps, 'merge_nova', 'failure', mergeResult.error ?? '合并 nova 失败', mergeResult);
    onStep('步骤1/3失败，流程终止。');
    return { success: false, message: '合并 nova 失败，已终止后续部署。', steps };
  }
  appendStep(steps, 'merge_nova', 'success', '合并 nova 完成', mergeResult);
  onStep('步骤1/3完成：合并 nova 完成。');

  onStep('步骤2/3：正在部署 nova...');
  const deployNovaResult = await deployByJobKey('nova');
  if (!deployNovaResult.success) {
    appendStep(steps, 'deploy_nova', 'failure', deployNovaResult.message || '部署 nova 失败', deployNovaResult);
    onStep('步骤2/3失败，流程终止。');
    return { success: false, message: '部署 nova 失败，已终止后续并行部署。', steps };
  }
  const deployNovaFinal = await waitDeployDone(deployNovaResult, 'nova', onStep);
  appendStep(steps, deployNovaFinal.name, deployNovaFinal.status, deployNovaFinal.message, deployNovaFinal.detail);
  if (deployNovaFinal.status === 'failure') {
    onStep('步骤2/3失败，流程终止。');
    return { success: false, message: '部署 nova 未成功，已终止后续并行部署。', steps };
  }
  onStep('步骤2/3完成：部署 nova 成功。');

  onStep('步骤3/3：开始并行部署 react18 与 cc-web...');
  const [deployReact18, deployCcWeb] = await Promise.all([
    deployByJobKey('react18'),
    deployByJobKey('cc-web'),
  ]);

  const parallelWaitResults = await Promise.all([
    deployReact18.success
      ? waitDeployDone(deployReact18, 'react18', onStep)
      : Promise.resolve({
          name: 'deploy_react18',
          status: 'failure' as const,
          message: deployReact18.message || '部署 react18 触发失败',
          detail: deployReact18,
        }),
    deployCcWeb.success
      ? waitDeployDone(deployCcWeb, 'cc-web', onStep)
      : Promise.resolve({
          name: 'deploy_cc_web',
          status: 'failure' as const,
          message: deployCcWeb.message || '部署 cc-web 触发失败',
          detail: deployCcWeb,
        }),
  ]);
  parallelWaitResults.forEach((result) =>
    appendStep(steps, result.name, result.status, result.message, result.detail)
  );

  const hasFailure = steps.some(isFailure);
  if (hasFailure) {
    onStep('步骤3/3完成：并行部署存在失败，请查看步骤明细。');
    return {
      success: false,
      message: '复合流程已执行完成，但并行部署阶段存在失败。',
      steps,
    };
  }

  onStep('步骤3/3完成：react18 与 cc-web 并行部署均已触发。');
  onStep('复合流程执行完成。');
  return {
    success: true,
    message: '复合流程执行完成：已完成合并 nova、部署 nova，并并行触发 react18 与 cc-web 部署。',
    steps,
  };
}
