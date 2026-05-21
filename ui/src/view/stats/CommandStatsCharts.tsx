/* AI 生成 By Peng.Guo */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartType, PieChartSlice, TimelineBucket } from '../../domain/stats/models';

type BarRow = { name: string; count: number; percent: number };

type CommandStatsChartsProps = {
  chartType: ChartType;
  barData: BarRow[];
  pieSlices: PieChartSlice[];
  timeline: TimelineBucket[];
  colors: string[];
  themeText: string;
  themeTextSecondary: string;
  themeBorder: string;
  empty: boolean;
};

function formatPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

export function CommandStatsCharts({
  chartType,
  barData,
  pieSlices,
  timeline,
  colors,
  themeText,
  themeTextSecondary,
  themeBorder,
  empty,
}: CommandStatsChartsProps) {
  if (empty) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: themeTextSecondary,
          fontSize: 14,
        }}
      >
        该时间段暂无统计
      </div>
    );
  }

  const chartWrapStyle = { width: '100%', height: '100%', minWidth: 0, minHeight: 200 };

  const tooltipStyle = {
    background: '#0f172a',
    border: `1px solid ${themeBorder}`,
    borderRadius: 6,
    color: themeText,
    fontSize: 12,
  };

  if (chartType === 'bar') {
    return (
      <div style={chartWrapStyle}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={barData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={themeBorder} horizontal={false} />
          <XAxis type="number" stroke={themeTextSecondary} fontSize={11} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={160}
            stroke={themeTextSecondary}
            fontSize={11}
            tick={{ fill: themeText }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, _name, item) => {
              const n = typeof value === 'number' ? value : Number(value ?? 0);
              const row = item?.payload as BarRow | undefined;
              const pct = row?.percent ?? 0;
              return [`${n} 次（${formatPercent(pct)}）`, '次数'];
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {barData.map((_, index) => (
              <Cell key={`bar-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'pie') {
    return (
      <div style={chartWrapStyle}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieSlices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={100}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            labelLine={{ stroke: themeTextSecondary }}
          >
            {pieSlices.map((_, index) => (
              <Cell key={`pie-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name, item) => {
              const n = typeof value === 'number' ? value : Number(value ?? 0);
              const row = item?.payload as PieChartSlice | undefined;
              const pct = row?.percent ?? 0;
              return [`${n} 次（${formatPercent(pct)}）`, String(name ?? '')];
            }}
          />
          <Legend wrapperStyle={{ color: themeText, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={chartWrapStyle}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={timeline} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={themeBorder} />
        <XAxis dataKey="date" stroke={themeTextSecondary} fontSize={11} tick={{ fill: themeText }} />
        <YAxis stroke={themeTextSecondary} fontSize={11} allowDecimals={false} tick={{ fill: themeText }} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => {
            const n = typeof value === 'number' ? value : Number(value ?? 0);
            return [`${n} 次`, '指令总次数'];
          }}
          labelFormatter={(label) => `日期 ${label}`}
        />
        <Line
          type="monotone"
          dataKey="count"
          name="指令总次数"
          stroke={colors[0]}
          strokeWidth={2}
          dot={{ r: 3, fill: colors[0] }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
