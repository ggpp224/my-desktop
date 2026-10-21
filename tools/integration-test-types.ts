/* AI 生成 By Peng.Guo */
/**
 * 「运行集成用例」类型：platform-front-integration-test 的环境、用例与运行选择。
 */

/** 执行环境（对应集成测试仓根目录 .env / .env.<name>） */
export interface IIntegrationTestEnv {
  /** TEST_ENV 取值；默认环境（仅加载 .env）为空串 */
  id: string;
  label: string;
  /** 本地是否已有实际 env 文件（只有 .example 时为 false，不可选） */
  hasLocalFile: boolean;
  /** 对应 env 文件名，如 `.env.inte` */
  fileName: string;
  /** 从 env 文件读到的 PORTAL_BASE_URL，读不到为空串 */
  portalBaseUrl: string;
}

/** 单个用例（一个 spec 文件） */
export interface IIntegrationTestCase {
  /** 相对集成测试仓根目录的 posix 路径，如 `tests/browser/grid/Grid.sort.spec.ts` */
  specPath: string;
  fileName: string;
  /** scenarios/index.json 中指向该 spec 的场景标题，可能为空 */
  titles: string[];
}

/** 用例分组（套件测试目录下的一级目录；根下 spec 归入 id 为空串的分组） */
export interface IIntegrationTestCaseGroup {
  /** 套件内一级目录名，不同套件间可能重名；全局唯一键用 dirPath */
  id: string;
  /** 所属套件，见 integration-test-suites.ts */
  suiteId: string;
  label: string;
  /**
   * 用例树父层标题；非空时前端将同值分组收拢到该父节点下
   * （如 UI 套件为 `UI`，形成 UI → 包名 → 组件）
   */
  treeParentLabel: string;
  /** 相对集成测试仓根目录的目录，如 `tests/browser/grid` */
  dirPath: string;
  cases: IIntegrationTestCase[];
}

/** 运行位置：远程走线上资源；本地设置 LOCAL_REMOTES=1 */
export type IntegrationTestRunMode = 'remote' | 'local';

/** 面板提交的运行选择 */
export interface IIntegrationTestSelection {
  env: string;
  mode: IntegrationTestRunMode;
  headless: boolean;
  specs: string[];
}

/** 构建运行命令的入参 */
export interface IBuildIntegrationTestCommandParams extends IIntegrationTestSelection {
  projectPath: string;
  groups: IIntegrationTestCaseGroup[];
}

/** 构建运行命令的结果 */
export type IntegrationTestCommandResult =
  | { ok: true; command: string; targets: string[] }
  | { ok: false; error: string };

/** 单个 spec 上次执行的汇总结论：任一用例失败即 failed；flaky（重试后通过）计为 passed */
export type IntegrationTestCaseOutcome = 'passed' | 'failed' | 'skipped';

/** 单个 spec 上次执行结果 */
export interface IIntegrationTestCaseResult {
  outcome: IntegrationTestCaseOutcome;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

/** 某个套件最近一份 HTML 报告的概况 */
export interface IIntegrationTestReportSummary {
  suiteId: string;
  suiteLabel: string;
  /** 报告 index.html 绝对路径 */
  reportPath: string;
  /** 报告开始时间（毫秒时间戳），读不到为 0 */
  startTime: number;
  /** 报告存在但解析失败时的原因，无则为空串 */
  error: string;
}

/** 各套件最近一次执行结果，按 specPath 索引 */
export interface IIntegrationTestLastResults {
  cases: Record<string, IIntegrationTestCaseResult>;
  reports: IIntegrationTestReportSummary[];
  error: string;
}

/** 面板初始化所需的用例目录 */
export interface IIntegrationTestCatalog {
  projectPath: string;
  projectExists: boolean;
  envs: IIntegrationTestEnv[];
  groups: IIntegrationTestCaseGroup[];
  /** 扫描失败或项目不可用的原因，无则为空串 */
  error: string;
}
