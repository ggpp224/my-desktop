/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  getIntegrationTestCatalog,
  parseIntegrationTestSelection,
  runIntegrationTests,
} from '../integration-test-tool.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'adc-it-run-'));
  mkdirSync(path.join(dir, 'tests/browser/grid'), { recursive: true });
  writeFileSync(path.join(dir, 'tests/browser/grid/Grid.sort.spec.ts'), '');
  writeFileSync(path.join(dir, '.env'), '');
  return dir;
}

describe('integration-test-tool run', () => {
  it('合法选择：在终端执行构建出的命令', async () => {
    const projectPath = makeProject();
    const opened: string[] = [];
    const result = await runIntegrationTests(
      { env: '', mode: 'local', headless: false, specs: ['tests/browser/grid/Grid.sort.spec.ts'] },
      { projectPath, openTerminal: async (cmd) => void opened.push(cmd) }
    );
    assert.equal(result.success, true);
    assert.equal(opened.length, 1);
    assert.match(opened[0], /LOCAL_REMOTES=1 pnpm exec playwright test --project=portal 'tests\/browser\/grid'$/);
  });

  it('非法选择：不打开终端并返回错误', async () => {
    const opened: string[] = [];
    const result = await runIntegrationTests(
      { env: '', mode: 'remote', headless: false, specs: [] },
      { projectPath: makeProject(), openTerminal: async (cmd) => void opened.push(cmd) }
    );
    assert.deepEqual(result, { success: false, error: '请至少选择一个用例' });
    assert.equal(opened.length, 0);
  });

  it('项目目录不存在或未配置时，目录接口返回错误说明', () => {
    const missing = getIntegrationTestCatalog(path.join(tmpdir(), 'adc-it-missing-dir'));
    assert.equal(missing.projectExists, false);
    assert.match(missing.error, /不存在/);
    assert.match(getIntegrationTestCatalog('').error, /INTEGRATION_TEST_PROJECT_PATH/);
  });

  it('parseIntegrationTestSelection 只保留已知字段并收敛类型', () => {
    assert.deepEqual(parseIntegrationTestSelection({ env: 'inte', mode: 'x', headless: 'yes', specs: ['a', 1], extra: 1 }), {
      env: 'inte',
      mode: 'remote',
      headless: false,
      specs: ['a'],
    });
    assert.deepEqual(parseIntegrationTestSelection(null), { env: '', mode: 'remote', headless: false, specs: [] });
  });
});
