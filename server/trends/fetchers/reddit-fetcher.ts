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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRedditOAuthToken(signal?: AbortSignal): Promise<string | null> {
  const clientId = config.techDigest.redditClientId;
  const clientSecret = config.techDigest.redditClientSecret;
  if (!clientId || !clientSecret) return null;

  if (cachedOAuthToken && cachedOAuthToken.expiresAtMs > Date.now() + 60_000) {
    return cachedOAuthToken.token;
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
    if (!res.ok) return null;

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    const token = json.access_token?.trim();
    if (!token) return null;
    const expiresInSec = Number(json.expires_in) || 3600;
    cachedOAuthToken = { token, expiresAtMs: Date.now() + expiresInSec * 1000 };
    return token;
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

async function fetchSubredditJson(
  subreddit: string,
  source: TrendSource,
  window: RedditTopWindow,
  signal?: AbortSignal
): Promise<RawTrendItem[] | null> {
  const limit = config.techDigest.redditLimit;
  const token = await getRedditOAuthToken(signal);
  if (!token) return null;

  return scheduleRedditFetch(async () => {
    const url = `https://oauth.reddit.com/r/${subreddit}/top.json?t=${window}&limit=${limit}&raw_json=1`;
    const res = await proxyFetch(url, {
      signal,
      headers: redditHeaders({ Authorization: `Bearer ${token}` }),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      markRedditRateLimited(Number.isFinite(retryAfter) ? retryAfter : undefined);
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as RedditListing;
    return mapJsonListing(json, source);
  });
}

async function fetchSubredditRss(
  subreddit: string,
  source: TrendSource,
  window: RedditTopWindow,
  signal?: AbortSignal
): Promise<RawTrendItem[]> {
  const limit = config.techDigest.redditLimit;
  const hosts = ['https://www.reddit.com', 'https://old.reddit.com'];
  let lastStatus = 0;

  return scheduleRedditFetch(async () => {
    for (const host of hosts) {
      const url = `${host}/r/${subreddit}/top/.rss?t=${window}&limit=${limit}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          await sleep(Math.min(60_000, config.techDigest.reddit429CooldownMs * attempt));
        }
        const res = await proxyFetch(url, {
          signal,
          headers: redditHeaders({ Accept: 'application/atom+xml, text/xml, */*' }),
        });
        lastStatus = res.status;
        if (res.status === 429 || res.status === 403) {
          const retryAfter = Number(res.headers.get('retry-after'));
          markRedditRateLimited(Number.isFinite(retryAfter) ? retryAfter : undefined);
          continue;
        }
        if (!res.ok) continue;
        const xml = await res.text();
        const entries = parseRedditRssFeed(xml, limit);
        if (entries.length === 0) continue;
        return mapRssEntriesToTrendItems(entries, source, parseGithubRepoFullName);
      }
    }

    throw new Error(
      `Reddit r/${subreddit} RSS HTTP ${lastStatus}（可能被限流；请稍后重试，或配置 REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET 走 OAuth）`
    );
  });
}

async function fetchSubredditTop(
  subreddit: string,
  source: TrendSource,
  window: RedditTopWindow,
  signal?: AbortSignal
): Promise<RawTrendItem[]> {
  const hasOAuth = Boolean(config.techDigest.redditClientId && config.techDigest.redditClientSecret);
  if (hasOAuth) {
    const jsonItems = await fetchSubredditJson(subreddit, source, window, signal);
    if (jsonItems && jsonItems.length > 0) return jsonItems;
  }
  return fetchSubredditRss(subreddit, source, window, signal);
}

export async function fetchRedditLocalLlama(
  window: RedditTopWindow = 'day',
  signal?: AbortSignal
): Promise<RawTrendItem[]> {
  return fetchSubredditTop('LocalLLaMA', 'reddit_localllama', window, signal);
}

export async function fetchRedditOpenAI(
  window: RedditTopWindow = 'day',
  signal?: AbortSignal
): Promise<RawTrendItem[]> {
  return fetchSubredditTop('OpenAI', 'reddit_openai', window, signal);
}
