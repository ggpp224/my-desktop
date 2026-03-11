/* AI 生成 By Peng.Guo */
/**
 * Jenkins 预定义任务：从统一项目配置 config/projects 派生，便于与项目一处维护。
 */
import { getProjectsWithJenkins } from './projects.js';

export type JenkinsPreset = { name: string; parameters?: Record<string, string> };

/** 预定义 Jenkins Job：key 为代号（任一代号均可），value 为完整 Job 名与构建参数 */
export function getJenkinsPresets(): Record<string, JenkinsPreset> {
  const presets: Record<string, JenkinsPreset> = {};
  for (const entry of getProjectsWithJenkins()) {
    if (!entry.jenkins) continue;
    const { jobName, defaultBranch } = entry.jenkins;
    const value: JenkinsPreset = { name: jobName, parameters: { BRANCH_NAME: defaultBranch } };
    for (const code of entry.codes) {
      const key = code.trim();
      if (key && !presets[key]) presets[key] = value;
    }
  }
  return presets;
}

/** 按代号或任务名获取 Jenkins 预设；代号不区分大小写 */
export function getJenkinsPreset(jobKey: string): JenkinsPreset | null {
  const key = jobKey.trim();
  if (!key) return null;
  const presets = getJenkinsPresets();
  const byCode = presets[key] ?? presets[key.toLowerCase()];
  if (byCode) return byCode;
  // 支持直接传完整 job 名
  for (const p of Object.values(presets)) {
    if (p.name === key) return p;
  }
  return null;
}
