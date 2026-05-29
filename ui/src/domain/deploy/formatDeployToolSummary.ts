/* AI 生成 By Peng.Guo */

export type DeploySummaryLink = {
  label: string;
  url: string;
};

export type DeployStepSummary = {
  label: string;
  status: 'success' | 'failure';
  message: string;
  links: DeploySummaryLink[];
};

export type CompositeDeploySummary = {
  headline: string;
  steps: DeployStepSummary[];
};

type ToolResultRow = {
  tool?: string;
  result?: unknown;
  error?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function stepNameToLabel(name: string): string {
  const map: Record<string, string> = {
    merge_nova: '合并 nova',
    deploy_nova: '部署 nova',
    deploy_react18: '部署 react18',
    deploy_cc_web: '部署 cc-web',
  };
  return map[name] ?? name.replace(/_/g, ' ');
}

function collectDeployLinks(detail: unknown): DeploySummaryLink[] {
  const root = asRecord(detail);
  if (!root) return [];
  const deployResult = asRecord(root.deployResult) ?? root;
  const status = asRecord(root.status);
  const links: DeploySummaryLink[] = [];
  const buildUrl = pickString(deployResult, ['buildUrl', 'build_url']) || pickString(status ?? {}, ['buildUrl', 'build_url']);
  const jobUrl = pickString(deployResult, ['jobUrl', 'job_url']);
  const queueUrl = pickString(deployResult, ['queueUrl', 'queue_url']);
  const jobName = pickString(deployResult, ['jobName', 'job_name']);
  if (buildUrl) links.push({ label: '构建', url: buildUrl });
  if (jobUrl) links.push({ label: 'Jenkins 任务', url: jobUrl });
  else if (jobName) links.push({ label: jobName, url: jobUrl });
  if (queueUrl && !links.some((l) => l.url === queueUrl)) {
    links.push({ label: '排队', url: queueUrl });
  }
  return links;
}

function formatStepLine(step: DeployStepSummary): string {
  const statusText = step.status === 'success' ? '成功' : '失败';
  const msg = step.message.trim();
  const linkPart = step.links.map((l) => `[${l.label}](${l.url})`).join(' ');
  const core = msg ? `${step.label}：${statusText} — ${msg}` : `${step.label}：${statusText}`;
  return linkPart ? `${core} ${linkPart}` : core;
}

function formatCompositeStepsMarkdown(summary: CompositeDeploySummary): string {
  return summary.steps.map((s) => `· ${formatStepLine(s)}`).join('\n');
}

export function formatCompositeWorkflowMarkdown(result: unknown): string | null {
  const summary = buildCompositeDeploySummary(result);
  if (!summary) return null;
  const lines = formatCompositeStepsMarkdown(summary);
  return [summary.headline, lines].filter(Boolean).join('\n');
}

/** 复合流程步骤明细（不含总述行，供聊天区与 headline 分行展示） */
export function formatCompositeWorkflowStepsMarkdown(result: unknown): string | null {
  const summary = buildCompositeDeploySummary(result);
  if (!summary || !summary.steps.length) return null;
  return formatCompositeStepsMarkdown(summary);
}

export function getCompositeWorkflowHeadline(result: unknown): string | null {
  const summary = buildCompositeDeploySummary(result);
  return summary?.headline ?? null;
}

export function buildCompositeDeploySummary(result: unknown): CompositeDeploySummary | null {
  const record = asRecord(result);
  if (!record) return null;
  const stepsRaw = record.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) return null;
  const headline =
    (typeof record.message === 'string' && record.message.trim()) ||
    (record.success === true ? '复合流程执行完成' : '复合流程执行结束');
  const steps: DeployStepSummary[] = [];
  for (const item of stepsRaw) {
    const step = asRecord(item);
    if (!step) continue;
    const name = pickString(step, ['name']) || '步骤';
    const status = step.status === 'success' ? 'success' : 'failure';
    const message = pickString(step, ['message']) || (status === 'success' ? '完成' : '失败');
    steps.push({
      label: stepNameToLabel(name),
      status,
      message,
      links: collectDeployLinks(step.detail),
    });
  }
  if (!steps.length) return null;
  return { headline, steps };
}

export function extractCompositeWorkflowResult(toolResults: unknown[] | undefined): unknown | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find((item) => (item as ToolResultRow).tool === 'composite_nova_merge_and_deploy') as
    | ToolResultRow
    | undefined;
  return row?.result ?? null;
}

/** 仅「合并nova并部署相关服务」走摘要展示，其它指令仍按原逻辑（含 JSON 兜底） */
export function isCompositeNovaMergeDeployToolResults(toolResults: unknown[] | undefined): boolean {
  if (!Array.isArray(toolResults)) return false;
  return toolResults.some((item) => (item as ToolResultRow).tool === 'composite_nova_merge_and_deploy');
}
