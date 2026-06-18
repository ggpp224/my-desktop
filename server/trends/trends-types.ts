/* AI 生成 By Peng.Guo */

export type TrendSource = 'github' | 'hackernews' | 'reddit_localllama' | 'reddit_openai';

export type TechDigestScope = 'daily' | 'monthly' | 'halfYear';

/** @deprecated 使用 TechDigestScope */
export type DigestPeriod = TechDigestScope;

export type RawTrendItem = {
  source: TrendSource;
  title: string;
  url: string;
  score?: number;
  repoFullName?: string;
  summary?: string;
  fetchedAt: string;
  period?: TechDigestScope;
};

export type AnalyzedProject = {
  id: string;
  name: string;
  url: string;
  sources: TrendSource[];
  oneLiner: string;
  whyHot: string;
  innovation: string;
  worthStudying: boolean;
  worthStudyingReason: string;
  relevanceScore: number;
};

export type PeriodTop20Rankings = {
  topFollow: string[];
  topSourceStudy: string[];
  topHot: string[];
};

export type TechDigestReport = {
  scope: TechDigestScope;
  generatedAt: string;
  llmModel: string;
  rawCounts: Record<TrendSource, number>;
  filteredCount: number;
  sourceWarnings: string[];
  projects: AnalyzedProject[];
  reportMarkdown: string;
  /** daily */
  top10?: string[];
  top5SourceStudy?: string[];
  topHot20?: string[];
  weeklyTrendsMarkdown?: string;
  /** monthly / halfYear */
  rankings?: PeriodTop20Rankings;
  trendsMarkdown?: string;
};

export type TechDigestProgressHooks = {
  onProgress?: (message: string) => void;
  onLlmDelta?: (delta: { contentDelta?: string; thinkingDelta?: string }) => void;
  signal?: AbortSignal;
};

export const EMPTY_RAW_COUNTS: Record<TrendSource, number> = {
  github: 0,
  hackernews: 0,
  reddit_localllama: 0,
  reddit_openai: 0,
};
