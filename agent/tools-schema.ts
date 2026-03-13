/* AI 生成 By Peng.Guo */
export const toolsSchema = [
  {
    type: 'function' as const,
    function: {
      name: 'run_shell',
      description: '在本地执行 shell 命令，例如启动 docker、启动前端/后端项目',
      parameters: {
        type: 'object',
        required: ['command'],
        properties: { command: { type: 'string', description: '要执行的 shell 命令' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_browser',
      description: '在默认浏览器中打开指定 URL。用户说「打开 Jenkins」时传 Jenkins 的 URL',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: { url: { type: 'string', description: '要打开的完整 URL（如 https://jenkins.rd.chanjet.com/）' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_jenkins_job',
      description: '打开某项目对应的 Jenkins 任务页面。用户说「打开jenkins nova」「打开 Jenkins 的 cc-web」时使用；job=预定义 key（nova、cc-web、react18、base、base18、biz-solution、biz-guide、scm）',
      parameters: {
        type: 'object',
        required: ['job'],
        properties: { job: { type: 'string', description: '预定义项目代号，与部署代号一致' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'deploy_jenkins',
      description: '部署/构建某项目。用户说「部署nova」「部署nova 分支是sprint-260326」时：job=预定义 key（nova、cc-web、react18 等）或完整 Job 名；可选 branch=指定分支（如 sprint-260326），不传则用该项目默认分支',
      parameters: {
        type: 'object',
        required: ['job'],
        properties: {
          job: { type: 'string', description: '预定义 key 或完整 Jenkins Job 名' },
          branch: { type: 'string', description: '可选。指定部署分支，如 sprint-260326；用户说「分支是xxx」时必填' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_workflow',
      description: '执行工作流。「开始工作」→ name=start-work',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', description: 'start-work 或 standalone' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_workflow_step',
      description: '执行工作流单步。启动 cpxy/react18/base18/scm 等 → workflow=start-work 或 standalone，taskKey=对应 key',
      parameters: {
        type: 'object',
        required: ['workflow', 'taskKey'],
        properties: {
          workflow: { type: 'string', description: 'start-work 或 standalone' },
          taskKey: { type: 'string', description: 'cpxy/react18/base18/cc-web/biz-solution/uikit/shared/scm' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'merge_repo',
      description: '合并仓库。合并 nova/biz-solution/scm → repo=nova|biz-solution|scm',
      parameters: {
        type: 'object',
        required: ['repo'],
        properties: { repo: { type: 'string', description: 'nova、biz-solution 或 scm' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_in_ide',
      description: '用 IDE 打开项目。ws/cursor打开base → app=ws|cursor，code=项目代号。代号见 config/projects',
      parameters: {
        type: 'object',
        required: ['app', 'code'],
        properties: {
          app: { type: 'string', description: 'ws|webstorm|cursor|vscode|code' },
          code: { type: 'string', description: '项目代号，见 config/projects' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'close_ide_project',
      description: '关闭 IDE 中某项目窗口。关闭ws的nova → app=ws，code=nova。代号见 config/projects',
      parameters: {
        type: 'object',
        required: ['app', 'code'],
        properties: {
          app: { type: 'string', description: 'ws|webstorm|cursor|vscode|code' },
          code: { type: 'string', description: '项目代号，见 config/projects' },
        },
      },
    },
  },
];
