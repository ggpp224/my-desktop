/* AI 生成 By Peng.Guo */
import type { RawTrendItem, TrendSource } from './trends-types.js';

const KEYWORDS = [
  'agent',
  'mcp',
  'runtime',
  'workflow',
  'ide',
  'coding agent',
  'cursor',
  'copilot',
  'llm',
  'tool calling',
  'orchestrat',
  'model context protocol',
  'code assistant',
  'devin',
  'claude code',
  'aider',
  'continue.dev',
  'windsurf',
  'cline',
  'roo code',
];

function haystack(item: RawTrendItem): string {
  return [item.title, item.summary ?? '', item.url, item.repoFullName ?? ''].join(' ').toLowerCase();
}

export function matchesTechDigestKeywords(item: RawTrendItem): boolean {
  if (item.source === 'github') return true;
  const text = haystack(item);
  return KEYWORDS.some((kw) => text.includes(kw));
}

export function filterByKeywords(items: RawTrendItem[]): RawTrendItem[] {
  return items.filter(matchesTechDigestKeywords);
}

export function normalizeItemUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    u.search = '';
    let path = u.pathname.replace(/\/+$/, '');
    if (u.hostname === 'github.com' && path.endsWith('.git')) {
      path = path.slice(0, -4);
    }
    return `${u.hostname}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function dedupeRawItems(items: RawTrendItem[]): RawTrendItem[] {
  const map = new Map<string, RawTrendItem>();

  for (const item of items) {
    const key = item.repoFullName?.toLowerCase() || normalizeItemUrl(item.url);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item });
      continue;
    }
    const bestScore = Math.max(existing.score ?? 0, item.score ?? 0);
    map.set(key, {
      ...existing,
      title: existing.title.length >= item.title.length ? existing.title : item.title,
      url: existing.repoFullName ? existing.url : item.url || existing.url,
      score: bestScore > 0 ? bestScore : undefined,
      summary: existing.summary || item.summary,
      repoFullName: existing.repoFullName || item.repoFullName,
    });
  }

  return Array.from(map.values());
}

export function groupSources(items: RawTrendItem[]): Map<string, TrendSource[]> {
  const groups = new Map<string, TrendSource[]>();
  for (const item of items) {
    const key = item.repoFullName?.toLowerCase() || normalizeItemUrl(item.url);
    const list = groups.get(key) ?? [];
    if (!list.includes(item.source)) list.push(item.source);
    groups.set(key, list);
  }
  return groups;
}

export function buildDedupedItems(items: RawTrendItem[]): Array<RawTrendItem & { sources: TrendSource[] }> {
  const sourceGroups = groupSources(items);
  const deduped = dedupeRawItems(items);
  return deduped.map((item) => {
    const key = item.repoFullName?.toLowerCase() || normalizeItemUrl(item.url);
    return { ...item, sources: sourceGroups.get(key) ?? [item.source] };
  });
}
