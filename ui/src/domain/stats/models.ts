/* AI 生成 By Peng.Guo */

export type ChartType = 'bar' | 'pie' | 'line';

export type PieGroupMode = 'command' | 'source';

export type StatsRangePreset = 7 | 30 | 90 | 'custom';

export type CommandStatItem = {
  canonicalKey: string;
  displayLabel: string;
  count: number;
  source?: string;
};

export type CommandStatBySourceItem = {
  source: string;
  count: number;
};

export type TimelineBucket = {
  date: string;
  count: number;
};

export type StatsRangeResponse = {
  from: string;
  to: string;
};

export type CommandStatsAggregatedResponse = {
  items: CommandStatItem[];
  total: number;
  range: StatsRangeResponse;
};

export type CommandStatsTimelineResponse = {
  buckets: TimelineBucket[];
  granularity: 'day';
  total: number;
  range: StatsRangeResponse;
};

export type CommandStatsBySourceResponse = {
  items: CommandStatBySourceItem[];
  total: number;
  range: StatsRangeResponse;
};

export type PieChartSlice = {
  name: string;
  value: number;
  percent: number;
};
