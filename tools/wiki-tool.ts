/* AI 生成 By Peng.Guo */
import { open as browserOpen } from './browser-tool.js';
import { config } from '../config/default.js';

export type WeeklyReportResult = {
  quarter: string;
  weekRange: string;
  rootUrl: string;
  searchUrl: string;
  targetUrl: string;
  matchMode: 'api' | 'search_fallback';
};

interface ConfluencePageItem {
  id?: string;
  title?: string;
  _links?: {
    webui?: string;
  };
}

interface ConfluenceSearchResponse {
  results?: ConfluencePageItem[];
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getQuarter(monthIndex: number): 1 | 2 | 3 | 4 {
  if (monthIndex <= 2) return 1;
  if (monthIndex <= 5) return 2;
  if (monthIndex <= 8) return 3;
  return 4;
}

function toYYMMDD(date: Date): string {
  const yy = date.getFullYear() % 100;
  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  return `${pad2(yy)}${pad2(mm)}${pad2(dd)}`;
}

function getLatestWeekRangeByMonday(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date);
  const day = start.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offsetToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function getWikiAuthHeaders(): Record<string, string> {
  const token = config.wiki.token.trim();
  const authScheme = (config.wiki.authScheme || 'Bearer').trim() || 'Bearer';
  if (!token) {
    throw new Error('Wiki 认证信息缺失：请在环境变量中配置 WIKI_TOKEN。');
  }
  return {
    Accept: 'application/json',
    Authorization: `${authScheme} ${token}`,
  };
}

function hasWikiToken(): boolean {
  return Boolean(config.wiki.token.trim());
}

function toAbsoluteWikiUrl(baseUrl: string, webui: string): string {
  if (!webui) return baseUrl;
  if (/^https?:\/\//i.test(webui)) return webui;
  return `${baseUrl}${webui.startsWith('/') ? '' : '/'}${webui}`;
}

async function searchConfluencePageByCql(baseUrl: string, cql: string): Promise<ConfluencePageItem | null> {
  const url = `${baseUrl}/rest/api/content/search?${new URLSearchParams({
    cql,
    limit: '10',
  }).toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: getWikiAuthHeaders(),
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Wiki 查询失败(${response.status}): ${bodyText || response.statusText}`);
  }
  const data = (await response.json()) as ConfluenceSearchResponse;
  return data.results?.[0] ?? null;
}

export async function openWeeklyReportPage(): Promise<WeeklyReportResult> {
  const now = new Date();
  const quarter = `${now.getFullYear()}-Q${getQuarter(now.getMonth())}`;
  const { start, end } = getLatestWeekRangeByMonday(now);
  const weekRange = `${toYYMMDD(start)}-${toYYMMDD(end)}`;

  const baseUrl = normalizeBaseUrl(config.wiki.baseUrl);
  const spaceName = config.wiki.weeklySpaceName.trim() || '低代码单据前端空间';
  const rootPageId = config.wiki.weeklyRootPageId.trim() || '405143687';

  const rootUrl = `${baseUrl}/pages/viewpage.action?pageId=${encodeURIComponent(rootPageId)}`;
  const query = `${spaceName} ${quarter} ${weekRange}`;
  const searchUrl = `${baseUrl}/dosearchsite.action?queryString=${encodeURIComponent(query)}`;
  let targetUrl = searchUrl;
  let matchMode: 'api' | 'search_fallback' = 'search_fallback';

  if (!hasWikiToken()) {
    throw new Error('Wiki 认证信息缺失：请在 .env 中配置 WIKI_TOKEN（并按需配置 WIKI_AUTH_SCHEME）。');
  }

  const quarterCql = `type=page and ancestor=${rootPageId} and title="${quarter}"`;
  const quarterPage = await searchConfluencePageByCql(baseUrl, quarterCql);
  const quarterAncestor = quarterPage?.id?.trim();
  if (quarterAncestor) {
    const weekCql = `type=page and ancestor=${quarterAncestor} and title="${weekRange}"`;
    const weekPage = await searchConfluencePageByCql(baseUrl, weekCql);
    const webui = weekPage?._links?.webui?.trim() || '';
    if (webui) {
      targetUrl = toAbsoluteWikiUrl(baseUrl, webui);
      matchMode = 'api';
    } else {
      // 季度命中但周报页不存在时回退搜索，便于用户人工确认。
      targetUrl = searchUrl;
      matchMode = 'search_fallback';
    }
  }

  await browserOpen(targetUrl);

  return {
    quarter,
    weekRange,
    rootUrl,
    searchUrl,
    targetUrl,
    matchMode,
  };
}
