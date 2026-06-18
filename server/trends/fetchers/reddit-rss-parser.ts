/* AI 生成 By Peng.Guo */
import type { RawTrendItem, TrendSource } from '../trends-types.js';

export type RedditRssEntry = {
  title: string;
  url: string;
  summary?: string;
};

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

function stripHtml(html: string): string {
  return decodeXmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function pickEntryLink(entryXml: string): string {
  const links = [...entryXml.matchAll(/<link\b([^>]*)\/?>/gi)];
  for (const match of links) {
    const attrs = match[1] ?? '';
    const href = attrs.match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    const rel = attrs.match(/\brel="([^"]+)"/i)?.[1]?.toLowerCase();
    if (!rel || rel === 'alternate') return href;
  }
  return links[0]?.[1]?.match(/\bhref="([^"]+)"/i)?.[1] ?? '';
}

function pickEntryTitle(entryXml: string): string {
  const m = entryXml.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
  return m?.[1] ? decodeXmlEntities(m[1]) : '';
}

function pickEntrySummary(entryXml: string): string | undefined {
  const content = entryXml.match(/<content(?:\s[^>]*)?>([\s\S]*?)<\/content>/i)?.[1];
  if (content) return stripHtml(content).slice(0, 500);
  const summary = entryXml.match(/<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i)?.[1];
  if (summary) return stripHtml(summary).slice(0, 500);
  return undefined;
}

/** 解析 Reddit Atom RSS（/top/.rss） */
export function parseRedditRssFeed(xml: string, limit: number): RedditRssEntry[] {
  const entries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  const items: RedditRssEntry[] = [];
  for (const match of entries) {
    if (items.length >= limit) break;
    const entryXml = match[0] ?? '';
    const title = pickEntryTitle(entryXml);
    const url = pickEntryLink(entryXml);
    if (!title || !url) continue;
    items.push({ title, url, summary: pickEntrySummary(entryXml) });
  }
  return items;
}

export function mapRssEntriesToTrendItems(
  entries: RedditRssEntry[],
  source: TrendSource,
  parseGithubRepoFullName: (url: string) => string | undefined
): RawTrendItem[] {
  const fetchedAt = new Date().toISOString();
  return entries.map((entry) => ({
    source,
    title: entry.title,
    url: entry.url,
    summary: entry.summary,
    repoFullName: parseGithubRepoFullName(entry.url),
    fetchedAt,
  }));
}
