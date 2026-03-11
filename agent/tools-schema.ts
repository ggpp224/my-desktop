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
      description: '执行预定义工作流。用户说「开始工作」时传 name=start-work，会依次启动 cpxy、react18、cc-web、biz-solution、uikit、shared 并启动 docker',
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
      description: '执行工作流中的单步。当用户说「启动 cpxy」「启动 react18」「启动 cc-web」「启动 biz-solution」「启动 uikit」「启动 shared」「启动 scm」时使用。workflow：start-work 或 standalone；taskKey：cpxy、react18、cc-web、biz-solution、uikit、shared（start-work）或 scm（standalone）',
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
  {
    type: 'function' as const,
    function: {
      name: 'open_in_ide',
      description: '用指定 IDE/编辑器打开项目目录。用户说「ws打开base」「cursor打开base」「用 WebStorm 打开 scm」时使用。app：ws 或 webstorm（WebStorm）、cursor（Cursor）、vscode 或 code（VS Code）；code：项目代号，与 config/projects 一致',
      parameters: {
        type: 'object',
        required: ['app', 'code'],
        properties: {
          app: { type: 'string', description: '应用：ws / webstorm（WebStorm）、cursor（Cursor）、vscode / code（VS Code）' },
          code: { type: 'string', description: '项目代号：base、base18、nova、scm、scm18、cc-web、cc-web2、react18、biz-solution、biz-guide、uikit、shared、ai-import、uikit-compat、cc-node、app-service、biz-framework、front-entity、front-pub、evoui、chanjet-grid、nova-form、nova-grid、nova-server、nova-ui、chanjet-nova、h5-biz-common、cc-web-hkj' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'close_ide_project',
      description: '关闭指定 IDE 中已打开的某项目窗口。用户说「关闭ws的nova」「关闭cursor的base」「关闭 WebStorm 的 scm」时使用。app：ws/webstorm、cursor、vscode/code；code：项目代号，与 config/projects 一致',
      parameters: {
        type: 'object',
        required: ['app', 'code'],
        properties: {
          app: { type: 'string', description: '应用：ws / webstorm、cursor、vscode / code' },
          code: { type: 'string', description: '项目代号：base、base18、nova、scm、scm18、cc-web、cc-web2、react18、biz-solution、biz-guide、uikit、shared、ai-import、uikit-compat、cc-node、app-service、biz-framework、front-entity、front-pub、evoui、chanjet-grid、nova-form、nova-grid、nova-server、nova-ui、chanjet-nova、h5-biz-common、cc-web-hkj' },
        },
      },
    },
  },
];
