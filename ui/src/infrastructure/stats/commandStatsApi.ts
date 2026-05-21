/* AI 生成 By Peng.Guo */
import type {
  CommandStatsAggregatedResponse,
  CommandStatsBySourceResponse,
  CommandStatsTimelineResponse,
} from '../../domain/stats/models';

export type StatsQueryParams = {
  days?: number;
  from?: string;
  to?: string;
  source?: string;
  limit?: number;
};

function buildQuery(params: StatsQueryParams): string {
  const q = new URLSearchParams();
  if (params.from && params.to) {
    q.set('from', params.from);
    q.set('to', params.to);
  } else if (params.days != null) {
    q.set('days', String(params.days));
  }
  if (params.source) q.set('source', params.source);
  if (params.limit != null) q.set('limit', String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function fetchCommandStats(
  apiBase: string,
  params: StatsQueryParams
): Promise<CommandStatsAggregatedResponse> {
  const res = await fetch(`${apiBase}/stats/commands${buildQuery(params)}`);
  if (!res.ok) throw new Error(`统计请求失败: ${res.status}`);
  return res.json() as Promise<CommandStatsAggregatedResponse>;
}

export async function fetchCommandStatsTimeline(
  apiBase: string,
  params: StatsQueryParams
): Promise<CommandStatsTimelineResponse> {
  const res = await fetch(`${apiBase}/stats/commands/timeline${buildQuery(params)}`);
  if (!res.ok) throw new Error(`时间序列请求失败: ${res.status}`);
  return res.json() as Promise<CommandStatsTimelineResponse>;
}

export async function fetchCommandStatsBySource(
  apiBase: string,
  params: StatsQueryParams
): Promise<CommandStatsBySourceResponse> {
  const res = await fetch(`${apiBase}/stats/commands/by-source${buildQuery(params)}`);
  if (!res.ok) throw new Error(`来源统计请求失败: ${res.status}`);
  return res.json() as Promise<CommandStatsBySourceResponse>;
}
