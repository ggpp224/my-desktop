/* AI 生成 By Peng.Guo */
import { config } from './default.js';

/** 预定义 Jenkins Job：key 为前端/Agent 使用的简称，value 为完整 Job 名与构建参数 */
export const JENKINS_JOB_PRESETS: Record<string, { name: string; parameters?: Record<string, string> }> = {
  nova: { name: config.jenkins.jobs.nova, parameters: { BRANCH_NAME: 'test' } },
  'cc-web': { name: 'BUILD-to-HSY_PRETEST__saas-cc-web', parameters: { BRANCH_NAME: 'test-260127' } },
  react18: { name: 'BUILD-to-HSY_PRETEST__react18-antd5-mobx6', parameters: { BRANCH_NAME: 'test-260127' } },
  'biz-solution': { name: 'BUILD-to-HSY_PRETEST__biz-solution', parameters: { BRANCH_NAME: 'test-260127' } },
  'biz-guide': { name: 'BUILD-to-HSY_PRETEST__biz-solution-dev-guide', parameters: { BRANCH_NAME: 'test-260127' } },
  scm: { name: 'BUILD-to-HSY_PRETEST__saas-cc-web-scm', parameters: { BRANCH_NAME: 'test-260127' } },
};

export function getJenkinsPreset(jobKey: string): { name: string; parameters?: Record<string, string> } | null {
  const key = jobKey.trim();
  return key ? JENKINS_JOB_PRESETS[key] ?? null : null;
}
