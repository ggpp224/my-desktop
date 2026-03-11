/* AI 生成 By Peng.Guo */
/**
 * 统一项目配置：代号、本地路径、Jenkins 任务、默认分支。
 * 便于扩展与维护，Jenkins 与项目一处维护。
 */

export interface ProjectJenkins {
  /** Jenkins 任务名（与 Jenkins 任务 URL 中 /job/ 后一致） */
  jobName: string;
  /** 部署的默认分支（后续也可指定分支） */
  defaultBranch: string;
}

export interface ProjectMerge {
  /** 合并目标分支 */
  targetBranch: string;
  /** 是否执行 pnpm run release */
  runRelease: boolean;
}

export interface ProjectEntry {
  /** 代号，可以有多个（用逗号分割的会解析为数组） */
  codes: string[];
  /** 项目本地目录地址 */
  path: string;
  /** Jenkins 部署配置（可选） */
  jenkins?: ProjectJenkins;
  /** 合并到测试分支的配置（可选，用于 merge 接口） */
  merge?: ProjectMerge;
}

/** 项目列表：代号 -> 本地路径 + 可选 Jenkins/merge */
const PROJECT_ENTRIES: ProjectEntry[] = [
  {
    codes: ['biz-guide'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/biz-solution-dev-guide',
    jenkins: { jobName: 'BUILD-to-HSY_PRETEST_biz-solution-dev-guide', defaultBranch: 'test-260127' },
    merge: { targetBranch: 'test-260127', runRelease: false },
  },
  {
    codes: ['biz-solution'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/biz-solution',
    jenkins: { jobName: 'BUILD-to-HSY_PRETEST_biz-solution', defaultBranch: 'test-260127' },
    merge: { targetBranch: 'test-260127', runRelease: false },
  },
  {
    codes: ['h5-biz-common'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/cc-h5-biz-common',
  },
  {
    codes: ['react18'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/react18-antd5-mobx6',
    jenkins: { jobName: 'BUILD-to-HSY_PRETEST_react18-antd5-mobx6', defaultBranch: 'test-260127' },
  },
  {
    codes: ['base'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/saas-cc-web-base',
    jenkins: { jobName: 'BUILD-to-HSY_PRETEST_saas-cc-web-base', defaultBranch: 'test-260127' },
  },
  {
    codes: ['base18'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/saas-cc-web-base18',
    jenkins: { jobName: 'BUILD-to-HKJ_DEV_saas-cc-web-base18', defaultBranch: 'test-260127' },
  },
  {
    codes: ['cc-web-hkj'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/saas-cc-web-hkj',
  },
  {
    codes: ['scm'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/saas-cc-web-scm',
    jenkins: { jobName: 'BUILD-to-HSY_PRETEST__saas-cc-web-scm', defaultBranch: 'test-260127' },
    merge: { targetBranch: 'test-260127', runRelease: false },
  },
  {
    codes: ['scm18'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/saas-cc-web-scm18',
  },
  {
    codes: ['cc-web'],
    path: '/Users/guopeng/disk/cc-web/micro-apps/saas-cc-web',
    jenkins: { jobName: 'BUILD-to-HSY_PRETEST_saas-cc-web', defaultBranch: 'test-260127' },
  },
  {
    codes: ['cc-web2'],
    path: '/Users/guopeng/disk/cc-web/saas-cc-web-2',
  },
  {
    codes: ['uikit'],
    path: '/Users/guopeng/disk/cc-web/packages/nova-next/packages/uikit',
  },
  {
    codes: ['shared'],
    path: '/Users/guopeng/disk/cc-web/packages/nova-next/packages/shared',
  },
  {
    codes: ['ai-import'],
    path: '/Users/guopeng/disk/cc-web/packages/nova-next/packages/intelligent-import',
  },
  {
    codes: ['uikit-compat'],
    path: '/Users/guopeng/disk/cc-web/packages/nova-next/packages/uikit-compat',
  },
  {
    codes: ['cc-node'],
    path: '/Users/guopeng/disk/cc-web/saas-cc-node',
  },
  {
    codes: ['app-service'],
    path: '/Users/guopeng/disk/cc-web/packages/cc-front-biz-app-service',
  },
  {
    codes: ['biz-framework'],
    path: '/Users/guopeng/disk/cc-web/packages/cc-front-biz-framework',
  },
  {
    codes: ['front-entity'],
    path: '/Users/guopeng/disk/cc-web/packages/cc-front-entity',
  },
  {
    codes: ['front-pub'],
    path: '/Users/guopeng/disk/cc-web/packages/cc-front-pub-declaration',
  },
  {
    codes: ['evoui'],
    path: '/Users/guopeng/disk/cc-web/packages/chanjet-evoui',
  },
  {
    codes: ['chanjet-grid'],
    path: '/Users/guopeng/disk/cc-web/packages/chanjet-grid',
  },
  {
    codes: ['nova-form'],
    path: '/Users/guopeng/disk/cc-web/packages/chanjet-nova-form',
  },
  {
    codes: ['nova-grid'],
    path: '/Users/guopeng/disk/cc-web/packages/chanjet-nova-grid',
  },
  {
    codes: ['nova-server'],
    path: '/Users/guopeng/disk/cc-web/packages/chanjet-nova-server',
  },
  {
    codes: ['nova-ui'],
    path: '/Users/guopeng/disk/cc-web/packages/chanjet-nova-ui',
  },
  {
    codes: ['chanjet-nova'],
    path: '/Users/guopeng/disk/cc-web/packages/chanjet-nova',
  },
  {
    codes: ['nova', 'nova-next'],
    path: '/Users/guopeng/disk/cc-web/packages/nova-next',
    jenkins: { jobName: 'BUILD-to-CNPM__nova_nova-next', defaultBranch: 'test' },
    merge: { targetBranch: 'test', runRelease: true },
  },
];

/** 代号 -> 项目条目（任一代号均可查） */
const CODE_TO_ENTRY = new Map<string, ProjectEntry>();
for (const entry of PROJECT_ENTRIES) {
  for (const code of entry.codes) {
    const key = code.trim().toLowerCase();
    if (key && !CODE_TO_ENTRY.has(key)) CODE_TO_ENTRY.set(key, entry);
  }
}

/** 按代号查项目（代号不区分大小写） */
export function getProjectByCode(code: string): ProjectEntry | null {
  const key = (code ?? '').trim().toLowerCase();
  return key ? CODE_TO_ENTRY.get(key) ?? null : null;
}

/** 按代号查本地路径 */
export function getProjectPath(code: string): string | null {
  const p = getProjectByCode(code);
  return p ? p.path : null;
}

/** 所有项目列表（用于展示/扩展） */
export function getAllProjects(): ProjectEntry[] {
  return [...PROJECT_ENTRIES];
}

/** 有 Jenkins 配置的项目（用于部署快捷等） */
export function getProjectsWithJenkins(): ProjectEntry[] {
  return PROJECT_ENTRIES.filter((e) => e.jenkins);
}

/** 有 merge 配置的项目（用于合并接口） */
export function getProjectsWithMerge(): ProjectEntry[] {
  return PROJECT_ENTRIES.filter((e) => e.merge);
}
