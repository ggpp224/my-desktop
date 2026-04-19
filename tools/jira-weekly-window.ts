/* AI 生成 By Peng.Guo */
/**
 * 周报 Jira 时间窗：按「周一 00:00 — 下周一 00:00」在指定 IANA 时区内计算，
 * 避免依赖 Jira 的 startOfWeek/endOfWeek（美历周、周六为一周结束等）与中文业务周不一致。
 */

export type WeeklyWindowBounds = {
  /** 本周一 00:00 该时区墙钟所对应的 UTC 时刻 */
  start: Date;
  /** 下周一 00:00 该时区墙钟所对应的 UTC 时刻 */
  end: Date;
};

type YmdHm = { y: number; mon: number; d: number; h: number; min: number };

function extractYmdHmInTz(utcMillis: number, timeZone: string): YmdHm {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const m: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(utcMillis))) {
    if (p.type === 'literal') continue;
    m[p.type] = parseInt(p.value, 10);
  }
  return { y: m.year, mon: m.month, d: m.day, h: m.hour, min: m.minute };
}

function extractYmdInTz(d: Date, timeZone: string): { y: number; m: number; d: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const m: Record<string, number> = {};
  for (const p of f.formatToParts(d)) {
    if (p.type === 'literal') continue;
    m[p.type] = parseInt(p.value, 10);
  }
  return { y: m.year, m: m.month, d: m.day };
}

/** 在 timeZone 下将墙钟 y-mon-d hh:mm 解析为 UTC Date（线性扫描，避免引入时区库）。 */
export function findUtcForWallTime(y: number, mon: number, d: number, hh: number, minute: number, timeZone: string): Date {
  const start = Date.UTC(y, mon - 1, d - 2, 0, 0, 0, 0);
  const end = Date.UTC(y, mon - 1, d + 3, 0, 0, 0, 0);
  for (let t = start; t <= end; t += 60_000) {
    const p = extractYmdHmInTz(t, timeZone);
    if (p.y === y && p.mon === mon && p.d === d && p.h === hh && p.min === minute) {
      return new Date(t);
    }
  }
  throw new Error(`无法解析 ${timeZone} 本地时间 ${y}-${mon}-${d} ${String(hh).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
}

function getWeekdayMon0Sun6InTz(now: Date, timeZone: string): number {
  const w = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const v = map[w];
  if (v === undefined) throw new Error(`无法识别星期缩写: ${w}`);
  return v;
}

function addCalendarDays(y: number, m: number, d: number, deltaDays: number, timeZone: string): { y: number; m: number; d: number } {
  const noon = findUtcForWallTime(y, m, d, 12, 0, timeZone);
  return extractYmdInTz(new Date(noon.getTime() + deltaDays * 86_400_000), timeZone);
}

/** 当前时刻所在「业务周」：周一 00:00～下周一 00:00（均按 timeZone 墙钟）。 */
export function getMondayWeekBoundsInTimeZone(now: Date, timeZone: string): WeeklyWindowBounds {
  const { y, m, d } = extractYmdInTz(now, timeZone);
  const wd = getWeekdayMon0Sun6InTz(now, timeZone);
  const monday = addCalendarDays(y, m, d, -wd, timeZone);
  const nextMonday = addCalendarDays(monday.y, monday.m, monday.d, 7, timeZone);
  return {
    start: findUtcForWallTime(monday.y, monday.m, monday.d, 0, 0, timeZone),
    end: findUtcForWallTime(nextMonday.y, nextMonday.m, nextMonday.d, 0, 0, timeZone),
  };
}

/** Jira 常用字面量：yyyy/MM/dd HH:mm（与 JQL 示例一致）。 */
export function formatJiraDateTimeInZone(d: Date, timeZone: string): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    f.formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
  ) as { year: string; month: string; day: string; hour: string; minute: string };
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function buildWeeklyReportDuringClause(timeZone: string, now = new Date()): string {
  const { start, end } = getMondayWeekBoundsInTimeZone(now, timeZone);
  const a = formatJiraDateTimeInZone(start, timeZone);
  const b = formatJiraDateTimeInZone(end, timeZone);
  return `during ("${a}", "${b}")`;
}
