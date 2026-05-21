/* AI 生成 By Peng.Guo */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ChartType,
  CommandStatItem,
  PieChartSlice,
  PieGroupMode,
  StatsRangePreset,
  TimelineBucket,
} from '../../domain/stats/models';
import {
  fetchCommandStats,
  fetchCommandStatsBySource,
  fetchCommandStatsTimeline,
  type StatsQueryParams,
} from '../../infrastructure/stats/commandStatsApi';

const SOURCE_LABELS: Record<string, string> = {
  chat: '聊天指令',
  workflow: '工作流',
  deploy: '部署',
  merge: '合并',
  browser: '浏览器',
  knowledge: '知识库',
};

function formatDateInput(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateInput(value: string, endOfDay: boolean): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return Date.now();
  if (endOfDay) {
    const d = new Date(parsed);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  return parsed;
}

function buildPieSlices(items: Array<{ name: string; value: number }>, total: number, topN: number): PieChartSlice[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, topN);
  const topSum = top.reduce((s, i) => s + i.value, 0);
  const rest = Math.max(0, total - topSum);
  const slices: PieChartSlice[] = top.map((item) => ({
    name: item.name,
    value: item.value,
    percent: total > 0 ? (item.value / total) * 100 : 0,
  }));
  if (rest > 0) {
    slices.push({
      name: '其他',
      value: rest,
      percent: total > 0 ? (rest / total) * 100 : 0,
    });
  }
  return slices;
}

function fillTimelineGaps(buckets: TimelineBucket[], fromMs: number, toMs: number): TimelineBucket[] {
  const map = new Map(buckets.map((b) => [b.date, b.count]));
  const result: TimelineBucket[] = [];
  const cursor = new Date(fromMs);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(toMs);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    const key = formatDateInput(cursor.getTime());
    result.push({ date: key, count: map.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

const CHART_COLOR_FALLBACK = ['#4f83ff', '#14b8a6', '#f59e0b', '#a78bfa', '#f472b6', '#38bdf8', '#84cc16', '#fb7185'];

/** 饼图/柱状图色板（不透明，避免 SVG 对 8 位 hex 支持不一致导致“空白”） */
export function deriveChartColors(baseColor: string, count: number): string[] {
  const n = Math.max(count, 1);
  const colors: string[] = [baseColor];
  for (let i = 1; i < n; i += 1) {
    colors.push(CHART_COLOR_FALLBACK[i % CHART_COLOR_FALLBACK.length]);
  }
  return colors;
}

export function useCommandStats(apiBase: string) {
  const [preset, setPreset] = useState<StatsRangePreset>(30);
  const [customFrom, setCustomFrom] = useState(() => formatDateInput(Date.now() - 30 * 86400000));
  const [customTo, setCustomTo] = useState(() => formatDateInput(Date.now()));
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [pieGroupMode, setPieGroupMode] = useState<PieGroupMode>('command');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aggregated, setAggregated] = useState<CommandStatItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineBucket[]>([]);
  const [bySource, setBySource] = useState<Array<{ source: string; count: number }>>([]);
  const [total, setTotal] = useState(0);
  const [rangeLabel, setRangeLabel] = useState('');

  const queryParams = useMemo((): StatsQueryParams => {
    if (preset === 'custom') {
      return {
        from: new Date(parseDateInput(customFrom, false)).toISOString(),
        to: new Date(parseDateInput(customTo, true)).toISOString(),
        limit: 15,
      };
    }
    return { days: preset, limit: 15 };
  }, [preset, customFrom, customTo]);

  const reload = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    setError(null);
    try {
      const [agg, line, src] = await Promise.all([
        fetchCommandStats(apiBase, queryParams),
        fetchCommandStatsTimeline(apiBase, queryParams),
        fetchCommandStatsBySource(apiBase, queryParams),
      ]);
      setAggregated(agg.items);
      setTotal(agg.total);
      const fromMs = Date.parse(agg.range.from);
      const toMs = Date.parse(agg.range.to);
      setTimeline(fillTimelineGaps(line.buckets, fromMs, toMs));
      setBySource(src.items);
      const fromStr = new Date(agg.range.from).toLocaleDateString('zh-CN');
      const toStr = new Date(agg.range.to).toLocaleDateString('zh-CN');
      setRangeLabel(`${fromStr} — ${toStr}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAggregated([]);
      setTimeline([]);
      setBySource([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [apiBase, queryParams]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const barData = useMemo(
    () =>
      aggregated.map((item) => ({
        name: item.displayLabel,
        count: item.count,
        percent: total > 0 ? (item.count / total) * 100 : 0,
      })),
    [aggregated, total]
  );

  const pieSlices = useMemo(() => {
    if (pieGroupMode === 'source') {
      return buildPieSlices(
        bySource.map((item) => ({
          name: SOURCE_LABELS[item.source] ?? item.source,
          value: item.count,
        })),
        total,
        8
      );
    }
    return buildPieSlices(
      aggregated.map((item) => ({ name: item.displayLabel, value: item.count })),
      total,
      12
    );
  }, [aggregated, bySource, pieGroupMode, total]);

  return {
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    chartType,
    setChartType,
    pieGroupMode,
    setPieGroupMode,
    loading,
    error,
    total,
    rangeLabel,
    barData,
    pieSlices,
    timeline,
    reload,
  };
}
