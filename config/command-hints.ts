/* AI 生成 By Peng.Guo */
/**
 * 聊天输入提示列表（含流程内单步、同义说法，便于补全）。
 * 侧栏「Workflow（N）」计数见 command-capability-catalog（仅独立指令）。
 * 无 Node/Agent 依赖，可供 Vite 前端与 Node 后端共用。
 */
import { COMMAND_CATALOG_EXACT_LABELS } from './command-catalog.js';

export type ProjectCapabilityInput = {
  codes: string[];
  jenkins?: { jobName: string; defaultBranch: string };
  merge?: { targetBranch: string; runRelease: boolean };
};

const WORKFLOW_EXEC_HINTS = [
  '执行工作流 start-work',
  '执行工作流 start-work-external-terminal',
  '执行工作流 standalone',
  '执行工作流 upgrade-react18-nova',
  '执行工作流 upgrade-cc-web-nova',
  '升级集测react18的nova版本',
  '升级集测cc-web的nova版本',
] as const;

/** 固定口令（与 command-catalog 同源） */
export const FIXED_COMMAND_HINTS = COMMAND_CATALOG_EXACT_LABELS;

export const MERGE_PRETEST_HINTS: Record<string, readonly string[]> = {
  nova: ['合并 nova 集测'],
  'biz-solution': ['合并 biz-solution 集测', '合并 biz-solution集测'],
};

export const DEPLOY_PRETEST_HINTS = ['部署 nova 集测', '部署nova集测'] as const;

export function buildSupportedCommandHints(
  projects: ProjectCapabilityInput[],
  extra: string[] = []
): string[] {
  const allCodes = Array.from(new Set(projects.flatMap((p) => p.codes)));
  const jenkinsCodes = Array.from(new Set(projects.filter((p) => p.jenkins).flatMap((p) => p.codes)));
  const mergeCodes = Array.from(new Set(projects.filter((p) => p.merge).flatMap((p) => p.codes)));

  const startHints = allCodes.map((code) => `启动 ${code}`);
  const deployHints = jenkinsCodes.flatMap((code) => [`部署 ${code}`, `部署 ${code} 分支是 test`]);
  const jenkinsOpenHints = jenkinsCodes.flatMap((code) => [
    `打开 Jenkins 的 ${code}`,
    `打开jenkins ${code}`,
  ]);
  const openIdeHints = allCodes.flatMap((code) => [
    `ws打开${code}`,
    `cursor打开${code}`,
    `code打开${code}`,
    `用 WebStorm 打开 ${code}`,
    `用 Cursor 打开 ${code}`,
    `用 VS Code 打开 ${code}`,
  ]);
  const closeIdeHints = allCodes.flatMap((code) => [
    `关闭ws的${code}`,
    `关闭cursor的${code}`,
    `关闭code的${code}`,
    `关闭 WebStorm 的 ${code}`,
    `关闭 Cursor 的 ${code}`,
    `关闭 VS Code 的 ${code}`,
  ]);
  const mergeHints = [
    ...mergeCodes.map((code) => `合并 ${code}`),
    ...mergeCodes.flatMap((code) => MERGE_PRETEST_HINTS[code] ?? []),
  ];
  const deployPretestHints = jenkinsCodes.includes('nova') ? [...DEPLOY_PRETEST_HINTS] : [];
  const openProjectTerminalHints = allCodes.map((code) => `终端打开 ${code}`);

  return Array.from(
    new Set([
      ...FIXED_COMMAND_HINTS,
      ...WORKFLOW_EXEC_HINTS,
      ...startHints,
      ...deployHints,
      ...deployPretestHints,
      ...jenkinsOpenHints,
      ...openIdeHints,
      ...closeIdeHints,
      ...mergeHints,
      ...openProjectTerminalHints,
      ...extra.filter((h) => h.trim()),
    ])
  );
}
