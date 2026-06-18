/* AI 生成 By Peng.Guo */
import { parse } from 'node-html-parser';
import { config } from '../../../config/default.js';
import { proxyFetch } from '../../http/proxy-fetch.js';
import type { RawTrendItem } from '../trends-types.js';

const GITHUB_REPO_RE = /github\.com\/([^/]+\/[^/#?]+)/i;

export function parseGithubRepoFullName(url: string): string | undefined {
  const m = url.match(GITHUB_REPO_RE);
  if (!m?.[1]) return undefined;
  return m[1].replace(/\.git$/i, '').toLowerCase();
}

export async function fetchGithubTrending(
  since: 'daily' | 'weekly' | 'monthly' = 'daily',
  signal?: AbortSignal
): Promise<RawTrendItem[]> {
  const limit = config.techDigest.githubLimit;
  const timeoutMs = config.techDigest.fetchTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await proxyFetch(`https://github.com/trending?since=${since}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ai-dev-control-center/0.1',
        Accept: 'text/html',
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub Trending (${since}) HTTP ${res.status}`);
    }
    const html = await res.text();
    const root = parse(html);
    const articles = root.querySelectorAll('article.Box-row');
    const fetchedAt = new Date().toISOString();
    const items: RawTrendItem[] = [];

    for (const article of articles) {
      if (items.length >= limit) break;
      const titleLink = article.querySelector('h2 a');
      const href = titleLink?.getAttribute('href')?.trim();
      if (!href) continue;
      const repoFullName = href.replace(/^\//, '').trim();
      const title = repoFullName || titleLink?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const desc = article.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim();
      const starText = article.querySelector('span.d-inline-block.float-sm-right')?.textContent ?? '';
      const starMatch = starText.match(/([\d,]+)\s+stars?\s+(?:today|this week|this month)/i);
      const score = starMatch ? Number(starMatch[1].replace(/,/g, '')) : undefined;
      const url = `https://github.com/${repoFullName}`;

      items.push({
        source: 'github',
        title,
        url,
        score: Number.isFinite(score) ? score : undefined,
        repoFullName: repoFullName.toLowerCase(),
        summary: desc,
        fetchedAt,
      });
    }

    return items;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
