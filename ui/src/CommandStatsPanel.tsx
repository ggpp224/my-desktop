/* AI 生成 By Peng.Guo */
import { useMemo } from 'react';
import type { AppThemeTokens } from './domain/theme/appTheme';
import type { ChartType, StatsRangePreset } from './domain/stats/models';
import { Button } from './view/Button';
import { CommandStatsCharts } from './view/stats/CommandStatsCharts';
import { deriveChartColors, useCommandStats } from './viewmodel/stats/useCommandStats';

interface CommandStatsPanelProps {
  apiBase: string;
  themeTokens: AppThemeTokens;
}

const CHART_TYPES: Array<{ key: ChartType; label: string }> = [
  { key: 'bar', label: '柱状' },
  { key: 'pie', label: '饼图' },
  { key: 'line', label: '折线' },
];

const PRESETS: Array<{ key: StatsRangePreset; label: string }> = [
  { key: 7, label: '7 天' },
  { key: 30, label: '30 天' },
  { key: 90, label: '90 天' },
  { key: 'custom', label: '自定义' },
];

export function CommandStatsPanel({ apiBase, themeTokens }: CommandStatsPanelProps) {
  const stats = useCommandStats(apiBase);
  const colors = useMemo(
    () => deriveChartColors(themeTokens.tabActiveBorder, 12),
    [themeTokens.tabActiveBorder]
  );

  const empty =
    !stats.loading &&
    !stats.error &&
    stats.total === 0 &&
    (stats.chartType === 'line' ? stats.timeline.every((b) => b.count === 0) : stats.barData.length === 0);

  return (
    <section
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        padding: 16,
        boxSizing: 'border-box',
        background: themeTokens.appBackground,
        color: themeTokens.textPrimary,
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>统计常用指令</h2>
        <p style={{ margin: 0, fontSize: 13, color: themeTokens.textSecondary }}>
          {stats.rangeLabel ? `区间：${stats.rangeLabel}` : '加载中…'}
          {stats.total > 0 && (
            <span style={{ marginLeft: 12, color: themeTokens.tabActiveBorder }}>共 {stats.total} 次</span>
          )}
        </p>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: themeTokens.textSecondary }}>时间段</span>
        {PRESETS.map((p) => (
          <Button
            key={String(p.key)}
            themeTokens={themeTokens}
            variant={stats.preset === p.key ? 'solid' : 'soft'}
            size="sm"
            onClick={() => stats.setPreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
        {stats.preset === 'custom' && (
          <>
            <input
              type="date"
              value={stats.customFrom}
              onChange={(e) => stats.setCustomFrom(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${themeTokens.inputBorder}`,
                background: themeTokens.inputBackground,
                color: themeTokens.textPrimary,
                fontSize: 12,
              }}
            />
            <span style={{ color: themeTokens.textSecondary }}>至</span>
            <input
              type="date"
              value={stats.customTo}
              onChange={(e) => stats.setCustomTo(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${themeTokens.inputBorder}`,
                background: themeTokens.inputBackground,
                color: themeTokens.textPrimary,
                fontSize: 12,
              }}
            />
          </>
        )}
        <Button themeTokens={themeTokens} variant="soft" size="sm" onClick={() => void stats.reload()}>
          刷新
        </Button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: themeTokens.textSecondary }}>图表</span>
        {CHART_TYPES.map((c) => (
          <Button
            key={c.key}
            themeTokens={themeTokens}
            variant={stats.chartType === c.key ? 'solid' : 'soft'}
            size="sm"
            onClick={() => stats.setChartType(c.key)}
          >
            {c.label}
          </Button>
        ))}
        {stats.chartType === 'pie' && (
          <>
            <span style={{ fontSize: 12, color: themeTokens.textSecondary, marginLeft: 8 }}>分组</span>
            <Button
              themeTokens={themeTokens}
              variant={stats.pieGroupMode === 'command' ? 'solid' : 'soft'}
              size="sm"
              onClick={() => stats.setPieGroupMode('command')}
            >
              按指令
            </Button>
            <Button
              themeTokens={themeTokens}
              variant={stats.pieGroupMode === 'source' ? 'solid' : 'soft'}
              size="sm"
              onClick={() => stats.setPieGroupMode('source')}
            >
              按来源
            </Button>
          </>
        )}
      </div>

      {stats.error && (
        <p style={{ color: themeTokens.statusError, fontSize: 13, margin: '0 0 12px' }}>{stats.error}</p>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          height: 0,
          border: `1px solid ${themeTokens.panelBorder}`,
          borderRadius: 8,
          background: themeTokens.headerBackground,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {stats.loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `${themeTokens.headerBackground}cc`,
              zIndex: 1,
              fontSize: 13,
              color: themeTokens.textSecondary,
            }}
          >
            加载中…
          </div>
        )}
        <div style={{ position: 'absolute', inset: 12 }}>
          <CommandStatsCharts
            chartType={stats.chartType}
            barData={stats.barData}
            pieSlices={stats.pieSlices}
            timeline={stats.timeline}
            colors={colors}
            themeText={themeTokens.textPrimary}
            themeTextSecondary={themeTokens.textSecondary}
            themeBorder={themeTokens.panelBorder}
            empty={empty}
          />
        </div>
      </div>
    </section>
  );
}
