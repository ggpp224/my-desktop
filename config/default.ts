/* AI 生成 By Peng.Guo */
/**
 * Ollama「思考」能力：仅支持该能力的模型可传 think；默认不传，避免 qwen2.5 等报 400 does not support thinking。
 * 使用推理模型且流式偏慢时，可设 OLLAMA_THINK=1（或 low/medium/high）。
 * @see https://docs.ollama.com/capabilities/thinking
 */
function parseOllamaThinkFromEnv(): true | 'low' | 'medium' | 'high' | undefined {
  const v = process.env.OLLAMA_THINK;
  if (v == null || String(v).trim() === '') return undefined;
  const t = String(v).trim().toLowerCase();
  if (['false', '0', 'off', 'no', 'none'].includes(t)) return undefined;
  if (t === 'low' || t === 'medium' || t === 'high') return t;
  if (['true', '1', 'on', 'yes'].includes(t)) return true;
  return undefined;
}

export const config = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'qwen2.5',
    /** 传入 Ollama chat 的 think；undefined 表示不传（兼容非 thinking 模型）。显式开启见 OLLAMA_THINK */
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
    /** 周报「本周」按该 IANA 时区从周一开始算（默认上海）；与 Jira Look and feel 的周起始解耦 */
    weeklyReportTimeZone: process.env.JIRA_WEEKLY_REPORT_TZ || 'Asia/Shanghai',
    /** 开发人员自定义字段 id（如 customfield_10001）；留空则启动时向 Jira 拉取 /rest/api/2/field 按名称「开发人员」解析 */
    developerFieldId: process.env.JIRA_DEVELOPER_FIELD_ID || '',
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
  knowledgeBase: {
    /** // AI 生成 By Peng.Guo：知识库文档根目录（逗号分隔，默认 doc,docs） */
    docDirs: (process.env.KB_DOC_DIRS || 'doc,docs,runtime/private-kb')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    /** 问答模型（Ollama） */
    chatModel: process.env.KB_CHAT_MODEL || 'qwen3.6:35b',
    /** 嵌入模型（Ollama） */
    embedModel: process.env.KB_EMBED_MODEL || 'bge-m3',
    /** 检索召回条数 */
    topK: Math.max(1, Number(process.env.KB_TOP_K) || 5),
    /** 引用片段最大字符数 */
    maxSnippetChars: Math.max(80, Number(process.env.KB_MAX_SNIPPET_CHARS) || 280),
    /** 单次知识库查询超时（毫秒），避免工具阶段长时间无响应 */
    queryTimeoutMs: Math.max(5000, Number(process.env.KB_QUERY_TIMEOUT_MS) || 45000),
  },
};
