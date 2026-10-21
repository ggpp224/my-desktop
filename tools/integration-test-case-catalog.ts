/* AI 生成 By Peng.Guo */
/**
 * 扫描集成测试仓各套件（tests/browser、tests/ui …）下的 spec，按一级目录（包名）分组，
 * 写入 treeParentLabel 供前端组装「父层 → 包名 → 组件」树，并用 scenarios/index.json 补中文标题。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { IIntegrationTestCase, IIntegrationTestCaseGroup } from './integration-test-types.js';
import { INTEGRATION_TEST_SUITES, type IIntegrationTestSuite } from './integration-test-suites.js';

const SPEC_SUFFIX = '.spec.ts';
const SCENARIO_INDEX_PATH = 'scenarios/index.json';

function walkSpecFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkSpecFiles(full));
    else if (entry.isFile() && entry.name.endsWith(SPEC_SUFFIX)) result.push(full);
  }
  return result;
}

/** 按 specPath 聚合场景标题；index.json 缺失或损坏时返回空表 */
function readTitlesBySpec(projectPath: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let scenarios: unknown;
  try {
    scenarios = JSON.parse(readFileSync(path.join(projectPath, SCENARIO_INDEX_PATH), 'utf8'))?.scenarios;
  } catch {
    return map;
  }
  if (!Array.isArray(scenarios)) return map;
  for (const s of scenarios as Array<{ specPath?: unknown; title?: unknown }>) {
    if (typeof s?.specPath !== 'string' || !s.specPath || typeof s.title !== 'string') continue;
    const titles = map.get(s.specPath) ?? [];
    if (!titles.includes(s.title)) titles.push(s.title);
    map.set(s.specPath, titles);
  }
  return map;
}

function scanSuite(
  projectPath: string,
  suite: IIntegrationTestSuite,
  titlesBySpec: Map<string, string[]>
): IIntegrationTestCaseGroup[] {
  const testsRoot = path.join(projectPath, suite.testsRoot);
  if (!existsSync(testsRoot)) return [];
  const casesByGroup = new Map<string, IIntegrationTestCase[]>();

  for (const file of walkSpecFiles(testsRoot)) {
    const segments = path.relative(testsRoot, file).split(path.sep);
    const groupId = segments.length > 1 ? segments[0] : '';
    const specPath = [suite.testsRoot, ...segments].join('/');
    const cases = casesByGroup.get(groupId) ?? [];
    cases.push({
      specPath,
      fileName: segments[segments.length - 1],
      titles: titlesBySpec.get(specPath) ?? [],
    });
    casesByGroup.set(groupId, cases);
  }

  return [...casesByGroup.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([id, cases]) => ({
      id,
      suiteId: suite.id,
      label: `${suite.labelPrefix}${suite.groupLabels[id] ?? id}`,
      treeParentLabel: suite.treeParentLabel,
      dirPath: id ? `${suite.testsRoot}/${id}` : suite.testsRoot,
      cases: cases.sort((a, b) => a.specPath.localeCompare(b.specPath)),
    }));
}

/** 按套件注册顺序输出分组；套件内一级目录排序，根下 spec 归入该套件末尾的「其它」 */
export function scanIntegrationTestCases(
  projectPath: string,
  suites: readonly IIntegrationTestSuite[] = INTEGRATION_TEST_SUITES
): IIntegrationTestCaseGroup[] {
  const titlesBySpec = readTitlesBySpec(projectPath);
  return suites.flatMap((suite) => scanSuite(projectPath, suite, titlesBySpec));
}
