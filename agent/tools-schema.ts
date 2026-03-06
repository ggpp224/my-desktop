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
      description: '在默认浏览器中打开指定 URL',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: { url: { type: 'string', description: '要打开的完整 URL' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'deploy_jenkins',
      description: '触发 Jenkins 指定 Job 的构建/部署',
      parameters: {
        type: 'object',
        required: ['jobName'],
        properties: { jobName: { type: 'string', description: 'Jenkins Job 名称' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_workflow',
      description: '执行预定义工作流，例如 start-work（工作流名对应 workflows 目录下 JSON 文件名，不含 .json）',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', description: '工作流名称，对应 workflows 目录下的 JSON 文件名（不含 .json）' } },
      },
    },
  },
];
