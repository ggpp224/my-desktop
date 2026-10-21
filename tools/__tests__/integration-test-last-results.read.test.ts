/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { readIntegrationTestLastResults, summarizeHtmlReport } from '../integration-test-last-results.js';
import { getIntegrationTestLastResults } from '../integration-test-tool.js';
import { buildHtmlReport } from './zip-fixture.js';

function writeReport(projectPath: string, reportDir: string, html: string): void {
  mkdirSync(path.join(projectPath, reportDir), { recursive: true });
  writeFileSync(path.join(projectPath, reportDir, 'index.html'), html);
}

const portalReport = {
  startTime: 1791533191847,
  files: [
    { fileName: 'grid/Grid.sort.spec.ts', tests: [{ outcome: 'expected' }, { outcome: 'flaky' }] },
    { fileName: 'grid/Grid.copy.spec.ts', tests: [{ outcome: 'expected' }, { outcome: 'unexpected' }] },
    { fileName: 'env/Env.probe.spec.ts', tests: [{ outcome: 'skipped' }] },
  ],
};

describe('integration-test-last-results read', () => {
  it('按 spec 汇总：任一失败为 failed，flaky 计为 passed，全部跳过为 skipped', () => {
    const cases = summarizeHtmlReport(portalReport, 'tests/browser');
    assert.deepEqual(cases['tests/browser/grid/Grid.sort.spec.ts'], {
      outcome: 'passed',
      passed: 1,
      failed: 0,
      flaky: 1,
      skipped: 0,
    });
    assert.equal(cases['tests/browser/grid/Grid.copy.spec.ts'].outcome, 'failed');
    assert.equal(cases['tests/browser/env/Env.probe.spec.ts'].outcome, 'skipped');
  });

  it('Windows 分隔符与空文件被规范化或忽略', () => {
    const cases = summarizeHtmlReport(
      { files: [{ fileName: 'grid\\Grid.a.spec.ts', tests: [{ outcome: 'expected' }] }, { fileName: 'x.spec.ts', tests: [] }] },
      'tests/browser'
    );
    assert.deepEqual(Object.keys(cases), ['tests/browser/grid/Grid.a.spec.ts']);
  });

  it('合并多个套件报告，并记录报告时间', () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'adc-it-last-'));
    writeReport(projectPath, 'playwright-report', buildHtmlReport(portalReport));
    writeReport(
      projectPath,
      'playwright-report-ui',
      buildHtmlReport({ startTime: 1, files: [{ fileName: 'input/Input.fill.spec.ts', tests: [{ outcome: 'unexpected' }] }] })
    );
    const result = readIntegrationTestLastResults(projectPath);
    assert.equal(result.error, '');
    assert.deepEqual(
      result.reports.map((r) => [r.suiteId, r.suiteLabel, r.startTime, r.error]),
      [
        ['portal', '门户', 1791533191847, ''],
        ['ui', 'UI 组件', 1, ''],
      ]
    );
    assert.equal(result.cases['tests/ui/input/Input.fill.spec.ts'].outcome, 'failed');
    assert.equal(result.cases['tests/browser/grid/Grid.sort.spec.ts'].outcome, 'passed');
  });

  it('报告损坏时只标记该套件错误，不影响其它套件', () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'adc-it-last-'));
    writeReport(projectPath, 'playwright-report', '<html>no data</html>');
    writeReport(projectPath, 'playwright-report-ui', buildHtmlReport(portalReport));
    const result = readIntegrationTestLastResults(projectPath);
    assert.match(result.reports[0].error, /未找到内嵌结果数据/);
    assert.equal(result.reports[1].error, '');
    assert.equal(result.cases['tests/ui/grid/Grid.sort.spec.ts'].outcome, 'passed');
  });

  it('没有任何报告时给出提示', () => {
    const result = readIntegrationTestLastResults(mkdtempSync(path.join(tmpdir(), 'adc-it-last-')));
    assert.deepEqual(result.cases, {});
    assert.match(result.error, /未找到执行报告/);
  });

  it('项目目录不存在时返回目录错误', () => {
    const result = getIntegrationTestLastResults(path.join(tmpdir(), 'adc-it-last-missing'));
    assert.match(result.error, /不存在/);
  });
});
