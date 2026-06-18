/* AI 生成 By Peng.Guo */
import type { AgentLlmOptions } from '../../agent/agent.js';
import {
  analyzeTrendItemsForScope,
  buildDailyReportMarkdown,
  buildLongTermReportMarkdown,
  resolveLlmModelLabel,
} from './trends-analyzer.js';
import { fetchRawForSinglePeriod } from './trends-period-fetch.js';
import { buildPeriodRankings } from './trends-period-rankings.js';
import { saveDigest } from './trends-repository.js';
import type { RawTrendItem, TechDigestProgressHooks, TechDigestReport, TechDigestScope, TrendSource } from './trends-types.js';
import { EMPTY_RAW_COUNTS } from './trends-types.js';

function countBySource(items: RawTrendItem[]): Record<TrendSource, number> {
  const counts = { ...EMPTY_RAW_COUNTS };
  for (const item of items) {
    counts[item.source] = (counts[item.source] ?? 0) + 1;
  }
  return counts;
}

function appendWarnings(reportMarkdown: string, warnings: string[]): string {
  if (warnings.length === 0) return reportMarkdown;
  return `> **数据源提示**：${warnings.join('；')}\n\n${reportMarkdown}`;
}

export async function runTechDigestRefreshForPeriod(
  scope: TechDigestScope,
  llm: AgentLlmOptions | undefined,
  hooks?: TechDigestProgressHooks
): Promise<TechDigestReport> {
  const warnings: string[] = [];
  const signal = hooks?.signal;

  const { raw, filtered } = await fetchRawForSinglePeriod(scope, warnings, hooks, signal);

  const periodFiltered = { [scope]: filtered } as Record<TechDigestScope, RawTrendItem[]>;
  const rankingsMap = buildPeriodRankings(periodFiltered, []);
  const rankings = rankingsMap[scope];

  hooks?.onProgress?.(`LLM 分析（${scope}）`);
  const analysis = await analyzeTrendItemsForScope(scope, filtered, rankings, llm, hooks);

  const rankingsWithProjects = buildPeriodRankings(periodFiltered, analysis.projects)[scope];

  let report: TechDigestReport;

  if (scope === 'daily') {
    report = {
      scope,
      generatedAt: new Date().toISOString(),
      llmModel: resolveLlmModelLabel(llm),
      rawCounts: countBySource(raw),
      filteredCount: filtered.length,
      sourceWarnings: warnings,
      projects: analysis.projects,
      top10: analysis.top10,
      top5SourceStudy: analysis.top5SourceStudy,
      topHot20: rankingsWithProjects.topHot,
      weeklyTrendsMarkdown: analysis.trendsMarkdown,
      reportMarkdown: appendWarnings(
        buildDailyReportMarkdown(
          analysis.projects,
          filtered,
          rankingsWithProjects,
          analysis.top10,
          analysis.top5SourceStudy,
          analysis.trendsMarkdown
        ),
        warnings
      ),
    };
  } else {
    report = {
      scope,
      generatedAt: new Date().toISOString(),
      llmModel: resolveLlmModelLabel(llm),
      rawCounts: countBySource(raw),
      filteredCount: filtered.length,
      sourceWarnings: warnings,
      projects: analysis.projects,
      rankings: rankingsWithProjects,
      trendsMarkdown: analysis.trendsMarkdown,
      reportMarkdown: appendWarnings(
        buildLongTermReportMarkdown(scope, analysis.projects, filtered, rankingsWithProjects, analysis.trendsMarkdown),
        warnings
      ),
    };
  }

  saveDigest(scope, report);
  hooks?.onProgress?.('完成');
  return report;
}

/** @deprecated 使用 runTechDigestRefreshForPeriod */
export async function runTechDigestRefresh(
  llm: AgentLlmOptions | undefined,
  hooks?: TechDigestProgressHooks
): Promise<TechDigestReport> {
  return runTechDigestRefreshForPeriod('daily', llm, hooks);
}
