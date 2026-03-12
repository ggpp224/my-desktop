/* AI 生成 By Peng.Guo */
/**
 * 统一项目配置：代号、本地路径、Jenkins 任务、默认分支。
 * 便于扩展与维护，Jenkins 与项目一处维护。
 * 路径、Jenkins 任务名、默认分支、合并目标分支均来自 .env 常量，见 .cursor/rules/env-constants.mdc。
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

/** 项目列表：路径与 Jenkins/merge 均来自 .env 常量 */
const PROJECT_ENTRIES: ProjectEntry[] = [
  {
    codes: ['biz-guide'],
    path: process.env.PROJECT_PATH_BIZ_GUIDE!,
    jenkins: { jobName: process.env.JENKINS_JOB_BIZ_GUIDE!, defaultBranch: process.env.JENKINS_DEFAULT_BRANCH_PRETEST! },
    merge: { targetBranch: process.env.MERGE_TARGET_BRANCH_PRETEST!, runRelease: false },
  },
  {
    codes: ['biz-solution'],
    path: process.env.PROJECT_PATH_BIZ_SOLUTION!,
    jenkins: { jobName: process.env.JENKINS_JOB_BIZ_SOLUTION!, defaultBranch: process.env.JENKINS_DEFAULT_BRANCH_PRETEST! },
    merge: { targetBranch: process.env.MERGE_TARGET_BRANCH_PRETEST!, runRelease: false },
  },
  {
    codes: ['h5-biz-common'],
    path: process.env.PROJECT_PATH_H5_BIZ_COMMON!,
  },
  {
    codes: ['react18'],
    path: process.env.PROJECT_PATH_REACT18!,
    jenkins: { jobName: process.env.JENKINS_JOB_REACT18!, defaultBranch: process.env.JENKINS_DEFAULT_BRANCH_PRETEST! },
  },
  {
    codes: ['base'],
    path: process.env.PROJECT_PATH_BASE!,
    jenkins: { jobName: process.env.JENKINS_JOB_BASE!, defaultBranch: process.env.JENKINS_DEFAULT_BRANCH_PRETEST! },
  },
  {
    codes: ['base18'],
    path: process.env.PROJECT_PATH_BASE18!,
    jenkins: { jobName: process.env.JENKINS_JOB_BASE18!, defaultBranch: process.env.JENKINS_DEFAULT_BRANCH_PRETEST! },
  },
  {
    codes: ['cc-web-hkj'],
    path: process.env.PROJECT_PATH_CC_WEB_HKJ!,
  },
  {
    codes: ['scm'],
    path: process.env.PROJECT_PATH_SCM!,
    jenkins: { jobName: process.env.JENKINS_JOB_SCM!, defaultBranch: process.env.JENKINS_DEFAULT_BRANCH_PRETEST! },
    merge: { targetBranch: process.env.MERGE_TARGET_BRANCH_PRETEST!, runRelease: false },
  },
  {
    codes: ['scm18'],
    path: process.env.PROJECT_PATH_SCM18!,
  },
  {
    codes: ['cc-web'],
    path: process.env.PROJECT_PATH_CC_WEB!,
    jenkins: { jobName: process.env.JENKINS_JOB_CC_WEB!, defaultBranch: process.env.JENKINS_DEFAULT_BRANCH_PRETEST! },
  },
  {
    codes: ['cc-web2'],
    path: process.env.PROJECT_PATH_CC_WEB2!,
  },
  {
    codes: ['uikit'],
    path: process.env.PROJECT_PATH_UIKIT!,
  },
  {
    codes: ['shared'],
    path: process.env.PROJECT_PATH_SHARED!,
  },
  {
    codes: ['ai-import'],
    path: process.env.PROJECT_PATH_AI_IMPORT!,
  },
  {
    codes: ['uikit-compat'],
    path: process.env.PROJECT_PATH_UIKIT_COMPAT!,
  },
  {
    codes: ['cc-node'],
    path: process.env.PROJECT_PATH_CC_NODE!,
  },
  {
    codes: ['app-service'],
    path: process.env.PROJECT_PATH_APP_SERVICE!,
  },
  {
    codes: ['biz-framework'],
    path: process.env.PROJECT_PATH_BIZ_FRAMEWORK!,
  },
  {
    codes: ['front-entity'],
    path: process.env.PROJECT_PATH_FRONT_ENTITY!,
  },
  {
    codes: ['front-pub'],
    path: process.env.PROJECT_PATH_FRONT_PUB!,
  },
  {
    codes: ['evoui'],
    path: process.env.PROJECT_PATH_EVOUI!,
  },
  {
    codes: ['chanjet-grid'],
    path: process.env.PROJECT_PATH_CHANJET_GRID!,
  },
  {
    codes: ['nova-form'],
    path: process.env.PROJECT_PATH_NOVA_FORM!,
  },
  {
    codes: ['nova-grid'],
    path: process.env.PROJECT_PATH_NOVA_GRID!,
  },
  {
    codes: ['nova-server'],
    path: process.env.PROJECT_PATH_NOVA_SERVER!,
  },
  {
    codes: ['nova-ui'],
    path: process.env.PROJECT_PATH_NOVA_UI!,
  },
  {
    codes: ['chanjet-nova'],
    path: process.env.PROJECT_PATH_CHANJET_NOVA!,
  },
  {
    codes: ['nova', 'nova-next'],
    path: process.env.PROJECT_PATH_NOVA!,
    jenkins: { jobName: process.env.JENKINS_JOB_NOVA!, defaultBranch: process.env.JENKINS_DEFAULT_BRANCH_NOVA! },
    merge: { targetBranch: process.env.MERGE_TARGET_BRANCH_NOVA!, runRelease: true },
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

/** 有 Jenkins 配置的项目（用于部署快捷、API 预设） */
export function getProjectsWithJenkins(): ProjectEntry[] {
  return PROJECT_ENTRIES.filter((e) => e.jenkins);
}

/** 有 merge 配置的项目（用于合并接口） */
export function getProjectsWithMerge(): ProjectEntry[] {
  return PROJECT_ENTRIES.filter((e) => e.merge);
}
