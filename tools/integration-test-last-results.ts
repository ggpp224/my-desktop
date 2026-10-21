/* AI 生成 By Peng.Guo */
/**
 * 从各套件最近一份 Playwright HTML 报告中读取上次执行结果，按 spec 汇总。
 * HTML 报告把 report.json 打成 zip 后以 base64 内嵌在 index.html 中。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { INTEGRATION_TEST_SUITES, type IIntegrationTestSuite } from './integration-test-suites.js';
import type {
  IIntegrationTestCaseResult,
  IIntegrationTestLastResults,
  IIntegrationTestReportSummary,
} from './integration-test-types.js';
import { readZipEntry } from './zip-entry-reader.js';

const EMBEDDED_REPORT_PATTERN = /id="playwrightReportBase64"[^>]*>\s*data:application\/zip;base64,([A-Za-z0-9+/=]+)/;
const REPORT_ENTRY = 'report.json';

/** Playwright HTML 报告中与结果相关的最小结构 */
interface IHtmlReportTest {
  outcome?: string;
}
interface IHtmlReportFile {
  fileName?: string;
  tests?: IHtmlReportTest[];
}
interface IHtmlReport {
  startTime?: number;
  files?: IHtmlReportFile[];
}

/** 从 index.html 中取出内嵌的 report.json */
export function extractHtmlReport(html: string): IHtmlReport {
  const match = EMBEDDED_REPORT_PATTERN.exec(html);
  if (!match) throw new Error('报告中未找到内嵌结果数据');
  const entry = readZipEntry(Buffer.from(match[1], 'base64'), REPORT_ENTRY);
  if (!entry) throw new Error(`报告数据中缺少 ${REPORT_ENTRY}`);
  return JSON.parse(entry.toString('utf8')) as IHtmlReport;
}

function tallyFile(tests: IHtmlReportTest[]): IIntegrationTestCaseResult {
  const result: IIntegrationTestCaseResult = { outcome: 'skipped', passed: 0, failed: 0, flaky: 0, skipped: 0 };
  for (const t of tests) {
    if (t.outcome === 'expected') result.passed++;
    else if (t.outcome === 'unexpected') result.failed++;
    else if (t.outcome === 'flaky') result.flaky++;
    else result.skipped++;
  }
  if (result.failed) result.outcome = 'failed';
  else if (result.passed || result.flaky) result.outcome = 'passed';
  return result;
}

/** 报告中 fileName 相对套件 testDir，转换为相对集成测试仓根目录的 specPath */
export function summarizeHtmlReport(report: IHtmlReport, testsRoot: string): Record<string, IIntegrationTestCaseResult> {
  const cases: Record<string, IIntegrationTestCaseResult> = {};
  for (const file of report.files ?? []) {
    if (!file.fileName || !file.tests?.length) continue;
    const specPath = path.posix.join(testsRoot, file.fileName.replace(/\\/g, '/'));
    cases[specPath] = tallyFile(file.tests);
  }
  return cases;
}

function readSuiteReport(
  projectPath: string,
  suite: IIntegrationTestSuite
): { summary: IIntegrationTestReportSummary; cases: Record<string, IIntegrationTestCaseResult> } | null {
  const reportPath = path.join(projectPath, suite.reportDir, 'index.html');
  if (!existsSync(reportPath)) return null;
  const summary: IIntegrationTestReportSummary = {
    suiteId: suite.id,
    suiteLabel: suite.label,
    reportPath,
    startTime: 0,
    error: '',
  };
  try {
    const report = extractHtmlReport(readFileSync(reportPath, 'utf8'));
    summary.startTime = typeof report.startTime === 'number' ? report.startTime : 0;
    return { summary, cases: summarizeHtmlReport(report, suite.testsRoot) };
  } catch (err) {
    summary.error = `解析报告失败：${err instanceof Error ? err.message : String(err)}`;
    return { summary, cases: {} };
  }
}

/** 汇总所有套件的最近报告；没有任何报告时 error 给出提示 */
export function readIntegrationTestLastResults(
  projectPath: string,
  suites: readonly IIntegrationTestSuite[] = INTEGRATION_TEST_SUITES
): IIntegrationTestLastResults {
  const result: IIntegrationTestLastResults = { cases: {}, reports: [], error: '' };
  for (const suite of suites) {
    const read = readSuiteReport(projectPath, suite);
    if (!read) continue;
    result.reports.push(read.summary);
    Object.assign(result.cases, read.cases);
  }
  if (!result.reports.length) {
    result.error = `未找到执行报告（${suites.map((s) => `${s.reportDir}/index.html`).join('、')}），请先运行用例`;
  }
  return result;
}
