/* AI 生成 By Peng.Guo */

type ShellStepResult = {
  step?: number;
  tool?: string;
  stdout?: string;
};

type WorkflowToolResult = {
  tool?: string;
  result?: {
    results?: ShellStepResult[];
  };
};

/** 从 run_workflow(upgrade-react18-nova) 结果中提取第 10 步 Markdown 报告 */
export function extractNovaUpgradeVerifyMarkdown(toolResults: unknown[] | undefined): string | null {
  if (!Array.isArray(toolResults)) return null;
  const row = toolResults.find((entry) => (entry as WorkflowToolResult).tool === 'run_workflow') as
    | WorkflowToolResult
    | undefined;
  const steps = row?.result?.results;
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const last = steps[steps.length - 1];
  const stdout = (last as ShellStepResult).stdout ?? '';
  const marker = '# package.json 核对报告';
  const idx = stdout.indexOf(marker);
  if (idx < 0) return null;
  return stdout.slice(idx).trim();
}
