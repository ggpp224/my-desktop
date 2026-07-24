/* AI 生成 By Peng.Guo */
/**
 * 修复版本迭代（版本名 YYMMDD）：
 * 按当前日期落在哪一档确定「当前迭代」——取版本日 ≥ 今天的最早一档；
 * 若全部已过期则取最后一档。前一 / 下一为其有序列表邻居。
 */
import { extractYmdInTz } from './jira-weekly-window.js';

export type FixIterationNeighbors = {
  /** 当前迭代的前一档；无则 null */
  previous: string | null;
  /** 当前日期落入的迭代号 */
  current: string;
  /** 当前迭代的下一档；无则 null */
  next: string | null;
};

/** 版本名形如 260820 → 2026-08-20；无法解析则返回 null。 */
export function parseFixVersionYymmdd(name: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(name.trim());
  if (!m) return null;
  const y = 2000 + Number(m[1]);
  const mon = Number(m[2]);
  const d = Number(m[3]);
  if (mon < 1 || mon > 12 || d < 1 || d > 31) return null;
  return { y, m: mon, d };
}

function ymdKey(y: number, m: number, d: number): number {
  return y * 10_000 + m * 100 + d;
}

/** 去重并按 YYMMDD 升序；忽略无法解析的名称。 */
export function sortUniqueYymmddVersions(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const scored: Array<{ name: string; key: number }> = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    const parsed = parseFixVersionYymmdd(name);
    if (!parsed) continue;
    seen.add(name);
    scored.push({ name, key: ymdKey(parsed.y, parsed.m, parsed.d) });
  }
  return scored.sort((a, b) => a.key - b.key).map((s) => s.name);
}

/**
 * 按当前日期解析前一 / 当前 / 下一迭代。
 * 「落入哪一档」= 版本日 ≥ 今天的最早一档；全部过期则取最后一档。
 */
export function resolveFixIterationNeighbors(
  versionNames: readonly string[],
  now: Date,
  timeZone: string,
): FixIterationNeighbors | null {
  const sorted = sortUniqueYymmddVersions(versionNames);
  if (sorted.length === 0) return null;

  const today = extractYmdInTz(now, timeZone);
  const todayKey = ymdKey(today.y, today.m, today.d);

  let currentIndex = sorted.findIndex((name) => {
    const parsed = parseFixVersionYymmdd(name);
    return parsed != null && ymdKey(parsed.y, parsed.m, parsed.d) >= todayKey;
  });
  if (currentIndex < 0) currentIndex = sorted.length - 1;

  return {
    previous: currentIndex > 0 ? sorted[currentIndex - 1] : null,
    current: sorted[currentIndex],
    next: currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null,
  };
}
