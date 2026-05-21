/* AI 生成 By Peng.Guo */
/**
 * workflows/*.json 预设流程目录：与 Agent run_workflow、侧栏 Workflow 面板、统计口径一致。
 * 合并、部署、Jira 等为独立工具指令，不计入本目录。
 */

export interface WorkflowCatalogItem {
  /** 工作流文件名（不含 .json） */
  name: string;
  label: string;
  desc: string;
  /** 是否支持 POST /workflow/:name/embedded 内嵌终端一键启动 */
  embedded?: boolean;
  /** 是否在侧栏 Workflow 面板展示入口 */
  showInPanel?: boolean;
}

export const WORKFLOW_CATALOG: readonly WorkflowCatalogItem[] = [
  {
    name: 'start-work',
    label: '开始工作',
    desc: '一键启动常用研发环境（内嵌终端）',
    embedded: true,
    showInPanel: true,
  },
  {
    name: 'start-work-external-terminal',
    label: '开始工作（外部终端）',
    desc: '一键启动常用研发环境（系统终端）',
    showInPanel: true,
  },
  {
    name: 'upgrade-react18-nova',
    label: '升级集测 react18 的 nova 版本',
    desc: '自动切 sprint、更新依赖并提交推送',
    showInPanel: true,
  },
  {
    name: 'upgrade-cc-web-nova',
    label: '升级集测 cc-web 的 nova 版本',
    desc: '自动切 sprint、更新依赖并提交推送',
    showInPanel: true,
  },
  {
    name: 'standalone',
    label: '启动 scm（standalone）',
    desc: '单独启动 scm 微应用（yarn dev）',
    showInPanel: true,
  },
] as const;

export function getWorkflowCatalog(): WorkflowCatalogItem[] {
  return [...WORKFLOW_CATALOG];
}

/** 侧栏 Workflow 面板展示项 */
export function getPanelWorkflowCatalog(): WorkflowCatalogItem[] {
  return WORKFLOW_CATALOG.filter((w) => w.showInPanel !== false);
}
