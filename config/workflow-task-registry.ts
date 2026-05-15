/* AI 生成 By Peng.Guo */
/**
 * 工作流 taskKey 注册表：用于「启动 xxx」时解析正确 workflow，避免 LLM 误传 standalone 等。
 * 与 workflows/*.json 中的 taskKey 保持同步。
 */

export const WORKFLOW_TASK_REGISTRY: Record<string, readonly string[]> = {
  'start-work': ['cpxy', 'react18', 'cc-web', 'biz-solution', 'uikit', 'shared'],
  'start-work-external-terminal': ['cpxy', 'react18', 'cc-web', 'biz-solution', 'uikit', 'shared'],
  standalone: ['scm'],
};

/** 按 taskKey 解析应执行的工作流；hint 若已包含该 key 则优先使用 */
export function resolveWorkflowForTaskKey(taskKey: string, hint?: string): string | null {
  const key = (taskKey ?? '').trim();
  if (!key) return null;
  const hintNorm = (hint ?? '').replace(/\.json$/i, '').trim();
  if (hintNorm && WORKFLOW_TASK_REGISTRY[hintNorm]?.includes(key)) return hintNorm;
  for (const [workflow, keys] of Object.entries(WORKFLOW_TASK_REGISTRY)) {
    if (keys.includes(key)) return workflow;
  }
  return null;
}

/** 所有可通过 run_workflow_step 单独启动的 taskKey */
export function getAllWorkflowTaskKeys(): string[] {
  const set = new Set<string>();
  for (const keys of Object.values(WORKFLOW_TASK_REGISTRY)) {
    for (const k of keys) set.add(k);
  }
  return [...set].sort();
}
