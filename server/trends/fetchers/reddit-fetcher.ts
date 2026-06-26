/* AI 生成 By Peng.Guo */
import { config } from '../../../config/default.js';
import { proxyFetch } from '../../http/proxy-fetch.js';
import { parseGithubRepoFullName } from './github-trending-fetcher.js';
import { mapRssEntriesToTrendItems, parseRedditRssFeed } from './reddit-rss-parser.js';
import { markRedditRateLimited, scheduleRedditFetch } from './reddit-request-gate.js';
import type { RawTrendItem, TrendSource } from '../trends-types.js';

export type RedditTopWindow = 'day' | 'month' | 'year';

type RedditListing = {
  data?: {
    children?: Array<{
      data?: {
        title?: string;
        url?: string;
        permalink?: string;
        score?: number;
        selftext?: string;
      };
    }>;
  };
};

let cachedOAuthToken: { token: string; expiresAtMs: number } | null = null;

function redditUserAgent(): string {
  const fromEnv = config.techDigest.redditUserAgent.trim();
  if (fromEnv) return fromEnv;
  return 'desktop:ai-dev-control-center:0.1.4 (by /u/chanjet-dev)';
}

function redditHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'User-Agent': redditUserAgent(),
    Accept: 'application/json, application/atom+xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    ...extra,
  };
}

function redditFetchSignal(outer?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(config.techDigest.redditFetchTimeoutMs);
  return outer ? AbortSignal.any([outer, timeout]) : timeout;
}

type OAuthTokenResult = { ok: true; token: string } | { ok: false; reason: string };

async function getRedditOAuthToken(signal?: AbortSignal): Promise<OAuthTokenResult> {
  const clientId = config.techDigest.redditClientId;
  const clientSecret = config.techDigest.redditClientSecret;
  if (!clientId || !clientSecret) {
    return { ok: false, reason: '未配置 REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET' };
  }

  if (cachedOAuthToken && cachedOAuthToken.expiresAtMs > Date.now() + 60_000) {
    return { ok: true, token: cachedOAuthToken.token };
  }

  return scheduleRedditFetch(async () => {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await proxyFetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      signal,
      headers: redditHeaders({
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      return { ok: false, reason: `OAuth token HTTP ${res.status}` } satisfies OAuthTokenResult;
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    const token = json.access_token?.trim();
    if (!token) {
      return { ok: false, reason: 'OAuth token 响应缺少 access_token' } satisfies OAuthTokenResult;
    }
    const expiresInSec = Number(json.expires_in) || 3600;
    cachedOAuthToken = { token, expiresAtMs: Date.now() + expiresInSec * 1000 };
    return { ok: true, token } satisfies OAuthTokenResult;
  });
}

function mapJsonListing(json: RedditListing, source: TrendSource): RawTrendItem[] {
  const fetchedAt = new Date().toISOString();
  const children = json.data?.children ?? [];
  return children
    .map((child) => child.data)
    .filter((d): d is NonNullable<typeof d> => Boolean(d?.title))
    .map((d) => {
      const postUrl = d.url?.trim() || `https://www.reddit.com${d.permalink ?? ''}`;
      const summary = d.selftext?.replace(/\s+/g, ' ').trim().slice(0, 500);
      return {
        source,
        title: String(d.title).trim(),
        url: postUrl,
        score: d.score,
        repoFullName: parseGithubRepoFullName(postUrl),
        summary,
        fetchedAt,
      } satisfies RawTrendItem;
    });
}

type JsonFetchResult =
  | { ok: true; items: RawTrendItem[] }
  | { ok: false; reason: string };

async function fetchSubredditJson(
  subreddit: string,
  source: TrendSource,
  window: RedditTopWindow,
  signal?: AbortSignal
): Promise<JsonFetchResult> {
  const limit = config.techDigest.redditLimit;
  const tokenResult = await getRedditOAuthToken(signal);
  if (!tokenResult.ok) return { ok: false, reason: tokenResult.reason };

  return scheduleRedditFetch(async () => {
    const url = `https://oauth.reddit.com/r/${subreddit}/top.json?t=${window}&limit=${limit}&raw_json=1`;
    const res = await proxyFetch(url, {
      signal,
      headers: redditHeaders({ Authorization: `Bearer ${tokenResult.token}` }),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      markRedditRateLimited(Number.isFinite(retryAfter) ? retryAfter : undefined);
      return { ok: false, reason: 'OAuth API HTTP 429（限流）' } satisfies JsonFetchResult;
    }
    if (!res.ok) {
      return { ok: false, reason: `OAuth API HTTP ${res.status}` } satisfies JsonFetchResult;
    }
    const json = (await res.json()) as RedditListing;
    const items = mapJsonListing(json, source);
    if (items.length === 0) {
      return { ok: false, reason: 'OAuth API 返回空列表' } satisfies JsonFetchResult;
    }
    return { ok: true, items } satisfies JsonFetchResult;
  });
}

async function fetchSubredditRss(
  subreddit: string,
  source: TrendSource,
  window: RedditTopWindow,
  signal?: AbortSignal,
  onProgress?: (message: string) => void
): Promise<RawTrendItem[]> {
  const limit = config.techDigest.redditLimit;
  const fetchSignal = redditFetchSignal(signal);
  const url = `https://www.reddit.com/r/${subreddit}/top/.rss?t=${window}&limit=${limit}`;
  let lastStatus = 0;
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    onProgress?.(
      attempt === 0
        ? `Reddit r/${subreddit} RSS 请求中…`
        : `Reddit r/${subreddit} RSS 第 ${attempt + 1}/${maxAttempts} 次重试…`
    );
    const items = await scheduleRedditFetch(async () => {
      const res = await proxyFetch(url, {
        signal: fetchSignal,
        headers: redditHeaders({ Accept: 'application/atom+xml, text/xml, */*' }),
      });
      lastStatus = res.status;
      if (res.status === 429 || res.status === 403) {
        const retryAfter = Number(res.headers.get('retry-after'));
        markRedditRateLimited(Number.isFinite(retryAfter) ? retryAfter : undefined);
        onProgress?.(`Reddit r/${subreddit} RSS HTTP ${res.status}，等待冷却后重试…`);
        return null;
      }
      if (!res.ok) return null;
      const xml = await res.text();
      const entries = parseRedditRssFeed(xml, limit);
      if (entries.length === 0) return null;
      return mapRssEntriesToTrendItems(entries, source, parseGithubRepoFullName);
    });
    if (items) {
      onProgress?.(`Reddit r/${subreddit} 抓取完成（${items.length} 条）`);
      return items;
    }
  }

  const oauthHint =
    config.techDigest.redditClientId && config.techDigest.redditClientSecret
      ? 'OAuth 已配置但 RSS 兜底仍失败，请稍后重试'
      : '请配置 REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET 走 OAuth，或稍后重试';
  throw new Error(`Reddit r/${subreddit} RSS HTTP ${lastStatus}（可能被限流；${oauthHint}）`);
}

async function fetchSubredditTop(
  subreddit: string,
  source: TrendSource,
  window: RedditTopWindow,
  signal?: AbortSignal,
  onProgress?: (message: string) => void
): Promise<RawTrendItem[]> {
  const fetchSignal = redditFetchSignal(signal);
  const hasOAuth = Boolean(config.techDigest.redditClientId && config.techDigest.redditClientSecret);
  if (hasOAuth) {
    onProgress?.(`Reddit r/${subreddit} OAuth API 请求中…`);
  }
  const jsonResult = hasOAuth
    ? await fetchSubredditJson(subreddit, source, window, fetchSignal)
    : ({ ok: false, reason: '未配置 REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET' } satisfies JsonFetchResult);

  if (jsonResult.ok) {
    onProgress?.(`Reddit r/${subreddit} OAuth 抓取完成（${jsonResult.items.length} 条）`);
    return jsonResult.items;
  }
  if (hasOAuth) {
    onProgress?.(`Reddit r/${subreddit} OAuth 失败（${jsonResult.reason}），改用 RSS…`);
  }

  try {
    return await fetchSubredditRss(subreddit, source, window, fetchSignal, onProgress);
  } catch (rssErr) {
    const rssMsg = rssErr instanceof Error ? rssErr.message : String(rssErr);
    throw new Error(`${rssMsg}；OAuth 路径：${jsonResult.reason}`);
  }
}

export async function fetchRedditLocalLlama(
  window: RedditTopWindow = 'day',
  signal?: AbortSignal,
  onProgress?: (message: string) => void
): Promise<RawTrendItem[]> {
  return fetchSubredditTop('LocalLLaMA', 'reddit_localllama', window, signal, onProgress);
}

export async function fetchRedditOpenAI(
  window: RedditTopWindow = 'day',
  signal?: AbortSignal,
  onProgress?: (message: string) => void
): Promise<RawTrendItem[]> {
  return fetchSubredditTop('OpenAI', 'reddit_openai', window, signal, onProgress);
}
