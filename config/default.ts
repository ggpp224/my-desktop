/* AI 生成 By Peng.Guo */
/**
 * Ollama「思考」链路与 CLI 对齐：需在 /api/chat 传 think，否则流式阶段几乎无增量、界面像卡住。
 * @see https://docs.ollama.com/capabilities/thinking
 */
function parseOllamaThinkFromEnv(): true | 'low' | 'medium' | 'high' | undefined {
  const v = process.env.OLLAMA_THINK;
  if (v == null || String(v).trim() === '') return true;
  const t = String(v).trim().toLowerCase();
  if (['false', '0', 'off', 'no', 'none'].includes(t)) return undefined;
  if (t === 'low' || t === 'medium' || t === 'high') return t;
  if (['true', '1', 'on', 'yes'].includes(t)) return true;
  return true;
}

export const config = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'qwen2.5',
    /** 传入 Ollama chat 的 think；undefined 表示不传该字段（由模型默认） */
    think: parseOllamaThinkFromEnv(),
  },
  server: {
    port: Number(process.env.PORT) || 3000,
  },
  jenkins: {
    baseUrl: process.env.JENKINS_BASE_URL || '',
    /** Basic 认证：username，与 token 一起使用 */
    username: process.env.JENKINS_USERNAME || '',
    /** API Token，用作 Basic 认证的密码 */
    token: process.env.JENKINS_TOKEN || '',
    /** 预定义任务，供下拉等快捷操作使用 */
    jobs: {
      nova: process.env.JENKINS_JOB_NOVA || 'BUILD-to-CNPM__nova_nova-next',
    },
  },
  jira: {
    baseUrl: process.env.JIRA_BASE_URL || '',
    /** Jira 8.8 场景使用账号密码 Basic 认证（非 token） */
    username: process.env.JIRA_USERNAME || '',
    password: process.env.JIRA_PASSWORD || '',
  },
  cursor: {
    usageApiUrl:
      process.env.CURSOR_USAGE_API_URL ||
      'https://cursor.com/api/dashboard/get-aggregated-usage-events',
    todayUsageApiUrl:
      process.env.CURSOR_TODAY_USAGE_API_URL ||
      'https://cursor.com/api/dashboard/get-filtered-usage-events',
    /** Cursor Dashboard API token（可选，优先） */
    token: process.env.CURSOR_API_TOKEN || '',
    /** Cursor Dashboard API Cookie（可选） */
    cookie: process.env.CURSOR_COOKIE || '',
  },
  wiki: {
    baseUrl: process.env.WIKI_BASE_URL || 'https://wiki2.rd.chanjet.com',
    weeklySpaceName: process.env.WIKI_WEEKLY_SPACE_NAME || '低代码单据前端空间',
    weeklyRootPageId: process.env.WIKI_WEEKLY_ROOT_PAGE_ID || '405143687',
    token: process.env.WIKI_TOKEN || '',
    authScheme: process.env.WIKI_AUTH_SCHEME || 'Bearer',
  },
  shell: {
    allowedCwd: process.env.SHELL_CWD || process.cwd(),
  },
};
