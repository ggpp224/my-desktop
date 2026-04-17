/* AI 生成 By Peng.Guo */
import { Buffer } from 'buffer';
import { config } from '../config/default.js';

const MY_BUG_JQL =
  'filter = bus AND (assignee in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg) AND status not in (Closed, 遗留, Resolved, 关闭, 待测试环境验证, 待集测环境验证, 待验证) OR 开发人员 in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg)) AND 开发人员 = guopengb AND status = Open ORDER BY updated DESC';
const MY_BUG_JQL_EXTRA =
  'filter = bus AND assignee in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg) AND status not in (Closed, 遗留, Resolved, 关闭, 待测试环境验证, 待集测环境验证, 待验证) AND 开发人员 not in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg) AND assignee = guopengb AND status = Open ORDER BY updated DESC';

interface JiraSearchResponse {
  issues?: Array<{
    id?: string;
    key?: string;
    self?: string;
    fields?: {
      summary?: string;
      status?: { name?: string };
      resolution?: { name?: string };
      fixVersions?: Array<{ name?: string }>;
      assignee?: { displayName?: string; name?: string };
      updated?: string;
    };
  }>;
  startAt?: number;
  maxResults?: number;
  total?: number;
}

export interface MyBugItem {
  key: string;
  summary: string;
  status: string;
  resolution: string;
  fixVersion: string;
  assignee: string;
  updated: string;
  url: string;
}

export interface MyBugResult {
  success: boolean;
  jql: string;
  total: number;
  maxResults: number;
  issues: MyBugItem[];
}

function getAuthHeader(): string {
  const username = config.jira.username.trim();
  const password = config.jira.password.trim();
  if (!username || !password) {
    throw new Error('Jira 认证信息缺失：请在环境变量中配置 JIRA_USERNAME 和 JIRA_PASSWORD。');
  }
  const basic = Buffer.from(`${username}:${password}`, 'utf-8').toString('base64');
  return `Basic ${basic}`;
}

function buildIssueUrl(baseUrl: string, issueKey: string): string {
  const cleaned = baseUrl.replace(/\/$/, '');
  return `${cleaned}/browse/${encodeURIComponent(issueKey)}`;
}

async function searchByJql(jql: string, maxResults: number): Promise<MyBugResult> {
  const baseUrl = config.jira.baseUrl.trim().replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('Jira 地址未配置：请设置 JIRA_BASE_URL。');
  }
  const authHeader = getAuthHeader();
  const params = new URLSearchParams({
    jql,
    startAt: '0',
    maxResults: String(Math.max(1, Math.min(50, Math.floor(maxResults)))),
    fields: 'summary,status,resolution,fixVersions,assignee,updated',
  });
  const url = `${baseUrl}/rest/api/2/search?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: authHeader,
    },
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Jira 查询失败(${response.status}): ${bodyText || response.statusText}`);
  }
  const data = (await response.json()) as JiraSearchResponse;
  const issues =
    data.issues?.map((item) => {
      const key = (item.key ?? '').trim();
      return {
        key,
        summary: (item.fields?.summary ?? '').trim(),
        status: (item.fields?.status?.name ?? '').trim(),
        resolution: (item.fields?.resolution?.name ?? '未解决').trim(),
        fixVersion: (item.fields?.fixVersions?.map((v) => (v.name ?? '').trim()).filter(Boolean).join(', ') ?? '无').trim() || '无',
        assignee: (item.fields?.assignee?.displayName ?? item.fields?.assignee?.name ?? '未分配').trim(),
        updated: (item.fields?.updated ?? '').trim(),
        url: key ? buildIssueUrl(baseUrl, key) : (item.self ?? '').trim(),
      };
    }) ?? [];
  return {
    success: true,
    jql,
    total: Number(data.total ?? issues.length),
    maxResults: Number(data.maxResults ?? issues.length),
    issues,
  };
}

export async function searchMyBugs(maxResults = 20): Promise<MyBugResult> {
  const [primary, extra] = await Promise.all([
    searchByJql(MY_BUG_JQL, maxResults),
    searchByJql(MY_BUG_JQL_EXTRA, maxResults),
  ]);
  const dedup = new Map<string, MyBugItem>();
  for (const issue of [...primary.issues, ...extra.issues]) {
    const key = issue.key.trim();
    if (!key) continue;
    const existed = dedup.get(key);
    if (!existed) {
      dedup.set(key, issue);
      continue;
    }
    const nextTime = Date.parse(issue.updated || '');
    const oldTime = Date.parse(existed.updated || '');
    if (Number.isFinite(nextTime) && (!Number.isFinite(oldTime) || nextTime > oldTime)) {
      dedup.set(key, issue);
    }
  }
  const issues = [...dedup.values()].sort((a, b) => {
    const left = Date.parse(a.updated || '');
    const right = Date.parse(b.updated || '');
    if (Number.isFinite(left) && Number.isFinite(right)) return right - left;
    if (Number.isFinite(right)) return 1;
    if (Number.isFinite(left)) return -1;
    return b.key.localeCompare(a.key);
  });
  const limit = Math.max(1, Math.min(50, Math.floor(maxResults)));
  return {
    success: true,
    jql: `${MY_BUG_JQL}\n---\n${MY_BUG_JQL_EXTRA}`,
    total: issues.length,
    maxResults: limit,
    issues: issues.slice(0, limit),
  };
}
