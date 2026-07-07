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

/** Ollama temperature：0～2，非法或缺省则用 defaultValue */
function parseOllamaTemperatureFromEnv(envKey: string, defaultValue: number): number {
  const v = process.env[envKey];
  if (v == null || String(v).trim() === '') return defaultValue;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 2) return defaultValue;
  return n;
}

function resolveApiPort(): number {
  const fromDedicated = Number(process.env.API_PORT);
  if (Number.isFinite(fromDedicated) && fromDedicated > 0) return fromDedicated;
  /** 兼容旧 .env 的 PORT；新配置请只用 API_PORT，勿设 PORT（cc-web cjet dev 会读 PORT） */
  const legacy = Number(process.env.PORT);
  if (Number.isFinite(legacy) && legacy > 0) return legacy;
  return 41738;
}

const apiPort = resolveApiPort();

export const config = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'qwen2.5',
    /** 传入 Ollama chat 的 think；undefined 表示不传（兼容非 thinking 模型）。显式开启见 OLLAMA_THINK */
    think: parseOllamaThinkFromEnv(),
    /** Agent 工具路由：宜 0，减少同指令偶发不调 tool */
    agentTemperature: parseOllamaTemperatureFromEnv('OLLAMA_AGENT_TEMPERATURE', 0),
    /** 写周报生成 */
    weeklyReportTemperature: parseOllamaTemperatureFromEnv('OLLAMA_WEEKLY_REPORT_TEMPERATURE', 0.4),
    /** 组内总结生成 */
    teamSummaryTemperature: parseOllamaTemperatureFromEnv('OLLAMA_TEAM_SUMMARY_TEMPERATURE', 0.4),
  },
  server: {
    port: apiPort,
    /** 内嵌 PTY 专用子进程端口，与 API 分离避免 OOM 连带杀死 API */
    terminalBrokerPort: Number(process.env.TERMINAL_BROKER_PORT) || apiPort + 1,
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
    /** 特性自定义字段 id（如 customfield_16202）；留空则启动时向 Jira 拉取 /rest/api/2/field 按名称「特性」解析 */
    featureFieldId: process.env.JIRA_FEATURE_FIELD_ID || '',
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
    /** 问答模型（Ollama） */
    chatModel: process.env.KB_CHAT_MODEL || 'qwen2.5:7b',
    /** 预处理模型（用于 metadata extraction，速度/质量平衡默认 14B） */
    ingestModel: process.env.KB_INGEST_MODEL || 'qwen2.5-coder:14b',
    /** 嵌入模型（Ollama） */
    embedModel: process.env.KB_EMBED_MODEL || 'bge-m3',
    /** 索引持久化目录（绝对路径优先） */
    persistDir: process.env.KB_PERSIST_DIR || 'runtime/knowledge-index',
    /** Parent 节点大小（近似 token） */
    parentChunkTokens: Math.max(256, Number(process.env.KB_PARENT_CHUNK_TOKENS) || 1536),
    /** Child 节点大小（近似 token） */
    childChunkTokens: Math.max(64, Number(process.env.KB_CHILD_CHUNK_TOKENS) || 512),
    /** Child 切片重叠大小（近似 token） */
    chunkOverlapTokens: Math.max(16, Number(process.env.KB_CHUNK_OVERLAP_TOKENS) || 32),
    /** 上下文窗口大小（num_ctx），默认 3072 */
    numCtx: Math.max(2048, Number(process.env.KB_NUM_CTX) || 3072),
    /** Query 阶段的最大上下文窗口，防止长文档撑爆显存 */
    contextWindow: Math.max(2048, Number(process.env.KB_CONTEXT_WINDOW) || 4096),
    /** 是否启用 Flash Attention */
    flashAttention: ['1', 'true', 'yes', 'on'].includes(String(process.env.KB_FLASH_ATTENTION || '1').toLowerCase()),
    /** 检索召回条数 */
    topK: Math.max(1, Number(process.env.KB_TOP_K) || 7),
    /** 混合检索候选数量 */
    hybridTopK: Math.max(2, Number(process.env.KB_HYBRID_TOP_K) || 4),
    /** Hybrid Search 的向量权重（关键词权重 = 1 - alpha） */
    hybridAlpha: Math.max(0, Math.min(1, Number(process.env.KB_HYBRID_ALPHA) || 0.4)),
    /** RRF 融合参数（越大越平滑） */
    rrfK: Math.max(10, Number(process.env.KB_RRF_K) || 50),
    /** 引用片段最大字符数 */
    maxSnippetChars: Math.max(80, Number(process.env.KB_MAX_SNIPPET_CHARS) || 280),
    /** 重排模式：model（本地模型重排）或 rule（规则重排） */
    rerankMode: (process.env.KB_RERANK_MODE || 'rule').toLowerCase() === 'model' ? 'model' : 'rule',
    /** 本地模型重排使用的 Ollama 模型（推荐 bge-reranker-v2-m3） */
    rerankModel: process.env.KB_RERANK_MODEL || 'bge-reranker-v2-m3',
    /** 进入重排的候选池大小 */
    rerankPoolSize: Math.max(4, Number(process.env.KB_RERANK_POOL_SIZE) || 24),
    /** 单次知识库查询超时（毫秒），避免工具阶段长时间无响应 */
    queryTimeoutMs: Math.max(5000, Number(process.env.KB_QUERY_TIMEOUT_MS) || 300000),
    /** 知识库问答 / 预处理 / 重排：宜偏低，减少胡编 */
    temperature: parseOllamaTemperatureFromEnv('OLLAMA_KB_TEMPERATURE', 0.1),
  },
  techDigest: {
    githubLimit: Math.max(1, Number(process.env.TECH_DIGEST_GITHUB_LIMIT) || 50),
    hnLimit: Math.max(1, Number(process.env.TECH_DIGEST_HN_LIMIT) || 30),
    redditLimit: Math.max(1, Number(process.env.TECH_DIGEST_REDDIT_LIMIT) || 20),
    fetchTimeoutMs: Math.max(5000, Number(process.env.TECH_DIGEST_FETCH_TIMEOUT_MS) || 30_000),
    /** Reddit 单版块抓取总超时（含限流重试，毫秒） */
    redditFetchTimeoutMs: Math.max(30_000, Number(process.env.TECH_DIGEST_REDDIT_FETCH_TIMEOUT_MS) || 180_000),
    llmTimeoutMs: Math.max(60_000, Number(process.env.TECH_DIGEST_LLM_TIMEOUT_MS) || 600_000),
    ollamaTemperature: parseOllamaTemperatureFromEnv('OLLAMA_TECH_DIGEST_TEMPERATURE', 0.3),
    githubToken: (process.env.GITHUB_TOKEN ?? '').trim(),
    /** Reddit 要求唯一 UA，格式 platform:appId:version (by /u/username) */
    redditUserAgent: (process.env.REDDIT_USER_AGENT ?? '').trim(),
    redditClientId: (process.env.REDDIT_CLIENT_ID ?? '').trim(),
    redditClientSecret: (process.env.REDDIT_CLIENT_SECRET ?? '').trim(),
    /** 连续 Reddit 请求最小间隔（毫秒） */
    redditRequestGapMs: Math.max(1000, Number(process.env.TECH_DIGEST_REDDIT_GAP_MS) || 8000),
    /** 遇到 429 后全局冷却（毫秒） */
    reddit429CooldownMs: Math.max(5000, Number(process.env.TECH_DIGEST_REDDIT_429_COOLDOWN_MS) || 45_000),
  },
  gemini: {
    /** 外部 Gemini 默认模型；UI 未指定 model 时与后端 fallback 一致 */
    defaultModel: (process.env.GEMINI_DEFAULT_MODEL ?? '').trim() || 'gemini-3.1-flash-lite',
  },
};
