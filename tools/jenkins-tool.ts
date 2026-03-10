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

export type DeployResult = { success: boolean; message: string; queueUrl?: string; jobName?: string };

export type DeployStatusResult = {
  status: 'pending' | 'building' | 'success' | 'failure' | 'aborted' | 'unknown';
  message?: string;
  buildUrl?: string;
  /** 构建号，如 644，用于展示「构建 #644」 */
  buildNumber?: number;
  /** 任务名，用于展示构建名称 */
  buildName?: string;
  /** 执行中时的进度 0–100，来自 progress-bar-done 的 width */
  progressPercent?: number;
};

/**
 * 通过 buildHistory/ajax 的 HTML 解析最新构建状态（与 Jenkins 页面轮询一致）。
 * POST /job/{jobName}/buildHistory/ajax 返回 HTML，在整段内容中根据 icon 类名 / tooltip 判断状态。
 */
export async function getDeployStatusByBuildHistory(jobName: string): Promise<DeployStatusResult> {
  const base = config.jenkins.baseUrl?.replace(/\/$/, '');
  if (!base) {
    return { status: 'unknown', message: 'Jenkins 未配置' };
  }
  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = { ...authHeaders };
  const crumb = await getCrumb(base);
  if (crumb) headers[crumb.field] = crumb.value;
  headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
  const url = `${base}/job/${encodeURIComponent(jobName)}/buildHistory/ajax`;
  try {
    const res = await fetch(url, { method: 'POST', headers, body: '' });
    if (!res.ok) {
      return { status: 'unknown', message: `buildHistory 请求失败: ${res.status}` };
    }
    const html = await res.text();
    if (/Oops!|A problem occurred|log in|Logging ID=/i.test(html) && !/<tr[^>]*class="[^"]*build-row/i.test(html)) {
      return { status: 'unknown', message: 'Jenkins 返回错误页：需登录或无权访问该任务，请检查 JENKINS_USERNAME/JENKINS_TOKEN 与任务权限', buildName: jobName };
    }
    const firstRowMatch = html.match(/<tr[^>]*class="[^"]*build-row[^"]*"[^>]*>[\s\S]*?<\/tr>/);
    const row = firstRowMatch ? firstRowMatch[0] : html;
    const buildLinkMatch = row.match(/href="(\/job\/[^"]+\/(\d+))\/"/);
    const buildPath = buildLinkMatch ? buildLinkMatch[1] : '';
    const buildNum = buildLinkMatch ? parseInt(buildLinkMatch[2], 10) : undefined;
    const buildUrl = buildPath ? `${base}${buildPath.startsWith('/') ? '' : '/'}${buildPath}` : undefined;
    const buildName = jobName;
    // 从整段 HTML 解析进度：progress-bar-done 的 td 可能带 style="width:77%;"（在嵌套 table 中，用 row 会因内层 </tr> 截断而漏掉）
    const progressMatch = html.match(/class="progress-bar-done"[^>]*style="[^"]*width:\s*(\d+)\s*%|style="[^"]*width:\s*(\d+)\s*%[^"]*"[^>]*class="progress-bar-done"/);
    const progressPercent = progressMatch ? parseInt(progressMatch[1] || progressMatch[2], 10) : undefined;
    // 仅根据第一行（最新构建）判断状态，避免表中旧构建的「失败」被误用
    if (/icon-blue-anime|build-status-in-progress|执行中|in-progress/.test(row)) {
      const msg = progressPercent != null ? `构建中… ${progressPercent}%` : '构建中…';
      return { status: 'building', message: msg, buildUrl, buildNumber: buildNum, buildName, progressPercent };
    }
    if (/icon-red|build-status-failure|失败|failure/.test(row)) {
      return { status: 'failure', message: '部署失败：构建失败', buildUrl, buildNumber: buildNum, buildName };
    }
    if (/icon-aborted|build-status-aborted|已取消|aborted/.test(row)) {
      return { status: 'aborted', message: '部署失败：已取消', buildUrl, buildNumber: buildNum, buildName };
    }
    if (/icon-blue(?!-anime)|build-status-static|last-successful|成功|success/.test(row)) {
      return { status: 'success', message: '部署成功', buildUrl, buildNumber: buildNum, buildName };
    }
    if (buildUrl) {
      return { status: 'unknown', message: '无法识别构建状态', buildUrl, buildNumber: buildNum, buildName };
    }
    return { status: 'unknown', message: '未解析到构建记录' };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { status: 'unknown', message: err };
  }
}

/** 单次查询部署状态（不阻塞）：根据队列 URL 查队列与构建 API，返回当前状态 */
export async function getDeployStatus(queueUrl: string): Promise<DeployStatusResult> {
  const base = config.jenkins.baseUrl?.replace(/\/$/, '');
  if (!base) {
    return { status: 'unknown', message: 'Jenkins 未配置' };
  }
  const authHeaders = getAuthHeaders();
  const normalizedQueue = queueUrl.replace(/\/?$/, '');
  try {
    const queueRes = await fetch(`${normalizedQueue}/api/json`, { headers: authHeaders });
    if (!queueRes.ok) {
      if (queueRes.status === 404) return { status: 'unknown', message: '队列项已过期或不存在' };
      return { status: 'unknown', message: `队列请求失败: ${queueRes.status}` };
    }
    const queueData = (await queueRes.json()) as { executable?: { number?: number; url?: string } };
    if (!queueData.executable?.url) {
      return { status: 'pending', message: '排队中…', buildNumber: queueData.executable?.number };
    }
    const buildUrl = queueData.executable.url;
    const buildNum = queueData.executable.number;
    const buildRes = await fetch(`${buildUrl.replace(/\/?$/, '')}/api/json`, { headers: authHeaders });
    if (!buildRes.ok) {
      return { status: 'building', message: '构建中…', buildUrl, buildNumber: buildNum };
    }
    const buildData = (await buildRes.json()) as { building?: boolean; result?: string | null };
    if (buildData.building === true) {
      // 从 buildUrl 解析 jobName（如 /job/JOB_NAME/6406/），再查 buildHistory 获取进度条百分比
      const jobNameFromUrl = buildUrl.match(/\/job\/([^/]+)\/\d+/)?.[1];
      if (jobNameFromUrl) {
        const withProgress = await getDeployStatusByBuildHistory(decodeURIComponent(jobNameFromUrl));
        if (withProgress.status === 'building' && (withProgress.progressPercent != null || withProgress.message)) {
          return { status: 'building', message: withProgress.message ?? '构建中…', buildUrl, buildNumber: buildNum, buildName: jobNameFromUrl, progressPercent: withProgress.progressPercent };
        }
      }
      return { status: 'building', message: '构建中…', buildUrl, buildNumber: buildNum };
    }
    const result = (buildData.result ?? 'UNKNOWN').toUpperCase();
    const msg =
      result === 'SUCCESS'
        ? '部署成功'
        : result === 'FAILURE'
          ? '部署失败：构建失败'
          : result === 'ABORTED'
            ? '部署失败：已取消'
            : `部署结束（状态: ${result}）`;
    const status =
      result === 'SUCCESS' ? 'success' : result === 'FAILURE' ? 'failure' : result === 'ABORTED' ? 'aborted' : 'unknown';
    return { status, message: msg, buildUrl, buildNumber: buildNum };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { status: 'unknown', message: err };
  }
}

/**
 * 触发 Jenkins 构建，立即返回（不阻塞）。若响应带 Location 则返回 queueUrl 供前端轮询状态。
 * @param jobName Jenkins 任务名
 * @param parameters 可选，构建参数，如 { BRANCH_NAME: 'test' }
 */
export async function deploy(
  jobName: string,
  parameters?: Record<string, string>
): Promise<DeployResult> {
  const base = config.jenkins.baseUrl?.replace(/\/$/, '');
  if (!base) {
    return { success: false, message: 'Jenkins 未配置：请设置 JENKINS_BASE_URL' };
  }
  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = { ...authHeaders };
  const crumb = await getCrumb(base);
  if (crumb) headers[crumb.field] = crumb.value;

  let url: string;
  let body: string | undefined;
  if (parameters && Object.keys(parameters).length > 0) {
    url = `${base}/job/${encodeURIComponent(jobName)}/buildWithParameters?${new URLSearchParams(parameters).toString()}`;
    body = undefined;
  } else {
    url = `${base}/job/${encodeURIComponent(jobName)}/build`;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams({ json: JSON.stringify({ parameter: [] }) }).toString();
  }

  const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual' as RequestRedirect });
  if (res.status !== 201 && res.status !== 200) {
    const text = await res.text();
    const isErrorPage = /Oops!|log in|A problem occurred|Logging ID=/i.test(text);
    const shortMsg = isErrorPage
      ? `Jenkins 返回 ${res.status}：需登录或该任务无权触发，请检查 JENKINS_USERNAME/JENKINS_TOKEN 与任务权限`
      : `Jenkins 请求失败 ${res.status}: ${text.slice(0, 200)}`;
    return { success: false, message: shortMsg };
  }

  const location = res.headers.get('Location');
  const queueUrl = location
    ? (location.startsWith('http') ? location : new URL(location, base + '/').href)
    : undefined;
  const message = queueUrl ? '已触发，构建中…' : `已触发 Jenkins Job: ${jobName}`;
  return { success: true, message, queueUrl };
}
