/* AI 生成 By Peng.Guo */
import { Buffer } from 'buffer';
import { config } from '../config/default.js';
import { buildWeeklyReportDuringClause, formatJiraDateTimeInZone, getMondayWeekBoundsInTimeZone } from './jira-weekly-window.js';

const MY_BUG_JQL =
  'filter = bus AND (assignee in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg) AND status not in (Closed, 遗留, Resolved, 关闭, 待测试环境验证, 待集测环境验证, 待验证) OR 开发人员 in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg)) AND 开发人员 = guopengb AND status = Open ORDER BY updated DESC';
const MY_BUG_JQL_EXTRA =
  'filter = bus AND assignee in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg) AND status not in (Closed, 遗留, Resolved, 关闭, 待测试环境验证, 待集测环境验证, 待验证) AND 开发人员 not in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg) AND assignee = guopengb AND status = Open ORDER BY updated DESC';
const MY_BUG_JQL_IN_PROGRESS =
  'filter = bus AND (assignee in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg) AND status not in (Closed, 遗留, Resolved, 关闭, 待测试环境验证, 待集测环境验证, 待验证) OR 开发人员 in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg)) AND 开发人员 = guopengb AND status = "In Progress" ORDER BY updated';
const ONLINE_BUG_JQL =
  'issuetype in (线上需求, 线上缺陷, 线上BUG, 线上环境, 线上其他, 线上效率, "业务运维 - 线上问题", "业务运维 - 线上故障报告", 支持网-需求, 支持网-缺陷, 安全漏洞缺陷, 运维问题, 运维任务) AND assignee in (liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg) AND status not in (Closed, 关闭) AND issuetype = 线上缺陷 AND assignee = guopengb ORDER BY updated DESC';

const WEEKLY_TEAM_ACTORS = '(liuweiaq, guopengb, wangjuan3, zhangjinz, liyzb, wangmingg)';

function buildWeeklyDonePrimaryJql(weeklyDuring: string): string {
  return `(status changed to (待测试环境验证) by ${WEEKLY_TEAM_ACTORS} ${weeklyDuring} OR resolution changed to 已解决 by ${WEEKLY_TEAM_ACTORS} ${weeklyDuring} OR resolution changed to Fixed by ${WEEKLY_TEAM_ACTORS} ${weeklyDuring} OR status changed to Closed by currentUser() ${weeklyDuring}) AND 开发人员 = guopengb ORDER BY updated DESC`;
}

/** 补充：按解决时间落在本周（解决时间不受「谁点的流转」限制，避免 CHANGED 历史查不到）。可用 JIRA_WEEKLY_RESOLUTION_SUPPLEMENT=0 关闭。 */
function buildWeeklyDoneResolutionSupplementJql(timeZone: string, now: Date): string {
  const { start, end } = getMondayWeekBoundsInTimeZone(now, timeZone);
  const rs = formatJiraDateTimeInZone(start, timeZone);
  const re = formatJiraDateTimeInZone(end, timeZone);
  return `(开发人员 = guopengb AND resolution is not EMPTY AND resolutiondate >= "${rs}" AND resolutiondate < "${re}") ORDER BY updated DESC`;
}

interface JiraSearchResponse {
  issues?: Array<{
    id?: string;
    key?: string;
    self?: string;
    fields?: Record<string, unknown>;
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
  /** Jira 自定义字段「开发人员」展示名（多选时逗号拼接） */
  developer: string;
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

// AI 生成 By Peng.Guo
let developerFieldIdCache: string | undefined = undefined;
let developerFieldIdFetchAttempted = false;

function formatJiraDeveloperField(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) {
    return raw.map(formatJiraDeveloperField).filter(Boolean).join(', ');
  }
  if (typeof raw === 'object' && raw !== null) {
    const u = raw as { displayName?: string; name?: string; value?: string };
    const d = (u.displayName ?? '').trim();
    if (d) return d;
    const n = (u.name ?? '').trim();
    if (n) return n;
    const v = (u.value ?? '').trim();
    if (v) return v;
  }
  return '';
}

async function resolveDeveloperFieldId(baseUrl: string, authHeader: string): Promise<string | undefined> {
  const configured = config.jira.developerFieldId.trim();
  if (configured) return configured;
  if (developerFieldIdFetchAttempted) return developerFieldIdCache;
  developerFieldIdFetchAttempted = true;
  try {
    const res = await fetch(`${baseUrl}/rest/api/2/field`, {
      headers: { Accept: 'application/json', Authorization: authHeader },
    });
    if (!res.ok) return undefined;
    const list = (await res.json()) as Array<{ id?: string; name?: string }>;
    const hit = list.find((f) => (f.name ?? '').trim() === '开发人员');
    developerFieldIdCache = hit?.id?.trim() || undefined;
  } catch {
    developerFieldIdCache = undefined;
  }
  return developerFieldIdCache;
}

async function searchByJql(jql: string, maxResults: number): Promise<MyBugResult> {
  const baseUrl = config.jira.baseUrl.trim().replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('Jira 地址未配置：请设置 JIRA_BASE_URL。');
  }
  const authHeader = getAuthHeader();
  const devFieldId = await resolveDeveloperFieldId(baseUrl, authHeader);
  const fieldsParam = devFieldId
    ? `summary,status,resolution,fixVersions,assignee,updated,${devFieldId}`
    : 'summary,status,resolution,fixVersions,assignee,updated';
  const params = new URLSearchParams({
    jql,
    startAt: '0',
    maxResults: String(Math.max(1, Math.min(100, Math.floor(maxResults)))),
    fields: fieldsParam,
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
      const f = item.fields ?? {};
      const statusObj = f.status as { name?: string } | undefined;
      const resolutionObj = f.resolution as { name?: string } | undefined;
      const fixVersions = f.fixVersions as Array<{ name?: string }> | undefined;
      const assigneeObj = f.assignee as { displayName?: string; name?: string } | undefined;
      const rawDev = devFieldId ? f[devFieldId] : undefined;
      return {
        key,
        summary: String(f.summary ?? '').trim(),
        status: (statusObj?.name ?? '').trim(),
        resolution: (resolutionObj?.name ?? '未解决').trim(),
        fixVersion: (fixVersions?.map((v) => (v.name ?? '').trim()).filter(Boolean).join(', ') ?? '无').trim() || '无',
        assignee: (assigneeObj?.displayName ?? assigneeObj?.name ?? '未分配').trim(),
        developer: formatJiraDeveloperField(rawDev).trim() || '—',
        updated: String(f.updated ?? '').trim(),
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

function mergeIssuesAndSort(issuesList: MyBugItem[][]): MyBugItem[] {
  const dedup = new Map<string, MyBugItem>();
  for (const issue of issuesList.flat()) {
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
  return [...dedup.values()].sort((a, b) => {
    const left = Date.parse(a.updated || '');
    const right = Date.parse(b.updated || '');
    if (Number.isFinite(left) && Number.isFinite(right)) return right - left;
    if (Number.isFinite(right)) return 1;
    if (Number.isFinite(left)) return -1;
    return b.key.localeCompare(a.key);
  });
}

async function searchByMultipleJql(jqlList: string[], maxResults: number): Promise<MyBugResult> {
  const limit = Math.max(1, Math.min(100, Math.floor(maxResults)));
  const results = await Promise.all(jqlList.map((jql) => searchByJql(jql, limit)));
  const issues = mergeIssuesAndSort(results.map((item) => item.issues));
  return {
    success: true,
    jql: jqlList.join('\n---\n'),
    total: issues.length,
    maxResults: limit,
    issues: issues.slice(0, limit),
  };
}

export async function searchMyBugs(maxResults = 100): Promise<MyBugResult> {
  return searchByMultipleJql([MY_BUG_JQL, MY_BUG_JQL_EXTRA, MY_BUG_JQL_IN_PROGRESS], maxResults);
}

export async function searchOnlineBugs(maxResults = 100): Promise<MyBugResult> {
  return searchByMultipleJql([ONLINE_BUG_JQL], maxResults);
}

export async function searchWeeklyDoneTasks(maxResults = 100): Promise<MyBugResult> {
  const tz = config.jira.weeklyReportTimeZone.trim() || 'Asia/Shanghai';
  const now = new Date();
  const weeklyDuring = buildWeeklyReportDuringClause(tz, now);
  const primary = buildWeeklyDonePrimaryJql(weeklyDuring);
  const supplementOff = String(process.env.JIRA_WEEKLY_RESOLUTION_SUPPLEMENT ?? '').trim() === '0';
  const jqlList = supplementOff ? [primary] : [primary, buildWeeklyDoneResolutionSupplementJql(tz, now)];
  return searchByMultipleJql(jqlList, maxResults);
}

// AI 生成 By Peng.Guo
/** 本周内经办人曾为当前用户，但当前经办人、开发人员均不含当前用户（与周报同一业务周、时区）。 */
function buildWeeklyHandoffBugsJql(weeklyDuring: string): string {
  return `filter = bus AND assignee was currentUser() ${weeklyDuring} AND (assignee is EMPTY OR assignee != currentUser()) AND (开发人员 is EMPTY OR 开发人员 not in (currentUser())) ORDER BY updated DESC`;
}

export async function searchWeeklyHandoffBugs(maxResults = 100): Promise<MyBugResult> {
  const tz = config.jira.weeklyReportTimeZone.trim() || 'Asia/Shanghai';
  const weeklyDuring = buildWeeklyReportDuringClause(tz, new Date());
  return searchByMultipleJql([buildWeeklyHandoffBugsJql(weeklyDuring)], maxResults);
}
