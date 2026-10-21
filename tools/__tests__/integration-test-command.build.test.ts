/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIntegrationTestCommand, shellQuote } from '../integration-test-command.js';
import type { IBuildIntegrationTestCommandParams, IIntegrationTestCaseGroup } from '../integration-test-types.js';

const groups: IIntegrationTestCaseGroup[] = [
  {
    id: 'grid',
    suiteId: 'portal',
    label: 'Grid',
    treeParentLabel: '',
    dirPath: 'tests/browser/grid',
    cases: [
      { specPath: 'tests/browser/grid/Grid.showDetail.spec.ts', fileName: 'Grid.showDetail.spec.ts', titles: [] },
      { specPath: 'tests/browser/grid/Grid.sort.spec.ts', fileName: 'Grid.sort.spec.ts', titles: [] },
    ],
  },
  {
    id: 'env',
    suiteId: 'portal',
    label: '环境探针',
    treeParentLabel: '',
    dirPath: 'tests/browser/env',
    cases: [{ specPath: 'tests/browser/env/Env.probe.spec.ts', fileName: 'Env.probe.spec.ts', titles: [] }],
  },
  {
    id: '',
    suiteId: 'portal',
    label: '其它',
    treeParentLabel: '',
    dirPath: 'tests/browser',
    cases: [{ specPath: 'tests/browser/Root.spec.ts', fileName: 'Root.spec.ts', titles: [] }],
  },
  {
    id: 'button',
    suiteId: 'ui',
    label: 'button',
    treeParentLabel: 'UI',
    dirPath: 'tests/ui/button',
    cases: [
      { specPath: 'tests/ui/button/Button.tipHover.spec.ts', fileName: 'Button.tipHover.spec.ts', titles: [] },
      { specPath: 'tests/ui/button/Button.click.spec.ts', fileName: 'Button.click.spec.ts', titles: [] },
    ],
  },
];

const SORT_SPEC = 'tests/browser/grid/Grid.sort.spec.ts';
const BUTTON_SPEC = 'tests/ui/button/Button.tipHover.spec.ts';

function params(overrides: Partial<IBuildIntegrationTestCommandParams>): IBuildIntegrationTestCommandParams {
  return { projectPath: '/tmp/it project', env: '', mode: 'remote', headless: false, specs: [], groups, ...overrides };
}

describe('integration-test-command build', () => {
  it('默认环境 + 远程：只带 playwright 参数，路径单引号转义', () => {
    assert.deepEqual(buildIntegrationTestCommand(params({ specs: [SORT_SPEC] })), {
      ok: true,
      command: `cd '/tmp/it project' && pnpm exec playwright test --project=portal '${SORT_SPEC}'`,
      targets: [SORT_SPEC],
    });
  });

  it('指定环境、本地、无头时依次带上 TEST_ENV / LOCAL_REMOTES / PW_HEADLESS', () => {
    const r = buildIntegrationTestCommand(params({ env: 'inte', mode: 'local', headless: true, specs: [SORT_SPEC] }));
    assert.ok(r.ok);
    assert.match(r.command, /&& TEST_ENV=inte LOCAL_REMOTES=1 PW_HEADLESS=1 pnpm exec playwright test /);
  });

  it('整组全选收敛为目录，部分选中保留 spec，并按分组顺序输出', () => {
    const r = buildIntegrationTestCommand(
      params({
        specs: ['tests/browser/env/Env.probe.spec.ts', 'tests/browser/grid/Grid.showDetail.spec.ts', SORT_SPEC],
      })
    );
    assert.ok(r.ok);
    assert.deepEqual(r.targets, ['tests/browser/grid', 'tests/browser/env']);
  });

  it('tests/browser 根下的分组全选也不收敛为根目录', () => {
    const r = buildIntegrationTestCommand(params({ specs: ['tests/browser/Root.spec.ts'] }));
    assert.ok(r.ok);
    assert.deepEqual(r.targets, ['tests/browser/Root.spec.ts']);
  });

  it('UI 套件用独立配置与 ui-kit project，忽略门户的 TEST_ENV / LOCAL_REMOTES', () => {
    const r = buildIntegrationTestCommand(
      params({ env: 'inte', mode: 'local', headless: true, specs: [BUTTON_SPEC] })
    );
    assert.deepEqual(r, {
      ok: true,
      command: `cd '/tmp/it project' && PW_HEADLESS=1 pnpm exec playwright test -c 'playwright.ui.config.ts' --project=ui-kit '${BUTTON_SPEC}'`,
      targets: [BUTTON_SPEC],
    });
  });

  it('同时选中门户与 UI 用例时按套件拆成两条命令顺序执行', () => {
    const r = buildIntegrationTestCommand(
      params({ env: 'pre', specs: [SORT_SPEC, BUTTON_SPEC, 'tests/ui/button/Button.click.spec.ts'] })
    );
    assert.ok(r.ok);
    assert.equal(
      r.command,
      `cd '/tmp/it project' && { TEST_ENV=pre pnpm exec playwright test --project=portal '${SORT_SPEC}' ; ` +
        `pnpm exec playwright test -c 'playwright.ui.config.ts' --project=ui-kit 'tests/ui/button' ; }`
    );
    assert.deepEqual(r.targets, [SORT_SPEC, 'tests/ui/button']);
  });

  it('分组指向未登记的套件时报错', () => {
    const r = buildIntegrationTestCommand(
      params({ specs: [SORT_SPEC], groups: [{ ...groups[0], suiteId: 'ghost' }] })
    );
    assert.deepEqual(r, { ok: false, error: '未知的测试套件：ghost' });
  });

  it('未选用例 / 未配置项目路径时报错', () => {
    assert.deepEqual(buildIntegrationTestCommand(params({})), { ok: false, error: '请至少选择一个用例' });
    assert.equal(buildIntegrationTestCommand(params({ projectPath: '', specs: [SORT_SPEC] })).ok, false);
  });

  it('拒绝不在扫描结果中的 spec', () => {
    const r = buildIntegrationTestCommand(params({ specs: ['tests/browser/grid/Missing.spec.ts'] }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /Missing\.spec\.ts/);
  });

  it('拒绝可注入 shell 的环境名与非法运行位置', () => {
    assert.equal(buildIntegrationTestCommand(params({ env: 'inte; rm -rf ~', specs: [SORT_SPEC] })).ok, false);
    assert.equal(
      buildIntegrationTestCommand(params({ mode: 'cloud' as unknown as 'remote', specs: [SORT_SPEC] })).ok,
      false
    );
  });

  it('shellQuote 转义内部单引号', () => {
    assert.equal(shellQuote("a b'c"), "'a b'\\''c'");
  });
});
