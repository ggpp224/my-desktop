/* AI 生成 By Peng.Guo */
import {
  buildChatCommandStat,
  buildDeployNovaPretestStat,
  buildDeployStat,
  buildKnowledgeImportStat,
  buildMergeStat,
  buildOpenUrlStat,
  buildWorkflowEmbeddedStat,
  buildWorkflowStepStat,
} from './command-stat-labels.js';
import { recordCommandStat } from './command-stats-repository.js';

export function recordChatCommand(message: string, route: string): void {
  recordCommandStat(buildChatCommandStat(message, route));
}

export function recordWorkflowEmbedded(workflowName: string, route: string): void {
  recordCommandStat(buildWorkflowEmbeddedStat(workflowName, route));
}

export function recordWorkflowStep(
  workflowName: string,
  taskKey: string | undefined,
  stepIndex: number | undefined,
  route: string
): void {
  recordCommandStat(buildWorkflowStepStat(workflowName, taskKey, stepIndex, route));
}

export function recordDeploy(jobKey: string, branch: string | undefined, route: string): void {
  recordCommandStat(buildDeployStat(jobKey, branch, route));
}

export function recordDeployNovaPretest(route: string): void {
  recordCommandStat(buildDeployNovaPretestStat(route));
}

export function recordMerge(repo: string, route: string): void {
  recordCommandStat(buildMergeStat(repo, route));
}

export function recordOpenUrl(route: string): void {
  recordCommandStat(buildOpenUrlStat(route));
}

export function recordKnowledgeImport(route: string): void {
  recordCommandStat(buildKnowledgeImportStat(route));
}
