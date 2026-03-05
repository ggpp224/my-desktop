/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';

export async function deploy(jobName: string): Promise<{ success: boolean; message: string }> {
  const base = config.jenkins.baseUrl?.replace(/\/$/, '');
  if (!base) {
    return { success: false, message: 'Jenkins 未配置：请设置 JENKINS_BASE_URL' };
  }
  const url = `${base}/job/${encodeURIComponent(jobName)}/build`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.jenkins.token) {
    headers.Authorization = `Bearer ${config.jenkins.token}`;
  }
  const res = await fetch(url, { method: 'POST', headers });
  if (res.status === 201 || res.status === 200) {
    return { success: true, message: `已触发 Jenkins Job: ${jobName}` };
  }
  const text = await res.text();
  return { success: false, message: `Jenkins 请求失败 ${res.status}: ${text}` };
}
