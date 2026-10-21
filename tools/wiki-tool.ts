/* AI 生成 By Peng.Guo */
import { parse, HTMLElement } from 'node-html-parser';
import { open as browserOpen } from './browser-tool.js';
import { config } from '../config/default.js';
import {
  extractYmdInTz,
  formatCalendarQuarterTitleInTimeZone,
  formatQuarterTitleForWikiWeekRange,
  formatWikiWeekRangeTitleInTimeZone,
  getCalendarQuarterInTimeZone,
} from './jira-weekly-window.js';

export type WeeklyReportResult = {
  quarter: string;
  weekRange: string;
  rootUrl: string;
  searchUrl: string;
  targetUrl: string;
  matchMode: 'api_descendants' | 'search_fallback';
  /** 与「周报」打开的页面一致：最新周区间子页 id（仅 api_descendants 命中周页时有值） */
  pageId?: string;
  /** 周区间子页标题（通常与 weekRange 相同） */
  pageTitle?: string;
};

/** 抓取周报页后的结构化结果（含 Confluence storage 正文） */
export type FetchWeeklyReportInfoResult = WeeklyReportResult & {
  success: boolean;
  error?: string;
  /** Confluence storage / view 正文（XHTML 或 wiki storage，依实例为准） */
  bodyStorage?: string;
  versionNumber?: number;
  versionWhen?: string;
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

interface ConfluenceContentBody {
  value?: string;
  representation?: string;
}

interface ConfluenceContentResponse {
  id?: string;
  title?: string;
  space?: { key?: string };
  body?: {
    storage?: ConfluenceContentBody;
    view?: ConfluenceContentBody;
  };
  version?: { number?: number; when?: string };
  _links?: { webui?: string };
}

/** 「创建周报页面」结果 */
export type CreateWeeklyReportPageResult = {
  success: boolean;
  /** 下周页已存在，未做任何修改 */
  skipped: boolean;
  error?: string;
  message?: string;
  sourceWeekRange?: string;
  nextWeekRange?: string;
  quarter?: string;
  /** 本次是否新建了季度页 */
  quarterCreated?: boolean;
  pageId?: string;
  pageTitle?: string;
  targetUrl?: string;
};

const WEEKLY_CLEAR_COLUMN_HEADERS = ['本周工作', '下周计划'] as const;

/** Confluence storage 为 XHTML：void 标签须带闭合斜杠，否则 col/br 等会触发 400。 */
const CONFLUENCE_STORAGE_PARSE_OPTIONS = {
  comment: true,
  voidTag: {
    closingSlash: true,
  },
} as const;

/**
 * 兜底：把未自闭合的 void 标签写成 XHTML（node-html-parser 偶发仍可能漏斜杠）。
 */
export function normalizeConfluenceStorageXhtml(html: string): string {
  return html.replace(
    /<(col|br|hr|img|input|meta|link|base|area|embed|source|track|wbr)(\s[^>/]*?)?\s*>/gi,
    (_m, tag: string, attrs: string | undefined) => {
      const a = (attrs ?? '').trimEnd();
      return a ? `<${tag}${a} />` : `<${tag} />`;
    },
  );
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

export function pickQuarterPageForDate(pages: ConfluencePageItem[], now: Date, timeZone: string): ConfluencePageItem | null {
  const { year: targetYear, quarter: targetQuarter } = getCalendarQuarterInTimeZone(now, timeZone);
  const quarterPages = pages
    .map((page) => ({ page, parsed: parseQuarterTitle(page.title ?? '') }))
    .filter((item): item is { page: ConfluencePageItem; parsed: { year: number; quarter: number } } => Boolean(item.parsed));
  if (quarterPages.length === 0) return null;

  const exact = quarterPages.find(
    (item) => item.parsed.year === targetYear && item.parsed.quarter === targetQuarter,
  );
  if (exact) return exact.page;

  const notFuture = quarterPages.filter((item) => {
    if (item.parsed.year !== targetYear) return item.parsed.year < targetYear;
    return item.parsed.quarter <= targetQuarter;
  });
  if (notFuture.length === 0) return null;
  notFuture.sort((a, b) => {
    if (a.parsed.year !== b.parsed.year) return b.parsed.year - a.parsed.year;
    return b.parsed.quarter - a.parsed.quarter;
  });
  return notFuture[0].page;
}

export function pickWeekPageForDate(
  pages: ConfluencePageItem[],
  quarterPageId: string,
  now: Date,
  timeZone: string,
): ConfluencePageItem | null {
  const expectedWeekRange = formatWikiWeekRangeTitleInTimeZone(now, timeZone);
  const mondayYyMmDd = expectedWeekRange.slice(0, 6);
  const sundayYyMmDd = expectedWeekRange.slice(7, 13);
  const weeklyPages = pages
    .filter((page) => (page.ancestors ?? []).some((ancestor) => (ancestor.id ?? '').trim() === quarterPageId))
    .map((page) => ({ page, parsed: parseWeekRangeTitle(page.title ?? '') }))
    .filter((item): item is { page: ConfluencePageItem; parsed: { start: string; end: string } } => Boolean(item.parsed));
  if (weeklyPages.length === 0) return null;

  const exact = weeklyPages.find((item) => (item.page.title ?? '').trim() === expectedWeekRange);
  if (exact) return exact.page;

  const matchingMondayWeek = weeklyPages.find(
    (item) => item.parsed.start === mondayYyMmDd && item.parsed.end === sundayYyMmDd,
  );
  if (matchingMondayWeek) return matchingMondayWeek.page;

  const endedBeforeThisWeek = weeklyPages.filter((item) => item.parsed.end < mondayYyMmDd);
  if (endedBeforeThisWeek.length > 0) {
    endedBeforeThisWeek.sort((a, b) => {
      const byEnd = b.parsed.end.localeCompare(a.parsed.end);
      if (byEnd !== 0) return byEnd;
      return b.parsed.start.localeCompare(a.parsed.start);
    });
    return endedBeforeThisWeek[0].page;
  }

  weeklyPages.sort((a, b) => {
    const byEnd = b.parsed.end.localeCompare(a.parsed.end);
    if (byEnd !== 0) return byEnd;
    return b.parsed.start.localeCompare(a.parsed.start);
  });
  return weeklyPages[0].page;
}

/** 与「周报」指令相同规则解析目标页（不打开浏览器）。 */
export async function resolveWeeklyReportNavigation(): Promise<WeeklyReportResult> {
  const baseUrl = normalizeBaseUrl(config.wiki.baseUrl);
  const spaceName = config.wiki.weeklySpaceName.trim() || '低代码单据前端空间';
  const rootPageId = config.wiki.weeklyRootPageId.trim() || '405143687';
  const timeZone = config.jira.weeklyReportTimeZone.trim() || 'Asia/Shanghai';

  const rootUrl = `${baseUrl}/pages/viewpage.action?pageId=${encodeURIComponent(rootPageId)}`;
  const now = new Date();
  const weekRangeHint = formatWikiWeekRangeTitleInTimeZone(now, timeZone);
  const searchUrl = `${baseUrl}/dosearchsite.action?queryString=${encodeURIComponent(`${spaceName} ${weekRangeHint}`)}`;
  const baseResult: WeeklyReportResult = {
    quarter: '',
    weekRange: weekRangeHint,
    rootUrl,
    searchUrl,
    targetUrl: searchUrl,
    matchMode: 'search_fallback',
  };

  if (!config.wiki.token.trim()) {
    throw new Error('Wiki 认证信息缺失：请在 .env 中配置 WIKI_TOKEN（并按需配置 WIKI_AUTH_SCHEME）。');
  }

  const allDescendants = await fetchAllDescendantPages(baseUrl, rootPageId);
  const quarterPage = pickQuarterPageForDate(allDescendants, now, timeZone);
  const quarterId = (quarterPage?.id ?? '').trim();
  if (!quarterPage || !quarterId) {
    return baseResult;
  }
  baseResult.quarter = (quarterPage.title ?? '').trim();
  const weeklyPage = pickWeekPageForDate(allDescendants, quarterId, now, timeZone);
  const weekTitle = (weeklyPage?.title ?? '').trim();
  const webui = (weeklyPage?._links?.webui ?? '').trim();
  if (weekTitle && webui) {
    baseResult.weekRange = weekTitle;
    baseResult.targetUrl = toAbsoluteWikiUrl(baseUrl, webui);
    baseResult.matchMode = 'api_descendants';
    const pid = (weeklyPage?.id ?? '').trim();
    if (pid) {
      baseResult.pageId = pid;
      baseResult.pageTitle = weekTitle;
    }
  }
  return baseResult;
}

export async function openWeeklyReportPage(): Promise<WeeklyReportResult> {
  const nav = await resolveWeeklyReportNavigation();
  await browserOpen(nav.targetUrl);
  return nav;
}

// AI 生成 By Peng.Guo
/** 按「周报」同逻辑定位周区间页后，通过 REST 拉取 storage/view 正文供 Agent 或二次处理。 */
export async function fetchWeeklyReportPageInfo(): Promise<FetchWeeklyReportInfoResult> {
  const nav = await resolveWeeklyReportNavigation();
  const pageId = (nav.pageId ?? '').trim();
  if (!pageId) {
    return {
      ...nav,
      success: false,
      error: '未解析到周区间子页面 pageId（可能缺少最新季度/周区间子页），无法抓取正文；可改用「周报」打开站内搜索链接。',
    };
  }
  const baseUrl = normalizeBaseUrl(config.wiki.baseUrl);
  const expand = encodeURIComponent('body.storage,body.view,version');
  const url = `${baseUrl}/rest/api/content/${encodeURIComponent(pageId)}?expand=${expand}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: getWikiAuthHeaders(),
  });
  if (!response.ok) {
    const bodyText = await response.text();
    return {
      ...nav,
      success: false,
      error: `Wiki 拉取页面失败(${response.status}): ${bodyText || response.statusText}`,
    };
  }
  const data = (await response.json()) as ConfluenceContentResponse;
  const rawBody = (data.body?.storage?.value ?? data.body?.view?.value ?? '').trim();
  return {
    ...nav,
    success: true,
    pageId,
    pageTitle: (data.title ?? nav.pageTitle ?? '').trim() || nav.pageTitle,
    bodyStorage: rawBody,
    versionNumber: data.version?.number,
    versionWhen: typeof data.version?.when === 'string' ? data.version.when : undefined,
  };
}

function getDirectChildRows(table: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];
  for (const child of table.childNodes) {
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.tagName.toUpperCase();
    if (tag === 'TR') {
      rows.push(child);
      continue;
    }
    if (tag === 'TBODY' || tag === 'THEAD') {
      for (const nested of child.childNodes) {
        if (nested instanceof HTMLElement && nested.tagName.toUpperCase() === 'TR') {
          rows.push(nested);
        }
      }
    }
  }
  return rows;
}

function getDirectCells(tr: HTMLElement): HTMLElement[] {
  const cells: HTMLElement[] = [];
  for (const child of tr.childNodes) {
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.tagName.toUpperCase();
    if (tag === 'TD' || tag === 'TH') cells.push(child);
  }
  return cells;
}

function cellPlainText(cell: HTMLElement): string {
  return cell.textContent.replace(/\s+/g, ' ').trim();
}

function parseSpan(cell: HTMLElement, attr: 'colspan' | 'rowspan'): number {
  const raw = (cell.getAttribute(attr) ?? '1').trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * 清空周报表格中「本周工作」「下周计划」两列正文（保留表头与其余列）。
 * 仅处理页面 body（storage/view），不含评论区。
 */
export function clearWeeklyReportWorkPlanColumns(storageHtml: string): string {
  if (!storageHtml.trim()) return storageHtml;
  const root = parse(storageHtml, CONFLUENCE_STORAGE_PARSE_OPTIONS);
  for (const table of root.querySelectorAll('table')) {
    if (!(table instanceof HTMLElement)) continue;
    const rows = getDirectChildRows(table);
    if (rows.length === 0) continue;

    const occupancy: Array<Array<HTMLElement | null>> = [];
    const clearCols = new Set<number>();

    for (let r = 0; r < rows.length; r++) {
      occupancy[r] = occupancy[r] ?? [];
      const cells = getDirectCells(rows[r]);
      let c = 0;
      for (const cell of cells) {
        while (occupancy[r][c]) c += 1;
        const colspan = parseSpan(cell, 'colspan');
        const rowspan = parseSpan(cell, 'rowspan');
        for (let rr = 0; rr < rowspan; rr++) {
          const rowIdx = r + rr;
          occupancy[rowIdx] = occupancy[rowIdx] ?? [];
          for (let cc = 0; cc < colspan; cc++) {
            occupancy[rowIdx][c + cc] = cell;
          }
        }
        if (r === 0) {
          const headerText = cellPlainText(cell);
          if ((WEEKLY_CLEAR_COLUMN_HEADERS as readonly string[]).includes(headerText)) {
            for (let cc = 0; cc < colspan; cc++) clearCols.add(c + cc);
          }
        }
        c += colspan;
      }
    }

    if (clearCols.size === 0) continue;

    const cleared = new Set<HTMLElement>();
    for (let r = 1; r < occupancy.length; r++) {
      const rowOcc = occupancy[r] ?? [];
      for (const col of clearCols) {
        const cell = rowOcc[col];
        if (!cell || cleared.has(cell)) continue;
        if (cell.tagName.toUpperCase() === 'TH' && (WEEKLY_CLEAR_COLUMN_HEADERS as readonly string[]).includes(cellPlainText(cell))) {
          continue;
        }
        cell.set_content('');
        cleared.add(cell);
      }
    }
  }
  return normalizeConfluenceStorageXhtml(root.toString());
}

function findPageByExactTitle(
  pages: ConfluencePageItem[],
  title: string,
  quarterPageId?: string,
): ConfluencePageItem | null {
  const want = title.trim();
  const matches = pages.filter((page) => (page.title ?? '').trim() === want);
  if (matches.length === 0) return null;
  if (quarterPageId) {
    const under = matches.find((page) =>
      (page.ancestors ?? []).some((ancestor) => (ancestor.id ?? '').trim() === quarterPageId),
    );
    if (under) return under;
  }
  return matches[0] ?? null;
}

/** 在全部后代中取标题为 yymmdd-yymmdd 的最新一周（按 end、再按 start 降序）。 */
export function pickLatestWeekPage(pages: ConfluencePageItem[]): ConfluencePageItem | null {
  const weeklyPages = listWeekPagesSortedAsc(pages);
  if (weeklyPages.length === 0) return null;
  return weeklyPages[weeklyPages.length - 1] ?? null;
}

function listWeekPagesSortedAsc(pages: ConfluencePageItem[]): ConfluencePageItem[] {
  const weeklyPages = pages
    .map((page) => ({ page, parsed: parseWeekRangeTitle(page.title ?? '') }))
    .filter((item): item is { page: ConfluencePageItem; parsed: { start: string; end: string } } => Boolean(item.parsed));
  weeklyPages.sort((a, b) => {
    const byStart = a.parsed.start.localeCompare(b.parsed.start);
    if (byStart !== 0) return byStart;
    return a.parsed.end.localeCompare(b.parsed.end);
  });
  return weeklyPages.map((item) => item.page);
}

function isAllowedSourceWeekYear(pageStartYyMmDd: string, now: Date, timeZone: string): boolean {
  const { y, m } = extractYmdInTz(now, timeZone);
  const yyNow = y % 100;
  const pageYy = Number(pageStartYyMmDd.slice(0, 2));
  if (pageYy === yyNow) return true;
  // 仅 Q1 允许用去年周页作源（跨年周）；Q2–Q4 禁止回落到更早年份，避免误建 25xxxx
  if (m <= 3) {
    const yyPrev = yyNow === 0 ? 99 : yyNow - 1;
    return pageYy === yyPrev;
  }
  return false;
}

/**
 * 选择复制用的源周：取同年（Q1 可含去年）中、严格早于「本周周一」的最新周页。
 * 用于创建「本周」页时作模板；排除本周自身与更早年份归档。
 */
export function resolveWeeklyReportSourcePage(
  pages: ConfluencePageItem[],
  timeZone: string,
  now: Date,
): ConfluencePageItem | null {
  const currentWeekTitle = formatWikiWeekRangeTitleInTimeZone(now, timeZone);
  const currentMonday = currentWeekTitle.slice(0, 6);
  const candidates = listWeekPagesSortedAsc(pages).filter((page) => {
    const parsed = parseWeekRangeTitle(page.title ?? '');
    if (!parsed) return false;
    if (!isAllowedSourceWeekYear(parsed.start, now, timeZone)) return false;
    return parsed.start < currentMonday;
  });
  return candidates[candidates.length - 1] ?? null;
}

export type NextWeeklyReportCreateTarget = {
  source: ConfluencePageItem;
  sourceWeekRange: string;
  /** 待创建的日历本周标题 */
  targetWeekTitle: string;
  /** @deprecated 同 targetWeekTitle，兼容旧字段名 */
  nextWeekTitle: string;
  /** 本周所属季度（周页应挂在此下） */
  quarterTitle: string;
  /** 当前日期所在季度 */
  currentQuarterTitle: string;
  currentWeekTitle: string;
  alreadyExists: boolean;
  /** 当前日期所在季度页是否缺失（须先建） */
  currentQuarterNeedsCreate: boolean;
  /** 本周所属季度页是否缺失 */
  quarterNeedsCreate: boolean;
  /**
   * 建周页之前须按序创建的季度标题：
   * 先「当前日期所在季度」，再「本周所属季度」（去重）。
   */
  quartersToCreateBeforeWeek: string[];
};

/**
 * 建周页前须创建的季度：先保证「当前日期所在季度」，再保证「本周所属季度」。
 */
export function resolveQuartersToCreateBeforeWeekPage(
  pages: ConfluencePageItem[],
  currentQuarterTitle: string,
  targetWeekQuarterTitle: string,
): string[] {
  const ordered = [currentQuarterTitle.trim(), targetWeekQuarterTitle.trim()].filter(Boolean);
  const result: string[] = [];
  for (const title of ordered) {
    if (result.includes(title)) continue;
    if (!findPageByExactTitle(pages, title)?.id) {
      result.push(title);
    }
  }
  return result;
}

/**
 * 「创建周报页面」目标：始终创建【日历本周】（相对 now）。
 * 当前日期所在季度不存在时，quartersToCreateBeforeWeek 会先包含该季度。
 */
export function resolveNextWeeklyReportCreateTarget(
  pages: ConfluencePageItem[],
  timeZone: string,
  now: Date = new Date(),
): NextWeeklyReportCreateTarget | null {
  const currentWeekTitle = formatWikiWeekRangeTitleInTimeZone(now, timeZone);
  const targetWeekTitle = currentWeekTitle;
  const currentQuarterTitle = formatCalendarQuarterTitleInTimeZone(now, timeZone);
  const quarterTitle = formatQuarterTitleForWikiWeekRange(targetWeekTitle, timeZone);
  if (!quarterTitle) return null;

  const source = resolveWeeklyReportSourcePage(pages, timeZone, now);
  if (!source) return null;
  const sourceWeekRange = (source.title ?? '').trim();
  if (!sourceWeekRange) return null;

  const existingTarget = findPageByExactTitle(pages, targetWeekTitle);
  const quartersToCreateBeforeWeek = resolveQuartersToCreateBeforeWeekPage(
    pages,
    currentQuarterTitle,
    quarterTitle,
  );
  const currentQuarterNeedsCreate = quartersToCreateBeforeWeek.includes(currentQuarterTitle);
  const quarterNeedsCreate = quartersToCreateBeforeWeek.includes(quarterTitle);

  return {
    source,
    sourceWeekRange,
    targetWeekTitle,
    nextWeekTitle: targetWeekTitle,
    quarterTitle,
    currentQuarterTitle,
    currentWeekTitle,
    alreadyExists: Boolean(existingTarget?.id),
    currentQuarterNeedsCreate,
    quarterNeedsCreate,
    quartersToCreateBeforeWeek,
  };
}

function resolveQuarterParentPageId(pages: ConfluencePageItem[], rootPageId: string): string {
  const quarter = pages.find((page) => Boolean(parseQuarterTitle(page.title ?? '')));
  const ancestors = quarter?.ancestors ?? [];
  if (ancestors.length > 0) {
    const parentId = (ancestors[ancestors.length - 1]?.id ?? '').trim();
    if (parentId) return parentId;
  }
  return rootPageId;
}

async function fetchContentWithBodyAndSpace(baseUrl: string, pageId: string): Promise<ConfluenceContentResponse> {
  const expand = encodeURIComponent('body.storage,body.view,space,version');
  const url = `${baseUrl}/rest/api/content/${encodeURIComponent(pageId)}?expand=${expand}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: getWikiAuthHeaders(),
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Wiki 拉取页面失败(${response.status}): ${bodyText || response.statusText}`);
  }
  return (await response.json()) as ConfluenceContentResponse;
}

async function createConfluencePage(params: {
  baseUrl: string;
  spaceKey: string;
  parentId: string;
  title: string;
  bodyStorage: string;
}): Promise<ConfluenceContentResponse> {
  const response = await fetch(`${params.baseUrl}/rest/api/content`, {
    method: 'POST',
    headers: {
      ...getWikiAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'page',
      title: params.title,
      space: { key: params.spaceKey },
      ancestors: [{ id: params.parentId }],
      body: {
        storage: {
          value: params.bodyStorage,
          representation: 'storage',
        },
      },
    }),
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Wiki 创建页面失败(${response.status}): ${bodyText || response.statusText}`);
  }
  return (await response.json()) as ConfluenceContentResponse;
}

/**
 * 创建日历「本周」周报 wiki 页：相对当前日期计算本周标题；已存在则跳过。
 * 源周取严格早于本周的同年近周。目标季度不存在时先建季度页，再挂周页。
 * 仅写入 body.storage，不复制评论。
 */
export async function createNextWeeklyReportPage(): Promise<CreateWeeklyReportPageResult> {
  const baseUrl = normalizeBaseUrl(config.wiki.baseUrl);
  const rootPageId = config.wiki.weeklyRootPageId.trim() || '405143687';
  const timeZone = config.jira.weeklyReportTimeZone.trim() || 'Asia/Shanghai';

  if (!config.wiki.token.trim()) {
    return {
      success: false,
      skipped: false,
      error: 'Wiki 认证信息缺失：请在 .env 中配置 WIKI_TOKEN（并按需配置 WIKI_AUTH_SCHEME）。',
    };
  }

  let sourceWeekRangeHint = '';
  let nextWeekRangeHint = '';

  try {
    const allDescendants = await fetchAllDescendantPages(baseUrl, rootPageId);
    const target = resolveNextWeeklyReportCreateTarget(allDescendants, timeZone, new Date());
    if (!target) {
      return {
        success: false,
        skipped: false,
        error: '未找到可用的源周报页，或无法推算日历本周/季度标题。',
      };
    }
    const sourcePageId = (target.source.id ?? '').trim();
    const sourceWeekRange = target.sourceWeekRange.trim();
    const targetWeekTitle = (target.targetWeekTitle || target.nextWeekTitle).trim();
    const quarterTitleFromTarget = target.quarterTitle.trim();
    sourceWeekRangeHint = sourceWeekRange;
    nextWeekRangeHint = targetWeekTitle;
    if (!sourcePageId || !sourceWeekRange || !targetWeekTitle || !quarterTitleFromTarget) {
      return {
        success: false,
        skipped: false,
        error: '未找到可用的源周报页，或无法推算日历本周/季度标题。',
      };
    }

    if (target.alreadyExists) {
      const existing = findPageByExactTitle(allDescendants, targetWeekTitle);
      const webui = (existing?._links?.webui ?? '').trim();
      return {
        success: true,
        skipped: true,
        message: `日历本周报页「${targetWeekTitle}」已存在，未做任何修改。`,
        sourceWeekRange,
        nextWeekRange: targetWeekTitle,
        quarter: quarterTitleFromTarget,
        pageId: existing?.id?.trim(),
        pageTitle: (existing?.title ?? targetWeekTitle).trim(),
        targetUrl: webui ? toAbsoluteWikiUrl(baseUrl, webui) : undefined,
      };
    }

    const quarterTitle = quarterTitleFromTarget;

    const sourceContent = await fetchContentWithBodyAndSpace(baseUrl, sourcePageId);
    const rawBody = (sourceContent.body?.storage?.value ?? sourceContent.body?.view?.value ?? '').trim();
    if (!rawBody) {
      return {
        success: false,
        skipped: false,
        error: `源周报页「${sourceWeekRange}」正文为空，无法创建本周页。`,
        sourceWeekRange,
        nextWeekRange: targetWeekTitle,
        quarter: quarterTitle,
      };
    }

    const spaceKey = (sourceContent.space?.key ?? '').trim();
    if (!spaceKey) {
      return {
        success: false,
        skipped: false,
        error: '无法从源页面解析 Confluence space.key，创建失败。',
        sourceWeekRange,
        nextWeekRange: targetWeekTitle,
        quarter: quarterTitle,
      };
    }

    let quarterPage = findPageByExactTitle(allDescendants, quarterTitle);
    let quarterCreated = false;
    const quartersToCreate = target.quartersToCreateBeforeWeek.length
      ? target.quartersToCreateBeforeWeek
      : quarterPage?.id
        ? []
        : [quarterTitle];

    for (const qTitle of quartersToCreate) {
      const existing = findPageByExactTitle(allDescendants, qTitle);
      if (existing?.id) {
        if (qTitle === quarterTitle) quarterPage = existing;
        continue;
      }
      const quarterParentId = resolveQuarterParentPageId(allDescendants, rootPageId);
      const createdQuarter = await createConfluencePage({
        baseUrl,
        spaceKey,
        parentId: quarterParentId,
        title: qTitle,
        bodyStorage: '<p></p>',
      });
      const createdItem: ConfluencePageItem = {
        id: createdQuarter.id,
        title: createdQuarter.title ?? qTitle,
        _links: createdQuarter._links,
      };
      allDescendants.push(createdItem);
      if (qTitle === quarterTitle) {
        quarterPage = createdItem;
      }
      quarterCreated = true;
    }

    if (!quarterPage?.id) {
      quarterPage = findPageByExactTitle(allDescendants, quarterTitle);
    }

    const quarterId = (quarterPage?.id ?? '').trim();
    if (!quarterId) {
      return {
        success: false,
        skipped: false,
        error: `季度页「${quarterTitle}」创建后仍无 pageId。`,
        sourceWeekRange,
        nextWeekRange: targetWeekTitle,
        quarter: quarterTitle,
        quarterCreated,
      };
    }

    const clearedBody = clearWeeklyReportWorkPlanColumns(rawBody);
    const created = await createConfluencePage({
      baseUrl,
      spaceKey,
      parentId: quarterId,
      title: targetWeekTitle,
      bodyStorage: clearedBody,
    });

    const createdId = (created.id ?? '').trim();
    const webui = (created._links?.webui ?? '').trim();
    const targetUrl = webui
      ? toAbsoluteWikiUrl(baseUrl, webui)
      : createdId
        ? `${baseUrl}/pages/viewpage.action?pageId=${encodeURIComponent(createdId)}`
        : undefined;

    if (targetUrl) {
      await browserOpen(targetUrl);
    }

    const quarterHint =
      quartersToCreate.length > 0 && quarterCreated
        ? `；并已按序新建季度页 ${quartersToCreate.map((q) => `「${q}」`).join('、')}`
        : '';
    return {
      success: true,
      skipped: false,
      message: `已创建日历本周报页「${targetWeekTitle}」（复制自「${sourceWeekRange}」，已清空本周工作/下周计划；未复制评论）${quarterHint}。`,
      sourceWeekRange,
      nextWeekRange: targetWeekTitle,
      quarter: quarterTitle,
      quarterCreated,
      pageId: createdId || undefined,
      pageTitle: (created.title ?? targetWeekTitle).trim(),
      targetUrl,
    };
  } catch (err) {
    return {
      success: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
      sourceWeekRange: sourceWeekRangeHint || undefined,
      nextWeekRange: nextWeekRangeHint || undefined,
    };
  }
}
