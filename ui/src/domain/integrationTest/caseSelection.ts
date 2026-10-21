/* AI 生成 By Peng.Guo */
import type { IntegrationTestCase, IntegrationTestCaseGroup, IntegrationTestEnv } from './models';

/** 按文件名或场景标题过滤（不区分大小写） */
export function matchesCaseFilter(item: IntegrationTestCase, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  return [item.fileName, ...item.titles].some((t) => t.toLowerCase().includes(q));
}

export function caseDisplayTitle(item: IntegrationTestCase): string {
  return item.titles.length ? item.titles.join(' / ') : item.fileName;
}

/** 勾选 / 取消一批用例，返回新集合 */
export function setCasesSelected(selected: ReadonlySet<string>, specPaths: string[], checked: boolean): Set<string> {
  const next = new Set(selected);
  for (const p of specPaths) {
    if (checked) next.add(p);
    else next.delete(p);
  }
  return next;
}

/** 刷新目录后剔除已不存在的用例 */
export function pruneSelection(selected: Iterable<string>, groups: IntegrationTestCaseGroup[]): Set<string> {
  const known = new Set(groups.flatMap((g) => g.cases.map((c) => c.specPath)));
  return new Set([...selected].filter((s) => known.has(s)));
}

/** 优先沿用 preferred，不可用时取第一个有本地 env 文件的环境 */
export function pickUsableEnv(envs: IntegrationTestEnv[], preferred: string): string {
  const usable = envs.filter((e) => e.hasLocalFile).map((e) => e.id);
  if (usable.includes(preferred)) return preferred;
  return usable[0] ?? '';
}

export type GroupCheckState = 'none' | 'partial' | 'all';

export function groupCheckState(cases: IntegrationTestCase[], selected: ReadonlySet<string>): GroupCheckState {
  const picked = cases.filter((c) => selected.has(c.specPath)).length;
  if (picked === 0) return 'none';
  return picked === cases.length ? 'all' : 'partial';
}
