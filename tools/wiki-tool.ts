/* AI 生成 By Peng.Guo */
import { open as browserOpen } from './browser-tool.js';
import { config } from '../config/default.js';

export type WeeklyReportResult = {
  quarter: string;
  weekRange: string;
  rootUrl: string;
  searchUrl: string;
  targetUrl: string;
  matchMode: 'api_descendants' | 'search_fallback';
};

interface ConfluencePageItem {
  id?: string;
  title?: string;
  ancestors?: Array<{ id?: string }>;
  _links?: {
    webui?: string;
    next?: string;
  };
}

interface ConfluenceSearchResponse {
  results?: ConfluencePageItem[];
  _links?: {
    next?: string;
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toYYMMDD(date: Date): string {
  const yy = date.getFullYear() % 100;
  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  return `${pad2(yy)}${pad2(mm)}${pad2(dd)}`;
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

function toAbsoluteWikiUrl(baseUrl: string, webui: string): string {
  if (!webui) return baseUrl;
  if (/^https?:\/\//i.test(webui)) return webui;
  return `${baseUrl}${webui.startsWith('/') ? '' : '/'}${webui}`;
}

async function fetchAllDescendantPages(baseUrl: string, rootPageId: string): Promise<ConfluencePageItem[]> {
  const allPages: ConfluencePageItem[] = [];
  const visited = new Set<string>();
  const queue: string[] = [rootPageId];

  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId) continue;
    let nextPath: string | null =
      `/rest/api/content/${encodeURIComponent(parentId)}/child/page?limit=200&start=0&expand=ancestors`;

    while (nextPath) {
      const url = nextPath.startsWith('http') ? nextPath : `${baseUrl}${nextPath.startsWith('/') ? '' : '/'}${nextPath}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: getWikiAuthHeaders(),
      });
      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`Wiki 子节点查询失败(${response.status}): ${bodyText || response.statusText}`);
      }
      const data = (await response.json()) as ConfluenceSearchResponse;
      for (const page of data.results ?? []) {
        const pageId = (page.id ?? '').trim();
        if (!pageId || visited.has(pageId)) continue;
        visited.add(pageId);
        allPages.push(page);
        queue.push(pageId);
      }
      nextPath = data._links?.next ?? null;
    }
  }
  return allPages;
}

function parseQuarterTitle(title: string): { year: number; quarter: number } | null {
  const match = title.trim().match(/^(\d{4})-Q([1-4])$/i);
  if (!match) return null;
  return { year: Number(match[1]), quarter: Number(match[2]) };
}

function parseWeekRangeTitle(title: string): { start: string; end: string } | null {
  const match = title.trim().match(/^(\d{6})-(\d{6})$/);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

function pickLatestQuarterPage(pages: ConfluencePageItem[]): ConfluencePageItem | null {
  const quarterPages = pages
    .map((page) => ({ page, parsed: parseQuarterTitle(page.title ?? '') }))
    .filter((item): item is { page: ConfluencePageItem; parsed: { year: number; quarter: number } } => Boolean(item.parsed));
  if (quarterPages.length === 0) return null;
  quarterPages.sort((a, b) => {
    if (a.parsed.year !== b.parsed.year) return b.parsed.year - a.parsed.year;
    return b.parsed.quarter - a.parsed.quarter;
  });
  return quarterPages[0].page;
}

function pickLatestWeekPageInQuarter(pages: ConfluencePageItem[], quarterPageId: string): ConfluencePageItem | null {
  const weeklyPages = pages
    .filter((page) => (page.ancestors ?? []).some((ancestor) => (ancestor.id ?? '').trim() === quarterPageId))
    .map((page) => ({ page, parsed: parseWeekRangeTitle(page.title ?? '') }))
    .filter((item): item is { page: ConfluencePageItem; parsed: { start: string; end: string } } => Boolean(item.parsed));
  if (weeklyPages.length === 0) return null;
  weeklyPages.sort((a, b) => {
    const byEnd = b.parsed.end.localeCompare(a.parsed.end);
    if (byEnd !== 0) return byEnd;
    return b.parsed.start.localeCompare(a.parsed.start);
  });
  return weeklyPages[0].page;
}

export async function openWeeklyReportPage(): Promise<WeeklyReportResult> {
  const baseUrl = normalizeBaseUrl(config.wiki.baseUrl);
  const spaceName = config.wiki.weeklySpaceName.trim() || '低代码单据前端空间';
  const rootPageId = config.wiki.weeklyRootPageId.trim() || '405143687';

  const rootUrl = `${baseUrl}/pages/viewpage.action?pageId=${encodeURIComponent(rootPageId)}`;
  const now = new Date();
  const nowHint = `${toYYMMDD(now)}`;
  const searchUrl = `${baseUrl}/dosearchsite.action?queryString=${encodeURIComponent(`${spaceName} ${nowHint}`)}`;
  let quarter = '';
  let weekRange = '';
  let targetUrl = searchUrl;
  let matchMode: 'api_descendants' | 'search_fallback' = 'search_fallback';

  if (!config.wiki.token.trim()) {
    throw new Error('Wiki 认证信息缺失：请在 .env 中配置 WIKI_TOKEN（并按需配置 WIKI_AUTH_SCHEME）。');
  }

  const allDescendants = await fetchAllDescendantPages(baseUrl, rootPageId);
  const quarterPage = pickLatestQuarterPage(allDescendants);
  const quarterId = (quarterPage?.id ?? '').trim();
  if (!quarterPage || !quarterId) {
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
  quarter = (quarterPage.title ?? '').trim();
  const weeklyPage = pickLatestWeekPageInQuarter(allDescendants, quarterId);
  const weekTitle = (weeklyPage?.title ?? '').trim();
  const webui = (weeklyPage?._links?.webui ?? '').trim();
  if (weekTitle && webui) {
    weekRange = weekTitle;
    targetUrl = toAbsoluteWikiUrl(baseUrl, webui);
    matchMode = 'api_descendants';
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
