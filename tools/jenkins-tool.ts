/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';

function getAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (config.jenkins.username && config.jenkins.token) {
    h.Authorization = `Basic ${Buffer.from(`${config.jenkins.username}:${config.jenkins.token}`).toString('base64')}`;
  } else if (config.jenkins.token) {
    h.Authorization = `Bearer ${config.jenkins.token}`;
  }
  return h;
}

/** 获取 Jenkins Crumb（CSRF），若未启用则返回 null */
async function getCrumb(base: string): Promise<{ field: string; value: string } | null> {
  try {
    const res = await fetch(`${base}/crumbIssuer/api/json`, { headers: getAuthHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as { crumbRequestField?: string; crumb?: string };
    if (data.crumbRequestField && data.crumb) {
      return { field: data.crumbRequestField, value: data.crumb };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param jobName Jenkins 任务名
 * @param parameters 可选，构建参数，如 { BRANCH_NAME: 'test' }
 */
export async function deploy(jobName: string, parameters?: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const base = config.jenkins.baseUrl?.replace(/\/$/, '');
  if (!base) {
    return { success: false, message: 'Jenkins 未配置：请设置 JENKINS_BASE_URL' };
  }
  const url = `${base}/job/${encodeURIComponent(jobName)}/build`;
  const headers: Record<string, string> = { ...getAuthHeaders() };
  const crumb = await getCrumb(base);
  if (crumb) headers[crumb.field] = crumb.value;
  // Stapler 要求“表单提交”：传 json 参数（无参数任务用空数组），否则返回 400 Nothing is submitted
  headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const parameter = parameters
    ? Object.entries(parameters).map(([name, value]) => ({ name, value }))
    : [];
  const body = new URLSearchParams({ json: JSON.stringify({ parameter }) }).toString();
  const res = await fetch(url, { method: 'POST', headers, body });
  if (res.status === 201 || res.status === 200) {
    return { success: true, message: `已触发 Jenkins Job: ${jobName}` };
  }
  const text = await res.text();
  return { success: false, message: `Jenkins 请求失败 ${res.status}: ${text}` };
}
