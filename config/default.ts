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
    queryTimeoutMs: Math.max(5000, Number(process.env.KB_QUERY_TIMEOUT_MS) || 120000),
  },
};
