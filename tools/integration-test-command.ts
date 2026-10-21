/* AI 生成 By Peng.Guo */
/**
 * 根据面板选择生成在系统终端执行的 Playwright 命令（纯函数）。
 */
import type {
  IBuildIntegrationTestCommandParams,
  IIntegrationTestCaseGroup,
  IntegrationTestCommandResult,
} from './integration-test-types.js';
import { findIntegrationTestSuite, type IIntegrationTestSuite } from './integration-test-suites.js';

const ENV_ID_PATTERN = /^[A-Za-z0-9_-]*$/;

/** POSIX shell 单引号转义 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

interface ISuiteTargets {
  suite: IIntegrationTestSuite;
  targets: string[];
}

/**
 * 整组被选中时用目录替代组内 spec；套件根下的分组不收敛，避免误跑全量。
 * 按套件聚合，输出顺序与 groups 一致。
 */
function collectSuiteTargets(
  selected: Set<string>,
  groups: IIntegrationTestCaseGroup[]
): { ok: true; value: ISuiteTargets[] } | { ok: false; error: string } {
  const bySuite = new Map<string, ISuiteTargets>();
  for (const group of groups) {
    const picked = group.cases.filter((c) => selected.has(c.specPath));
    if (!picked.length) continue;
    const suite = findIntegrationTestSuite(group.suiteId);
    if (!suite) return { ok: false, error: `未知的测试套件：${group.suiteId}` };
    const entry = bySuite.get(suite.id) ?? { suite, targets: [] };
    if (group.id && picked.length === group.cases.length) entry.targets.push(group.dirPath);
    else entry.targets.push(...picked.map((c) => c.specPath));
    bySuite.set(suite.id, entry);
  }
  return { ok: true, value: [...bySuite.values()] };
}

function buildSuiteCommand(
  { suite, targets }: ISuiteTargets,
  { env, mode, headless }: Pick<IBuildIntegrationTestCommandParams, 'env' | 'mode' | 'headless'>
): string {
  const envVars = [
    suite.usesPortalEnv && env ? `TEST_ENV=${env}` : '',
    suite.usesPortalEnv && mode === 'local' ? 'LOCAL_REMOTES=1' : '',
    headless ? 'PW_HEADLESS=1' : '',
  ].filter(Boolean);
  return [
    ...envVars,
    'pnpm exec playwright test',
    suite.configFile ? `-c ${shellQuote(suite.configFile)}` : '',
    `--project=${suite.project}`,
    ...targets.map(shellQuote),
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildIntegrationTestCommand(params: IBuildIntegrationTestCommandParams): IntegrationTestCommandResult {
  const { projectPath, env, mode, specs, groups } = params;
  if (!projectPath) return { ok: false, error: '未配置集成测试项目路径（INTEGRATION_TEST_PROJECT_PATH）' };
  if (!ENV_ID_PATTERN.test(env)) return { ok: false, error: `非法的执行环境：${env}` };
  if (mode !== 'remote' && mode !== 'local') return { ok: false, error: `非法的运行位置：${String(mode)}` };
  if (!specs.length) return { ok: false, error: '请至少选择一个用例' };

  const known = new Set(groups.flatMap((g) => g.cases.map((c) => c.specPath)));
  const unknown = specs.filter((s) => !known.has(s));
  if (unknown.length) return { ok: false, error: `用例不存在或已被删除，请刷新：${unknown.join(', ')}` };

  const collected = collectSuiteTargets(new Set(specs), groups);
  if (!collected.ok) return collected;
  const runs = collected.value.map((entry) => buildSuiteCommand(entry, params));
  /** 多套件顺序执行，前一个失败不影响后一个 */
  const body = runs.length === 1 ? runs[0] : `{ ${runs.join(' ; ')} ; }`;

  return {
    ok: true,
    command: `cd ${shellQuote(projectPath)} && ${body}`,
    targets: collected.value.flatMap((e) => e.targets),
  };
}
