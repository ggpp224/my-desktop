/* AI 生成 By Peng.Guo */
import { getProjectDevCmd, getProjectPath } from '../config/projects.js';
import { resolveWorkflowForTaskKey } from '../config/workflow-task-registry.js';
import { runInTerminal } from './shell-tool.js';

const DEFAULT_DEV_CMD = 'yarn dev';

/** 项目代号是否由工作流步骤启动（如 start-work 中的 react18） */
export function isWorkflowTaskKey(code: string): boolean {
  return resolveWorkflowForTaskKey((code ?? '').trim()) != null;
}

/**
 * 在工作流未覆盖的项目目录下启动开发服务（默认 yarn dev，系统终端可见）。
 * 用于「启动 base」「启动 base18」等不在 workflows/*.json 中的项目。
 */
export async function startProjectDev(
  code: string,
  options?: { cmd?: string }
): Promise<{ success: boolean; cmd?: string; code?: string; error?: string }> {
  const projectCode = (code ?? '').trim();
  if (!projectCode) {
    return { success: false, error: '缺少项目代号' };
  }
  const dir = getProjectPath(projectCode);
  if (!dir) {
    return { success: false, error: `未配置项目路径: ${projectCode}（请在 .env 中设置 PROJECT_PATH_*）` };
  }
  const devCmd = (options?.cmd ?? getProjectDevCmd(projectCode)).trim() || DEFAULT_DEV_CMD;
  const cmd = `cd ${dir} && ${devCmd}`;
  try {
    await runInTerminal(cmd);
    return { success: true, cmd, code: projectCode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
