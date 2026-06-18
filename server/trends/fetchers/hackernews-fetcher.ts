/* AI 生成 By Peng.Guo */
import { config } from '../../../config/default.js';
import { proxyFetch } from '../../http/proxy-fetch.js';
import { parseGithubRepoFullName } from './github-trending-fetcher.js';
import type { RawTrendItem } from '../trends-types.js';

const HN_BASE = 'https://hacker-news.firebaseio.com/v0';

type HnItem = {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  text?: string;
};

async function fetchHnItem(id: number, signal?: AbortSignal): Promise<HnItem | null> {
  const res = await proxyFetch(`${HN_BASE}/item/${id}.json`, { signal });
  if (!res.ok) return null;
  return (await res.json()) as HnItem;
}

export async function fetchHackerNewsTop(signal?: AbortSignal): Promise<RawTrendItem[]> {
  const limit = config.techDigest.hnLimit;
  const timeoutMs = config.techDigest.fetchTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const listRes = await proxyFetch(`${HN_BASE}/topstories.json`, { signal: controller.signal });
    if (!listRes.ok) throw new Error(`HN topstories HTTP ${listRes.status}`);
    const ids = (await listRes.json()) as number[];
    const topIds = ids.slice(0, limit);
    const fetchedAt = new Date().toISOString();
    const items: RawTrendItem[] = [];

    for (const id of topIds) {
      const item = await fetchHnItem(id, controller.signal);
      if (!item?.title) continue;
      const url = item.url?.trim() || `https://news.ycombinator.com/item?id=${id}`;
      const summary = item.text?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
      items.push({
        source: 'hackernews',
        title: item.title.trim(),
        url,
        score: item.score,
        repoFullName: parseGithubRepoFullName(url),
        summary,
        fetchedAt,
      });
    }

    return items;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
