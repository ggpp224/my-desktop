/* AI 生成 By Peng.Guo */
import type { HelpCodebook, HelpCommandItem } from '../../domain/help/models';

export function getHelpCommands(): HelpCommandItem[] {
  return [
    {
      section: '快速开始',
      command: '统计常用指令',
      description: '打开指令统计页签，以柱状图/饼图/折线图查看常用指令次数（默认最近 30 天，可选时间段）',
    },
    {
      section: '快速开始',
      command: 'md生成pdf',
      description: '打开 MD 生成 PDF 页签：选择或上传 .md，在同目录生成 GitLab 风格（含表格）的 PDF',
    },
    {
      section: '快速开始',
      command: '技术趋势（顶部页签）',
      description:
        '点击顶部「技术趋势」：聚合 GitHub/HN/Reddit 抓取 + LLM 解读；今日与中长周期（本月+半年度）独立刷新，SSE 进度',
    },
    {
      section: '快速开始',
      command: 'tun',
      description:
        '在系统终端启动 macostunmode（sing-box TUN）：cd 到 macostunmode 目录并 sudo ./macostunmode.sh；sudo 密码可在 .env 配置 MACOSTUNMODE_SUDO_PASSWORD',
    },
    {
      section: '快速开始',
      command: '开始工作',
      description: '一键启动常用开发环境（cpxy、react18、cc-web、biz-solution、uikit、shared、docker）',
    },
    {
      section: '快速开始',
      command: '开始工作，使用外部终端',
      description: '一键启动常用开发环境（系统终端分支，不影响原「开始工作」内嵌终端流程）',
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
      description:
        '自动切 sprint、更新依赖、提交并 push；反馈区以 Markdown 表格+JSON 代码块展示本地/远程 package.json 比对结果',
    },
    {
      section: '工作流',
      command: '升级集测cc-web的nova版本',
      description: '自动切 sprint、更新依赖、提交并 push，完成后切回原分支',
    },
    {
      section: '工作流',
      command: '升级集测react18的mdf-report版本',
      description:
        '自动切 sprint、将 @chanjet/mdf-biz-report-web 更新为对应 sprint 已发布版本、提交并 push',
    },
    {
      section: '工作流',
      command: '启动 cpxy / 启动 react18 / 启动 cc-web / 启动 biz-solution / 启动 uikit / 启动 shared',
      description: '执行 start-work 工作流中的对应步骤（多为 cd 项目目录后 yarn dev，系统终端）',
    },
    {
      section: '工作流',
      command: '启动 scm',
      description: '执行 standalone 工作流中的 scm 步骤（yarn dev）',
    },
    {
      section: '工作流',
      command: '启动 base / 启动 base18 / 启动 nova / 启动 mdf-ui / 启动 mdf-biz / 启动 mdf-report',
      description:
        '工作流未收录的项目：在 config/projects 对应目录执行开发命令（默认 yarn dev；mdf-ui、mdf-biz 为 yarn w；mdf-report 为 pnpm run dev）',
    },
    {
      section: '终端',
      command: '终端打开 react18 / 终端打开 cc-web2 / 终端打开 mdf-ui',
      description: '在「我的工作」中新建终端页签，目录来自 config/projects 与 .env 中的 PROJECT_PATH_*',
    },
    {
      section: '浏览器 / Wiki',
      command: '打开 Jenkins / 打开jenkins nova',
      description: '打开 Jenkins 首页或具体项目任务页面',
    },
    {
      section: '浏览器 / Wiki',
      command: '周报 / 打开周报 / 打开wiki周报',
      description: '用 WIKI_TOKEN 自动定位「最新季度 + 最新周报页」；失败时回退搜索页',
    },
    {
      section: '浏览器 / Wiki',
      command: '写周报',
      description: '先查本周已完成任务，再生成可直接粘贴的 Markdown 周报内容',
    },
    {
      section: '部署',
      command: '部署 nova / 部署 nova 集测 / 部署 cc-web / 部署 react18 / 部署 base / 部署 base18 / 部署 mdf-ui / 部署 mdf-biz / 部署 mdf-report',
      description:
        '触发 Jenkins 任务；nova、mdf-ui、mdf-biz、mdf-report 默认 test；部署 nova 集测使用 react18 最大 sprint 分支；可扩展到其它已配置项目代号',
    },
    {
      section: '合并',
      command: '合并 nova / 合并 nova 集测 / 合并 biz-solution / 合并 biz-solution 集测 / 合并 scm / 合并 mdf-ui / 合并 mdf-biz / 合并 mdf-report',
      description:
        '将当前分支合并到测试或集测分支；mdf-ui/mdf-biz/mdf-report 合并到 test（mdf-report 会执行 pnpm run release）；nova/biz-solution 集测合并到 react18 最大 sprint 分支',
    },
    {
      section: 'Jira',
      command: '我的bug / 我的任务 / 经办人bug / 经办人任务 / 待办bug / 处理中bug / 线上bug / 本周已完成任务',
      description:
        '按固定 JQL 查询；我的任务为经办人或开发人员是当前用户、全量未完成（不限迭代，不含缺陷）；经办人bug 为类型为缺陷且未解决，按修复版本升序；经办人任务同经办人bug但类型含任务/子任务/缺陷；待办bug 按当前日期落入的修复版本迭代、状态打开；处理中bug 同待办但状态为处理中，并标注当前用户是否已评论「已处理」；待办/处理中列表顶可切换前一/当前/下一迭代',
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
      'mdf-ui',
      'mdf-biz',
      'mdf-report',
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
    projectDevCmdOverrides: [
      { codes: ['mdf-ui', 'mdf-biz'], cmd: 'yarn w' },
      { codes: ['mdf-report'], cmd: 'pnpm run dev' },
    ],
  };
}
