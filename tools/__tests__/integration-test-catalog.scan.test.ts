/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { scanIntegrationTestCases } from '../integration-test-case-catalog.js';
import { scanIntegrationTestEnvs } from '../integration-test-env-catalog.js';

function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'adc-it-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

describe('integration-test env catalog scan', () => {
  it('默认环境在首位，其余去重排序，并读取 PORTAL_BASE_URL', () => {
    const dir = makeProject({
      '.env': 'PORTAL_BASE_URL=https://pre-test-cloud.chanjet.com\n',
      '.env.example': '',
      '.env.inte': 'A=1\nPORTAL_BASE_URL="https://inte-cloud.chanjet.com"\n',
      '.env.inte.example': 'PORTAL_BASE_URL=https://example\n',
      '.env.pre': '',
      'package.json': '{}',
    });
    assert.deepEqual(scanIntegrationTestEnvs(dir), [
      { id: '', label: '默认', hasLocalFile: true, fileName: '.env', portalBaseUrl: 'https://pre-test-cloud.chanjet.com' },
      { id: 'inte', label: 'inte', hasLocalFile: true, fileName: '.env.inte', portalBaseUrl: 'https://inte-cloud.chanjet.com' },
      { id: 'pre', label: 'pre', hasLocalFile: true, fileName: '.env.pre', portalBaseUrl: '' },
    ]);
  });

  it('只有 .example 时标记为不可用，门户地址取自 example', () => {
    const envs = scanIntegrationTestEnvs(makeProject({ '.env.test.example': 'PORTAL_BASE_URL=https://test-cloud.chanjet.com\n' }));
    assert.equal(envs[0].hasLocalFile, false);
    assert.deepEqual(envs[1], {
      id: 'test',
      label: 'test',
      hasLocalFile: false,
      fileName: '.env.test',
      portalBaseUrl: 'https://test-cloud.chanjet.com',
    });
  });
});

describe('integration-test case catalog scan', () => {
  it('按一级目录分组排序，聚合同一 spec 的场景标题，忽略非 spec 文件', () => {
    const dir = makeProject({
      'scenarios/index.json': JSON.stringify({
        scenarios: [
          { title: '多格复制', specPath: 'tests/browser/grid/Grid.copy.spec.ts' },
          { title: '单格复制', specPath: 'tests/browser/grid/Grid.copy.spec.ts' },
          { title: '单格复制', specPath: 'tests/browser/grid/Grid.copy.spec.ts' },
          { title: '销货单', specPath: '' },
        ],
      }),
      'tests/browser/grid/Grid.copy.spec.ts': '',
      'tests/browser/grid/Grid.sort.spec.ts': '',
      'tests/browser/grid/helpers.ts': '',
      'tests/browser/voucher-select/VoucherSelect.submit.spec.ts': '',
      'tests/browser/env/Env.probe.spec.ts': '',
      'tests/browser/fixtures.ts': '',
    });
    const groups = scanIntegrationTestCases(dir);
    assert.deepEqual(
      groups.map((g) => [g.suiteId, g.id, g.label, g.dirPath]),
      [
        ['portal', 'env', '环境探针', 'tests/browser/env'],
        ['portal', 'grid', 'Grid', 'tests/browser/grid'],
        ['portal', 'voucher-select', '选单', 'tests/browser/voucher-select'],
      ]
    );
    assert.deepEqual(groups[1].cases, [
      { specPath: 'tests/browser/grid/Grid.copy.spec.ts', fileName: 'Grid.copy.spec.ts', titles: ['多格复制', '单格复制'] },
      { specPath: 'tests/browser/grid/Grid.sort.spec.ts', fileName: 'Grid.sort.spec.ts', titles: [] },
    ]);
  });

  it('嵌套目录归入一级分组，根下 spec 归入末尾「其它」', () => {
    const groups = scanIntegrationTestCases(
      makeProject({ 'tests/browser/Root.spec.ts': '', 'tests/browser/grid/sub/Grid.nested.spec.ts': '' })
    );
    assert.deepEqual(groups.map((g) => g.id), ['grid', '']);
    assert.equal(groups[0].cases[0].specPath, 'tests/browser/grid/sub/Grid.nested.spec.ts');
    assert.equal(groups[1].dirPath, 'tests/browser');
  });

  it('同时扫描 tests/ui 套件，排在门户之后；UI 分组带 treeParentLabel，包名作第二层且同名目录不冲突', () => {
    const groups = scanIntegrationTestCases(
      makeProject({
        'scenarios/index.json': JSON.stringify({
          scenarios: [{ title: '按钮提示', specPath: 'tests/ui/button/Button.tipHover.spec.ts' }],
        }),
        'tests/browser/grid/Grid.sort.spec.ts': '',
        'tests/ui/button/Button.tipHover.spec.ts': '',
        'tests/ui/grid/Grid.render.spec.ts': '',
        'tests/ui/fixtures.ts': '',
      })
    );
    assert.deepEqual(
      groups.map((g) => [g.suiteId, g.label, g.treeParentLabel, g.dirPath]),
      [
        ['portal', 'Grid', '', 'tests/browser/grid'],
        ['ui', 'button', 'UI', 'tests/ui/button'],
        ['ui', 'grid', 'UI', 'tests/ui/grid'],
      ]
    );
    assert.deepEqual(groups[1].cases[0].titles, ['按钮提示']);
  });

  it('只有 tests/ui 时也能扫出用例', () => {
    const groups = scanIntegrationTestCases(makeProject({ 'tests/ui/modal/Modal.openBasic.spec.ts': '' }));
    assert.deepEqual(groups.map((g) => g.dirPath), ['tests/ui/modal']);
  });

  it('index.json 损坏时降级为无标题；无任何套件目录时返回空', () => {
    const broken = makeProject({ 'scenarios/index.json': '{ not json', 'tests/browser/grid/Grid.copy.spec.ts': '' });
    assert.deepEqual(scanIntegrationTestCases(broken)[0].cases[0].titles, []);
    assert.deepEqual(scanIntegrationTestCases(makeProject({ 'package.json': '{}' })), []);
  });
});
