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
      name: 'open_command_stats',
      description: '打开指令统计页签。用户说「统计常用指令」时调用，以图表展示常用指令次数，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_md_to_pdf',
      description:
        '打开 MD 生成 PDF 页签。用户说「md生成pdf」「MD生成PDF」时调用；页签内可上传/选择 .md 并在本机下载目录生成 GitLab 风格 PDF，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_macostunmode',
      description:
        '在系统终端启动 macostunmode（sing-box TUN 管理脚本）。用户说「tun」时调用；等价于 cd macostunmode 后 sudo ./macostunmode.sh，无参数',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'clear_private_knowledge_base',
      description:
        '清除私人知识库。用户说「清除私人知识库」「清空私人知识库」时调用；删除 runtime/private-kb 下已导入文档并清理知识库索引',
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
      name: 'incremental_rebuild_knowledge_base_index',
      description:
        '增量重建私人知识库索引。用户说「增量重建知识库索引」时调用，无参数；仅重算变更文档预处理并重建索引',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_knowledge_docs',
      description:
        '列出所有已添加到知识库的文档。用户说「已添加到知识库的文档」「知识库有哪些文档」「查看知识库文档列表」时调用，无参数',
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
        '查询本地知识库（默认 runtime/private-kb 下 Markdown 文档）并返回可引用答案。用户问「如何使用」「文档里怎么配置」等说明类问题时调用',
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
      description:
        '在系统默认浏览器打开好业财集测环境（固定 URL）。仅当用户说「打开集测环境」时调用；不是 open_terminal，无参数。',
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
      description:
        '在系统默认浏览器打开好业财测试环境（固定 URL）。仅当用户说「打开测试环境」时调用；与内嵌终端 open_terminal 无关，无参数。',
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
      description: '打开某项目对应的 Jenkins 任务页面。用户说「打开jenkins nova」「打开 Jenkins 的 cc-web/cc-node/mdf-ui/mdf-report」时使用；job=预定义 key（nova、cc-web、cc-node、react18、base、base18、biz-solution、biz-guide、scm、mdf-ui、mdf-biz、mdf-report）',
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
      description: '部署/构建某项目。用户说「部署nova/cc-node」「部署nova 分支是sprint-260326」时：job=预定义 key；「部署 nova 集测」→ job=nova-pretest（自动解析 react18 最大 sprint 分支）。可选 branch=指定分支，不传则用默认或集测算法分支',
      parameters: {
        type: 'object',
        required: ['job'],
        properties: {
          job: { type: 'string', description: '预定义 key：nova、nova-pretest（集测）等，或完整 Jenkins Job 名' },
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
      name: 'search_my_tasks',
      description:
        '查询 Jira 中“我的任务”固定条件列表（Jira 8.8，非 token 鉴权）：经办人或开发人员为当前用户、全量未完成且不含缺陷（不限当前迭代）。用户说「我的任务」「查询我的任务」时调用，可选 maxResults',
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
      name: 'search_assignee_bugs',
      description:
        '查询 Jira 中“经办人bug”固定条件列表（Jira 8.8，非 token 鉴权）：经办人为当前用户、类型为缺陷且未解决。用户说「经办人bug」「查询经办人bug」时调用，可选 maxResults',
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
      name: 'search_assignee_tasks',
      description:
        '查询 Jira 中“经办人任务”固定条件列表（Jira 8.8，非 token 鉴权）：经办人为当前用户、类型为任务/子任务/缺陷且未解决。用户说「经办人任务」「查询经办人任务」时调用，可选 maxResults',
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
      name: 'search_todo_bugs',
      description:
        '查询 Jira 中“待办bug”固定条件列表（Jira 8.8，非 token 鉴权）：按当前日期落入的修复版本迭代（YYMMDD，版本日≥今天的最早一档）查询，经办人为当前用户、类型为缺陷、状态为打开；返回前一/当前/下一迭代供切换。用户说「待办bug」「查询待办bug」时调用，可选 maxResults、fixVersion',
      parameters: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '可选，返回数量上限，默认 100，最大 100' },
          fixVersion: { type: 'string', description: '可选，指定迭代号（如 260820）；默认按当前日期落入档' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_in_progress_bugs',
      description:
        '查询 Jira 中“处理中bug”固定条件列表（Jira 8.8，非 token 鉴权）：按当前日期落入的修复版本迭代（YYMMDD）查询，经办人为当前用户、类型为缺陷、状态为处理中（In Progress）；每条附带 processed（当前用户是否已评论含「已处理」）；返回前一/当前/下一迭代供切换。用户说「处理中bug」「查询处理中bug」时调用，可选 maxResults、fixVersion',
      parameters: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '可选，返回数量上限，默认 100，最大 100' },
          fixVersion: { type: 'string', description: '可选，指定迭代号（如 260820）；默认按当前日期落入档' },
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
      name: 'get_npm_package_versions',
      description:
        '查询关注的 @chanjet npm 包 Current Tags（含版本与发布时间）。用户说「获取npm包版本」时调用，无参数',
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
        '打开内嵌终端工作区（我的工作），新建终端页签，不打开浏览器。禁止用于「打开测试环境」「打开集测环境」「打开json配置中心」——那些必须用 open_test_env / open_jice_env / open_json_config_center。仅当用户明确说「打开终端」「新建终端」，或「终端打开 react18」等（口令含「终端」）时调用；「终端打开 xx」必传 code=项目代号。仅「打开终端/新建终端」不传 code。',
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
      description: '执行工作流。「开始工作」→ name=start-work；「开始工作，使用外部终端」→ name=start-work-external-terminal；「升级集测react18的nova版本」→ name=upgrade-react18-nova；「升级集测cc-web的nova版本」→ name=upgrade-cc-web-nova；「升级集测react18的mdf-report版本」→ name=upgrade-react18-mdf-report',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', description: 'start-work、start-work-external-terminal、standalone、upgrade-react18-nova、upgrade-cc-web-nova 或 upgrade-react18-mdf-report' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_workflow_step',
      description: '启动开发项目。工作流内项目（cpxy/react18/cc-web/biz-solution/uikit/shared/scm）或工作流外项目（base/base18/nova/mdf-ui/mdf-biz/mdf-report 等）均传 taskKey=项目代号；工作流外项目自动 cd 到项目目录执行开发命令（mdf-ui/mdf-biz 为 yarn w，mdf-report 为 pnpm run dev，其余默认 yarn dev）',
      parameters: {
        type: 'object',
        required: ['workflow', 'taskKey'],
        properties: {
          workflow: { type: 'string', description: 'start-work 或 standalone' },
          taskKey: { type: 'string', description: '项目代号：工作流内如 cpxy/react18/scm；工作流外如 base/base18/nova/mdf-ui/mdf-biz/mdf-report' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'merge_repo',
      description:
        '合并仓库。合并 nova → repo=nova；合并 nova 集测 → repo=nova-pretest；合并 biz-solution → repo=biz-solution；合并 biz-solution 集测 → repo=biz-solution-pretest（目标为 react18 最大 sprint 分支）；合并 scm/mdf-ui/mdf-biz/mdf-report → repo=对应代号',
      parameters: {
        type: 'object',
        required: ['repo'],
        properties: {
          repo: {
            type: 'string',
            description: 'nova、nova-pretest、biz-solution、biz-solution-pretest、scm、mdf-ui、mdf-biz、mdf-report 等已配置 merge 的代号',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'composite_nova_merge_and_deploy',
      description:
        '执行复合流程「合并nova并部署相关服务」：先串行执行合并 nova、部署 nova，成功后并行部署 react18 与 cc-web，并汇总结果。固定口令触发，无参数',
      parameters: {
        type: 'object',
        properties: {},
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
