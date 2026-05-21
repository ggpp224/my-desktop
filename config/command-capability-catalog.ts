/* AI 生成 By Peng.Guo */
/**
 * 独立可执行指令统计与明细：每个独立指令计 1，流程内单步、同义多种说法不重复计。
 */

import { toolsSchema } from '../agent/tools-schema.js';
import { DEPLOY_PRETEST_HINTS, FIXED_COMMAND_HINTS, MERGE_PRETEST_HINTS, type ProjectCapabilityInput } from './command-hints.js';
import { getAllWorkflowTaskKeys } from './workflow-task-registry.js';
import { getWorkflowCatalog } from './workflow-catalog.js';

export type { ProjectCapabilityInput } from './command-hints.js';
export { buildSupportedCommandHints } from './command-hints.js';

const WORKFLOW_COUNTED_IN_FIXED = new Set(['start-work', 'start-work-external-terminal']);

export interface CommandCapabilityBreakdown {
  fixedCommands: number;
  jsonWorkflows: number;
  agentTools: number;
  deployByProject: number;
  mergeByProject: number;
  terminalByProject: number;
  ideOpenByProject: number;
  ideCloseByProject: number;
  jenkinsOpenByProject: number;
  startDevByProject: number;
}

export interface CommandCapabilityDetailItem {
  label: string;
  note?: string;
}

export interface CommandCapabilitySection {
  key: string;
  title: string;
  description?: string;
  items: CommandCapabilityDetailItem[];
}

export interface CommandCapabilitySummary {
  total: number;
  breakdown: CommandCapabilityBreakdown;
  sections: CommandCapabilitySection[];
}

function item(label: string, note?: string): CommandCapabilityDetailItem {
  return note ? { label, note } : { label };
}

export function buildCommandCapabilityDetail(projects: ProjectCapabilityInput[]): CommandCapabilitySummary {
  const allCodes = Array.from(new Set(projects.flatMap((p) => p.codes))).sort();
  const jenkinsCodes = Array.from(
    new Set(projects.filter((p) => p.jenkins).flatMap((p) => p.codes))
  ).sort();
  const mergeCodes = Array.from(new Set(projects.filter((p) => p.merge).flatMap((p) => p.codes))).sort();
  const workflowStepKeys = new Set(getAllWorkflowTaskKeys());
  const externalStartCodes = allCodes.filter((code) => !workflowStepKeys.has(code));

  const fixedSection: CommandCapabilitySection = {
    key: 'fixed',
    title: '固定口令',
    description: '与聊天输入直接对应的独立指令',
    items: FIXED_COMMAND_HINTS.map((label) => item(label)),
  };

  const jsonWorkflowSection: CommandCapabilitySection = {
    key: 'json-workflows',
    title: '整段 JSON 工作流',
    description: 'workflows/*.json；开始工作两类已在固定口令中计过',
    items: getWorkflowCatalog()
      .filter((w) => !WORKFLOW_COUNTED_IN_FIXED.has(w.name))
      .map((w) => item(w.label, w.name)),
  };

  const agentToolsSection: CommandCapabilitySection = {
    key: 'agent-tools',
    title: 'Agent 工具',
    description: 'LLM 通过 tool_calls 调用的能力（每种工具计 1）',
    items: toolsSchema.map((t) => {
      const fn = t.function;
      const desc = (fn.description ?? '').split('。')[0]?.trim();
      return item(fn.name, desc || undefined);
    }),
  };

  const deployPretestItems = jenkinsCodes.includes('nova')
    ? DEPLOY_PRETEST_HINTS.map((label) => item(label))
    : [];

  const deploySection: CommandCapabilitySection = {
    key: 'deploy',
    title: 'Jenkins 部署',
    items: [...jenkinsCodes.map((code) => item(`部署 ${code}`)), ...deployPretestItems],
  };

  const mergeSection: CommandCapabilitySection = {
    key: 'merge',
    title: '代码合并',
    items: [
      ...mergeCodes.map((code) => item(`合并 ${code}`)),
      ...mergeCodes.flatMap((code) => (MERGE_PRETEST_HINTS[code] ?? []).map((label) => item(label))),
    ],
  };

  const terminalSection: CommandCapabilitySection = {
    key: 'terminal',
    title: '内嵌终端',
    items: allCodes.map((code) => item(`终端打开 ${code}`)),
  };

  const ideOpenSection: CommandCapabilitySection = {
    key: 'ide-open',
    title: '用 IDE 打开项目',
    description: 'ws / cursor / code 等多种说法合并为每项目 1 条',
    items: allCodes.map((code) => item(`用 IDE 打开 ${code}`)),
  };

  const ideCloseSection: CommandCapabilitySection = {
    key: 'ide-close',
    title: '关闭 IDE 中的项目',
    items: allCodes.map((code) => item(`关闭 IDE 中的 ${code}`)),
  };

  const jenkinsOpenSection: CommandCapabilitySection = {
    key: 'jenkins-open',
    title: '打开 Jenkins 任务页',
    items: jenkinsCodes.map((code) => item(`打开 Jenkins 的 ${code}`)),
  };

  const startDevSection: CommandCapabilitySection = {
    key: 'start-dev',
    title: '启动开发项目',
    description: '不在 start-work / standalone 工作流步骤中的项目',
    items: externalStartCodes.map((code) => item(`启动 ${code}`)),
  };

  const sections = [
    fixedSection,
    jsonWorkflowSection,
    agentToolsSection,
    deploySection,
    mergeSection,
    terminalSection,
    ideOpenSection,
    ideCloseSection,
    jenkinsOpenSection,
    startDevSection,
  ];

  const breakdown: CommandCapabilityBreakdown = {
    fixedCommands: fixedSection.items.length,
    jsonWorkflows: jsonWorkflowSection.items.length,
    agentTools: agentToolsSection.items.length,
    deployByProject: deploySection.items.length,
    mergeByProject: mergeSection.items.length,
    terminalByProject: terminalSection.items.length,
    ideOpenByProject: ideOpenSection.items.length,
    ideCloseByProject: ideCloseSection.items.length,
    jenkinsOpenByProject: jenkinsOpenSection.items.length,
    startDevByProject: startDevSection.items.length,
  };

  const total = sections.reduce((sum, s) => sum + s.items.length, 0);

  return { total, breakdown, sections };
}

/** @deprecated 使用 buildCommandCapabilityDetail */
export function summarizeCommandCapabilities(projects: ProjectCapabilityInput[]): CommandCapabilitySummary {
  return buildCommandCapabilityDetail(projects);
}
