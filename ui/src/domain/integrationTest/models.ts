/* AI 生成 By Peng.Guo */
/** 与后端 tools/integration-test-types.ts 的接口响应保持一致 */

export type IntegrationTestEnv = {
  id: string;
  label: string;
  hasLocalFile: boolean;
  fileName: string;
  portalBaseUrl: string;
};

export type IntegrationTestCase = {
  specPath: string;
  fileName: string;
  titles: string[];
};

export type IntegrationTestCaseGroup = {
  id: string;
  suiteId: string;
  label: string;
  /** 非空时用例树将该套件分组收拢到此父层下（如 `UI`） */
  treeParentLabel: string;
  dirPath: string;
  cases: IntegrationTestCase[];
};

export type IntegrationTestRunMode = 'remote' | 'local';

export type IntegrationTestSelection = {
  env: string;
  mode: IntegrationTestRunMode;
  headless: boolean;
  specs: string[];
};

export type IntegrationTestCatalog = {
  projectPath: string;
  projectExists: boolean;
  envs: IntegrationTestEnv[];
  groups: IntegrationTestCaseGroup[];
  error: string;
};

export type IntegrationTestCaseOutcome = 'passed' | 'failed' | 'skipped';

export type IntegrationTestCaseResult = {
  outcome: IntegrationTestCaseOutcome;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
};

export type IntegrationTestReportSummary = {
  suiteId: string;
  suiteLabel: string;
  reportPath: string;
  startTime: number;
  error: string;
};

export type IntegrationTestLastResults = {
  cases: Record<string, IntegrationTestCaseResult>;
  reports: IntegrationTestReportSummary[];
  error: string;
};

export type IntegrationTestCommandPreview =
  | { ok: true; command: string; targets: string[] }
  | { ok: false; error: string };

export type IntegrationTestRunResponse =
  | { success: true; command: string; targets: string[] }
  | { success: false; error: string };
