/* AI 生成 By Peng.Guo */
export const toolsSchema = [
  {
    type: 'function' as const,
    function: {
      name: 'run_shell',
      description: '在本地执行 shell 命令，例如启动 docker、启动项目等',
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
      name: 'deploy_jenkins',
      description: '当用户表达要部署、发布、构建某项目时使用。job 为预定义 key：nova、cc-web、react18、biz-solution、biz-guide、scm、base、base18；或传入完整 Jenkins Job 名称',
      parameters: {
        type: 'object',
        required: ['job'],
        properties: { job: { type: 'string', description: '预定义 key（nova/cc-web/react18/biz-solution/biz-guide/scm/base/base18）或完整 Jenkins Job 名称' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_workflow',
      description: '执行预定义工作流。用户说「开始工作」时传 name=start-work，会依次启动 cpxy、react18、cc-web 等并启动 docker',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', description: '工作流名称，如 start-work（对应 workflows/start-work.json）' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_workflow_step',
      description: '执行工作流中的单步。当用户说「启动 cpxy」「启动 react18」「启动 scm」等时使用。workflow：start-work 或 standalone；taskKey：cpxy、react18、cc-web、biz-solution、uikit、shared（start-work）或 scm（standalone）',
      parameters: {
        type: 'object',
        required: ['workflow', 'taskKey'],
        properties: {
          workflow: { type: 'string', description: '工作流名：start-work 或 standalone' },
          taskKey: { type: 'string', description: '步骤 key：cpxy/react18/cc-web/biz-solution/uikit/shared 或 scm' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'merge_repo',
      description: '执行指定仓库的合并流程。当用户说「合并 nova」「合并 biz-solution」「合并 scm」时使用',
      parameters: {
        type: 'object',
        required: ['repo'],
        properties: { repo: { type: 'string', description: '仓库：nova、biz-solution 或 scm' } },
      },
    },
  },
];
