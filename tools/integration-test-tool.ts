/* AI 生成 By Peng.Guo */
/**
 * 「运行集成用例」应用服务：读取用例目录、预览命令、在系统终端运行 platform-front-integration-test。
 */
import { existsSync, statSync } from 'node:fs';
import { config } from '../config/default.js';
import { runInTerminal } from './shell-tool.js';
import { scanIntegrationTestCases } from './integration-test-case-catalog.js';
import { buildIntegrationTestCommand } from './integration-test-command.js';
import { scanIntegrationTestEnvs } from './integration-test-env-catalog.js';
import { readIntegrationTestLastResults } from './integration-test-last-results.js';
import { INTEGRATION_TEST_SUITES } from './integration-test-suites.js';
import type {
  IIntegrationTestCatalog,
  IIntegrationTestLastResults,
  IIntegrationTestSelection,
  IntegrationTestCommandResult,
} from './integration-test-types.js';

export interface IRunIntegrationTestsDeps {
  projectPath?: string;
  openTerminal?: (command: string) => Promise<void>;
}

export type RunIntegrationTestsResult =
  | { success: true; command: string; targets: string[] }
  | { success: false; error: string };

function defaultProjectPath(): string {
  return config.integrationTest.projectPath;
}

/** 只取请求体中的已知字段并收敛类型 */
export function parseIntegrationTestSelection(raw: unknown): IIntegrationTestSelection {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    env: typeof o.env === 'string' ? o.env : '',
    mode: o.mode === 'local' ? 'local' : 'remote',
    headless: o.headless === true,
    specs: Array.isArray(o.specs) ? o.specs.filter((s): s is string => typeof s === 'string') : [],
  };
}

export function getIntegrationTestCatalog(projectPath = defaultProjectPath()): IIntegrationTestCatalog {
  const catalog: IIntegrationTestCatalog = {
    projectPath,
    projectExists: Boolean(projectPath) && existsSync(projectPath) && statSync(projectPath).isDirectory(),
    envs: [],
    groups: [],
    error: '',
  };
  if (!catalog.projectExists) {
    catalog.error = projectPath
      ? `集成测试项目目录不存在：${projectPath}`
      : '未配置集成测试项目路径，请在 .env 设置 INTEGRATION_TEST_PROJECT_PATH';
    return catalog;
  }
  try {
    catalog.envs = scanIntegrationTestEnvs(projectPath);
    catalog.groups = scanIntegrationTestCases(projectPath);
    if (!catalog.groups.length) {
      const roots = INTEGRATION_TEST_SUITES.map((s) => s.testsRoot).join('、');
      catalog.error = `未在 ${roots} 下找到 *.spec.ts 用例`;
    }
  } catch (err) {
    catalog.error = `扫描集成测试项目失败：${err instanceof Error ? err.message : String(err)}`;
  }
  return catalog;
}

export function previewIntegrationTestCommand(
  selection: IIntegrationTestSelection,
  projectPath = defaultProjectPath()
): IntegrationTestCommandResult {
  const catalog = getIntegrationTestCatalog(projectPath);
  if (!catalog.projectExists) return { ok: false, error: catalog.error };
  return buildIntegrationTestCommand({ ...selection, projectPath, groups: catalog.groups });
}

/** 读取各套件最近一份 HTML 报告中的执行结果 */
export function getIntegrationTestLastResults(projectPath = defaultProjectPath()): IIntegrationTestLastResults {
  const catalog = getIntegrationTestCatalog(projectPath);
  if (!catalog.projectExists) return { cases: {}, reports: [], error: catalog.error };
  return readIntegrationTestLastResults(projectPath);
}

/** 在系统终端（Terminal.app 新窗口或新页签）中运行所选用例 */
export async function runIntegrationTests(
  selection: IIntegrationTestSelection,
  deps: IRunIntegrationTestsDeps = {}
): Promise<RunIntegrationTestsResult> {
  const result = previewIntegrationTestCommand(selection, deps.projectPath ?? defaultProjectPath());
  if (!result.ok) return { success: false, error: result.error };
  await (deps.openTerminal ?? runInTerminal)(result.command);
  return { success: true, command: result.command, targets: result.targets };
}
