/* AI 生成 By Peng.Guo */
export const toolsSchema = [
  {
    type: 'function' as const,
    function: {
      name: 'open_knowledge_base_manager',
      description:
        '打开私人知识库管理页签。用户说「添加私人知识库」时调用，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'rebuild_knowledge_base_index',
      description:
        '重建私人知识库索引。用户说「重建知识库索引」时调用，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_knowledge_base',
      description:
        '查询本地知识库（doc/docs 下 Markdown 文档）并返回可引用答案。用户问「如何使用」「文档里怎么配置」等说明类问题时调用',
      parameters: {
        type: 'object',
        required: ['question'],
        properties: {
          question: { type: 'string', description: '用户的知识库问题原文' },
        },
      },
    },
  },
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
      name: 'open_jice_env',
      description: '打开集测环境（好业财）。用户说「打开集测环境」时调用，无参数。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_test_env',
      description: '打开测试环境（好业财）。用户说「打开测试环境」时调用，无参数。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_json_config_center',
      description: '打开 json 配置中心（前端配置管理）。用户说「打开json配置中心」时调用，无参数。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_jenkins_job',
      description: '打开某项目对应的 Jenkins 任务页面。用户说「打开jenkins nova」「打开 Jenkins 的 cc-web/cc-node」时使用；job=预定义 key（nova、cc-web、cc-node、react18、base、base18、biz-solution、biz-guide、scm）',
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
      description: '部署/构建某项目。用户说「部署nova/cc-node」「部署nova 分支是sprint-260326」时：job=预定义 key（nova、cc-web、cc-node、react18 等）或完整 Job 名；可选 branch=指定分支（如 sprint-260326），不传则用该项目默认分支',
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
      name: 'search_my_bugs',
      description:
        '查询 Jira 中“我的bug”固定条件列表（Jira 8.8，非 token 鉴权）。用户说「我的bug」「查询我的bug」时调用，可选 maxResults',
      parameters: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '可选，返回数量上限，默认 100，最大 100' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_online_bugs',
      description:
        '查询 Jira 中“线上bug”固定条件列表（Jira 8.8，非 token 鉴权）。用户说「线上bug」「查询线上bug」时调用，可选 maxResults',
      parameters: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '可选，返回数量上限，默认 100，最大 100' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_weekly_done_tasks',
      description:
        '查询 Jira 中“本周已完成任务”固定条件列表（Jira 8.8，非 token 鉴权）。用户说「本周已完成任务」「查询本周已完成任务」时调用，可选 maxResults',
      parameters: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '可选，返回数量上限，默认 100，最大 100' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_weekly_handoff_bugs',
      description:
        '查询 Jira「本周经我手的 bug」：本周（与周报相同业务周）内经办人曾为当前用户，但当前经办人不是当前用户且开发人员中也不含当前用户（经办/开发为空视为「不含我」）。用户说「本周经我手的bug」「经我手的bug」等时调用，可选 maxResults',
      parameters: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '可选，返回数量上限，默认 100，最大 100' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_cursor_usage',
      description:
        '查询 Cursor 用量（调用 dashboard 聚合用量 API）。用户说「cursor用量」「查询cursor用量」时调用，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_cursor_today_usage',
      description:
        '查询 Cursor 今日用量（调用 dashboard filtered usage API）。用户说「cursor今日用量」「查询cursor今日用量」时调用，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'sync_cursor_cookie',
      description:
        '从本机 Chrome 登录态自动同步 cursor.com Cookie 到运行时内存。用户说「同步cursor登录态」时调用，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_weekly_report',
      description:
        '打开 wiki 周报页面。用户说「周报」时调用：自动按“低代码单据前端空间”下最近季度与最近日期区间定位并打开页面',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_weekly_report_info',
      description:
        '抓取 wiki 周报页信息（不打开浏览器）：与「周报」相同规则解析最新周区间子页，再通过 Confluence REST 拉取正文（body.storage/view）与版本号，供总结或对照。用户说「抓取周报信息」「拉取周报页」时调用，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_weekly_report',
      description:
        '编写本周周报：先并行查询 Jira「本周已完成任务」与「本周经我手的 bug」（经办曾为我、现经办/开发不含我），合并去重后取标题列表，再调用大模型按 Markdown 生成；产出 reportHtml 与 reportWiki；用户说「写周报」时调用',
      parameters: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '可选，Jira 查询数量上限，默认 100，最大 100' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_weekly_team_summary',
      description:
        '本周组内总结：与「抓取周报信息」相同规则拉取当前 wiki 周报页 HTML，再按固定提示词调用本地大模型清洗并生成五段式 Markdown 组内总结，产出 reportHtml/reportWiki；用户说「本周组内总结」「组内总结」时调用，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_terminal',
      description:
        '打开内嵌终端工作区（我的工作），新建一个终端页签，不执行开始工作流。用户说「终端打开 react18」「终端打开 cc-web」等 → 必传 code=项目代号，cwd 为该代号在 config/projects 中的路径；仅「打开终端/新建终端」不传 code，cwd 为用户主目录。代号示例：react18、cc-web、cc-web2、biz-solution、biz-guide、uikit、shared、scm、scm18、nova、nova-next、base、base18、ai-import、uikit-compat、cc-node、app-service、biz-framework、front-entity、front-pub、evoui、chanjet-grid、nova-form、nova-grid、nova-server、nova-ui、chanjet-nova、h5-biz-common、cc-web-hkj',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              '可选。config/projects 中的项目代号；与「终端打开 xx」中的 xx 一致；不传则空白主目录终端',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_workflow',
      description: '执行工作流。「开始工作」→ name=start-work；「升级集测react18的nova版本」→ name=upgrade-react18-nova；「升级集测cc-web的nova版本」→ name=upgrade-cc-web-nova',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', description: 'start-work、standalone、upgrade-react18-nova 或 upgrade-cc-web-nova' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_workflow_step',
      description: '执行工作流单步。启动 cpxy/react18/scm 等 → workflow=start-work 或 standalone，taskKey=对应 key',
      parameters: {
        type: 'object',
        required: ['workflow', 'taskKey'],
        properties: {
          workflow: { type: 'string', description: 'start-work 或 standalone' },
          taskKey: { type: 'string', description: 'cpxy/react18/cc-web/biz-solution/uikit/shared/scm（start-work 不含 base18）' },
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
