/* AI 生成 By Peng.Guo */
/**
 * 集成测试仓内的测试套件注册表：每个套件对应一个 tests 子目录 + 一份 Playwright 配置。
 * 新增套件只需在此登记，扫描与命令构建都从这里取。
 */

export interface IIntegrationTestSuite {
  id: string;
  /** 套件中文名，用于报告概况等展示 */
  label: string;
  /** 相对集成测试仓根目录的测试目录 */
  testsRoot: string;
  /** Playwright 配置文件；空串表示默认 playwright.config.ts */
  configFile: string;
  project: string;
  /** Playwright HTML 报告目录（相对集成测试仓根目录），与配置中 html reporter 的 outputFolder 一致 */
  reportDir: string;
  /** 是否使用门户登录环境（TEST_ENV / LOCAL_REMOTES 仅对此类套件生效） */
  usesPortalEnv: boolean;
  /** 分组标题前缀，用于区分不同套件的同名目录；有 treeParentLabel 时通常为空 */
  labelPrefix: string;
  /**
   * 用例树中的父层标题；非空时本套件各包名分组收拢到该父节点下
   * （第一层父节点 → 第二层包名 → 第三层组件用例）
   */
  treeParentLabel: string;
  /** 一级目录 → 中文标题；未登记的目录直接用目录名 */
  groupLabels: Readonly<Record<string, string>>;
}

export const INTEGRATION_TEST_SUITES: readonly IIntegrationTestSuite[] = [
  {
    id: 'portal',
    label: '门户',
    testsRoot: 'tests/browser',
    configFile: '',
    project: 'portal',
    reportDir: 'playwright-report',
    usesPortalEnv: true,
    labelPrefix: '',
    treeParentLabel: '',
    groupLabels: { grid: 'Grid', 'voucher-select': '选单', env: '环境探针', '': '其它' },
  },
  {
    id: 'ui',
    label: 'UI 组件',
    testsRoot: 'tests/ui',
    configFile: 'playwright.ui.config.ts',
    project: 'ui-kit',
    reportDir: 'playwright-report-ui',
    usesPortalEnv: false,
    labelPrefix: '',
    treeParentLabel: 'UI',
    groupLabels: { '': '其它' },
  },
];

export function findIntegrationTestSuite(id: string): IIntegrationTestSuite | undefined {
  return INTEGRATION_TEST_SUITES.find((s) => s.id === id);
}
