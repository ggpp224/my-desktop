/* AI 生成 By Peng.Guo */
import { filterByKeywords, normalizeItemUrl } from './trends-keyword-filter.js';
import type { AnalyzedProject, PeriodTop20Rankings, RawTrendItem, TechDigestScope } from './trends-types.js';

const TOP_N = 20;

function itemKey(item: RawTrendItem): string {
  return item.repoFullName?.toLowerCase() || normalizeItemUrl(item.url);
}

function projectMapById(projects: AnalyzedProject[]): Map<string, AnalyzedProject> {
  return new Map(projects.map((p) => [p.id, p]));
}

/** 按原始热度（score）排序 TOP20 */
export function computeTopHot20(filtered: RawTrendItem[]): string[] {
  const sorted = [...filtered].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of sorted) {
    const id = itemKey(item);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= TOP_N) break;
  }
  return ids;
}

/** 周期内条目 ∩ 已分析项目，按相关度 TOP20 */
export function computeTopFollow20(filtered: RawTrendItem[], projects: AnalyzedProject[]): string[] {
  const pmap = projectMapById(projects);
  const periodIds = new Set(filtered.map(itemKey));
  return [...periodIds]
    .map((id) => pmap.get(id))
    .filter((p): p is AnalyzedProject => Boolean(p))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, TOP_N)
    .map((p) => p.id);
}

/** 周期内值得研究源码 TOP20 */
export function computeTopSourceStudy20(filtered: RawTrendItem[], projects: AnalyzedProject[]): string[] {
  const pmap = projectMapById(projects);
  const periodIds = new Set(filtered.map(itemKey));
  return [...periodIds]
    .map((id) => pmap.get(id))
    .filter((p): p is AnalyzedProject => Boolean(p && p.worthStudying))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, TOP_N)
    .map((p) => p.id);
}

export function buildPeriodRankings(
  filteredByPeriod: Record<TechDigestScope, RawTrendItem[]>,
  projects: AnalyzedProject[]
): Record<TechDigestScope, PeriodTop20Rankings> {
  const periods: TechDigestScope[] = ['daily', 'monthly', 'halfYear'];
  const result = {} as Record<TechDigestScope, PeriodTop20Rankings>;
  for (const period of periods) {
    const filtered = filteredByPeriod[period] ?? [];
    result[period] = {
      topFollow: computeTopFollow20(filtered, projects),
      topSourceStudy: computeTopSourceStudy20(filtered, projects),
      topHot: computeTopHot20(filtered),
    };
  }
  return result;
}

/** 合并各周期筛选结果，供 LLM 一次性分析（去重由 analyzeTrendItems 内部完成） */
export function mergeFilteredAcrossPeriods(
  filteredByPeriod: Record<TechDigestScope, RawTrendItem[]>
): RawTrendItem[] {
  const periods: TechDigestScope[] = ['daily', 'monthly', 'halfYear'];
  return periods.flatMap((period) => filteredByPeriod[period] ?? []);
}

export function filterRawByKeywords(items: RawTrendItem[]): RawTrendItem[] {
  return filterByKeywords(items);
}
