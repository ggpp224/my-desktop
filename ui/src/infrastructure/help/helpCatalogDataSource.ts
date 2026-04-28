/* AI 生成 By Peng.Guo */
import type { HelpCodebook, HelpCommandItem } from '../../domain/help/models';

export function getHelpCommands(): HelpCommandItem[] {
  return [
    {
      section: '快速开始',
      command: '开始工作',
      description: '一键启动常用开发环境（cpxy、react18、cc-web、biz-solution、uikit、shared、docker）',
    },
    {
      section: '快速开始',
      command: '开始工作，使用外部终端',
      description: '一键启动常用开发环境（系统终端分支，不影响原“开始工作”内嵌终端流程）',
    },
    {
      section: '快速开始',
      command: '部署 nova 分支是 sprint-260326',
      description: '按指定分支触发 Jenkins 部署；不写分支时自动使用项目默认分支',
    },
    {
      section: '快速开始',
      command: 'cursor用量 / cursor今日用量 / 同步cursor登录态',
      description: '查询 Cursor 账户聚合用量、今日用量，并在需要时同步本机登录态',
    },
    {
      section: '工作流',
      command: '执行工作流 start-work / start-work-external-terminal / standalone',
      description: '按预设 workflow 顺序执行任务；支持内嵌终端或系统终端两种开工分支',
    },
    {
      section: '工作流',
      command: '升级集测react18的nova版本',
      description: '自动切 sprint、更新依赖、提交并 push，完成后切回原分支',
    },
    {
      section: '工作流',
      command: '升级集测cc-web的nova版本',
      description: '自动切 sprint、更新依赖、提交并 push，完成后切回原分支',
    },
    {
      section: '工作流',
      command: '启动 cpxy / 启动 react18 / 启动 cc-web / 启动 scm',
      description: '单独执行工作流中的某一步，适合局部调试',
    },
    {
      section: '终端',
      command: '终端打开 react18 / 终端打开 cc-web2 / 终端打开 nova',
      description: '在「我的工作」中新建终端页签，目录来自 config/projects 与环境配置',
    },
    {
      section: '浏览器 / Wiki',
      command: '打开 Jenkins / 打开jenkins nova',
      description: '打开 Jenkins 首页或具体项目任务页面',
    },
    {
      section: '浏览器 / Wiki',
      command: '周报 / 打开周报 / 打开wiki周报',
      description: '用 WIKI_TOKEN 自动定位“最新季度 + 最新周报页”；失败时回退搜索页',
    },
    {
      section: '浏览器 / Wiki',
      command: '写周报',
      description: '先查本周已完成任务，再生成可直接粘贴的 Markdown 周报内容',
    },
    {
      section: '部署',
      command: '部署 nova / 部署 cc-web / 部署 react18 / 部署 base / 部署 base18',
      description: '触发 Jenkins 任务；可扩展到其它已配置项目代号',
    },
    {
      section: '合并',
      command: '合并 nova / 合并 biz-solution / 合并 scm',
      description: '将当前分支合并到预设测试分支（并按项目策略执行后续步骤）',
    },
    {
      section: 'Jira',
      command: '我的bug / 线上bug / 本周已完成任务',
      description: '按固定 JQL 查询任务并按 updated 倒序返回',
    },
    {
      section: 'Cursor',
      command: 'cursor用量 / 查询cursor用量',
      description: '调用 Cursor Dashboard 聚合用量接口，返回账户总览',
    },
    {
      section: 'Cursor',
      command: 'cursor今日用量 / 查询cursor今日用量',
      description: '调用 Cursor Dashboard 当日筛选接口，返回当天用量',
    },
    {
      section: 'Cursor',
      command: '同步cursor登录态',
      description: '自动读取本机 Chrome 的 cursor.com Cookie 并注入服务内存',
    },
    {
      section: 'IDE 打开',
      command: 'ws打开base / cursor打开scm / 用 WebStorm 打开 nova',
      description: '按应用别名打开项目：ws=WebStorm，cursor=Cursor，code/vscode=VS Code',
    },
    {
      section: 'IDE 关闭',
      command: '关闭ws的nova / 关闭cursor的base / 关闭 WebStorm 的 scm',
      description: '关闭对应 IDE 中已打开项目窗口（WebStorm 菜单关闭，Cursor/VS Code 用 Cmd+W）',
    },
    {
      section: '知识库',
      command: '添加私人知识库 / 重建知识库索引 / 增量重建知识库索引 / 清除私人知识库',
      description: '导入 Markdown 到私人知识库，并支持增量或全量重建与清理',
    },
    {
      section: '其他',
      command: '打开 https://… / 执行 xxx 命令',
      description: '通用意图：自动调用浏览器或 Shell 工具执行动作',
    },
  ];
}

export function getHelpCodebook(): HelpCodebook {
  return {
    projectCodes: [
      'cpxy',
      'react18',
      'cc-web',
      'cc-web2',
      'biz-solution',
      'biz-guide',
      'uikit',
      'shared',
      'scm',
      'scm18',
      'nova',
      'nova-next',
      'base',
      'base18',
      'ai-import',
      'uikit-compat',
      'cc-node',
      'app-service',
      'biz-framework',
      'front-entity',
      'front-pub',
      'evoui',
      'chanjet-grid',
      'nova-form',
      'nova-grid',
      'nova-server',
      'nova-ui',
      'chanjet-nova',
      'h5-biz-common',
      'cc-web-hkj',
    ],
    ideAliases: ['ws / webstorm -> WebStorm', 'cursor -> Cursor', 'code / vscode -> VS Code'],
  };
}
