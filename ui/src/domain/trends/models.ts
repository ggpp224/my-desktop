/* AI 生成 By Peng.Guo */

export type TrendSource = 'github' | 'hackernews' | 'reddit_localllama' | 'reddit_openai';

export type TechDigestScope = 'daily' | 'monthly' | 'halfYear';

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
  top10?: string[];
  top5SourceStudy?: string[];
  topHot20?: string[];
  weeklyTrendsMarkdown?: string;
  rankings?: PeriodTop20Rankings;
  trendsMarkdown?: string;
};

export type TechDigestLatestAllResponse = {
  success: boolean;
  daily?: TechDigestReport | null;
  monthly?: TechDigestReport | null;
  halfYear?: TechDigestReport | null;
  error?: string;
};

export type TechDigestLatestScopeResponse = {
  success: boolean;
  report?: TechDigestReport | null;
  error?: string;
};

export type TechDigestInnerTab = 'daily' | 'longterm';
