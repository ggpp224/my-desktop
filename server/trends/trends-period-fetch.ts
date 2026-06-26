/* AI 生成 By Peng.Guo */
import type { RedditTopWindow } from './fetchers/reddit-fetcher.js';
import { fetchGithubTrending } from './fetchers/github-trending-fetcher.js';
import { fetchHackerNewsTop } from './fetchers/hackernews-fetcher.js';
import { fetchRedditLocalLlama, fetchRedditOpenAI } from './fetchers/reddit-fetcher.js';
import { resetRedditRequestGate } from './fetchers/reddit-request-gate.js';
import { filterRawByKeywords } from './trends-period-rankings.js';
import type { RawTrendItem, TechDigestProgressHooks, TechDigestScope } from './trends-types.js';

const PERIOD_GITHUB_SINCE: Record<TechDigestScope, 'daily' | 'monthly'> = {
  daily: 'daily',
  monthly: 'monthly',
  halfYear: 'monthly',
};

const PERIOD_REDDIT_WINDOW: Record<TechDigestScope, RedditTopWindow> = {
  daily: 'day',
  monthly: 'month',
  halfYear: 'year',
};

const PERIOD_LABEL: Record<TechDigestScope, string> = {
  daily: '今日',
  monthly: '本月',
  halfYear: '半年度',
};

async function safeFetch(
  label: string,
  fn: () => Promise<RawTrendItem[]>,
  warnings: string[],
  hooks?: TechDigestProgressHooks
): Promise<RawTrendItem[]> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`${label} 抓取失败：${msg}`);
    hooks?.onProgress?.(`${label} 抓取失败：${msg}`);
    return [];
  }
}

export async function fetchRawForSinglePeriod(
  period: TechDigestScope,
  warnings: string[],
  hooks?: TechDigestProgressHooks,
  signal?: AbortSignal
): Promise<{ raw: RawTrendItem[]; filtered: RawTrendItem[] }> {
  resetRedditRequestGate();

  const label = PERIOD_LABEL[period];
  const githubSince = PERIOD_GITHUB_SINCE[period];
  const redditWindow = PERIOD_REDDIT_WINDOW[period];

  hooks?.onProgress?.(`[${label}] 抓取 GitHub Trending`);
  const github = await safeFetch(
    `${label} GitHub Trending`,
    () => fetchGithubTrending(githubSince, signal),
    warnings,
    hooks
  );

  let hn: RawTrendItem[] = [];
  if (period === 'daily') {
    hooks?.onProgress?.(`[${label}] 抓取 Hacker News`);
    hn = await safeFetch(`${label} Hacker News`, () => fetchHackerNewsTop(signal), warnings, hooks);
  }

  hooks?.onProgress?.(`[${label}] 抓取 Reddit r/LocalLLaMA`);
  const redditLlama = await safeFetch(
    `${label} Reddit r/LocalLLaMA`,
    () =>
      fetchRedditLocalLlama(redditWindow, signal, (msg) => hooks?.onProgress?.(`[${label}] ${msg}`)),
    warnings,
    hooks
  );

  hooks?.onProgress?.(`[${label}] 抓取 Reddit r/OpenAI`);
  const redditOpenai = await safeFetch(
    `${label} Reddit r/OpenAI`,
    () =>
      fetchRedditOpenAI(redditWindow, signal, (msg) => hooks?.onProgress?.(`[${label}] ${msg}`)),
    warnings,
    hooks
  );

  const raw = [...github, ...hn, ...redditLlama, ...redditOpenai].map((item) => ({ ...item, period }));
  if (raw.length === 0) {
    throw new Error(`${label} 所有数据源均抓取失败。${warnings.join('；')}`);
  }

  hooks?.onProgress?.(`[${label}] 关键词筛选`);
  const filtered = filterRawByKeywords(raw);

  resetRedditRequestGate();
  return { raw, filtered };
}
