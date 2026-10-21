/* AI 生成 By Peng.Guo */
import type { IntegrationTestCase, IntegrationTestCaseResult, IntegrationTestReportSummary } from './models';

export type OutcomeTally = { passed: number; failed: number };

/** 统计一批用例在上次执行中的通过 / 失败 spec 数（未执行或全部跳过不计入） */
export function tallyOutcomes(
  cases: IntegrationTestCase[],
  results: Readonly<Record<string, IntegrationTestCaseResult>>
): OutcomeTally {
  const tally: OutcomeTally = { passed: 0, failed: 0 };
  for (const c of cases) {
    const outcome = results[c.specPath]?.outcome;
    if (outcome === 'passed') tally.passed++;
    else if (outcome === 'failed') tally.failed++;
  }
  return tally;
}

/** 悬浮提示：spec 内各测试的结果计数 */
export function describeCaseResult(result: IntegrationTestCaseResult): string {
  return [
    `通过 ${result.passed}`,
    `失败 ${result.failed}`,
    result.flaky ? `重试后通过 ${result.flaky}` : '',
    result.skipped ? `跳过 ${result.skipped}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 报告概况：每个套件的报告时间或解析错误 */
export function describeReports(reports: IntegrationTestReportSummary[]): string {
  return reports
    .map((r) => `${r.suiteLabel} ${r.error ? r.error : r.startTime ? formatTime(r.startTime) : '时间未知'}`)
    .join('；');
}
