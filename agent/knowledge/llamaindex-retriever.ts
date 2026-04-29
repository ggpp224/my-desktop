/* AI 生成 By Peng.Guo */
import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Document, Settings, VectorStoreIndex, storageContextFromDefaults } from 'llamaindex';
import { Ollama, OllamaEmbedding } from '@llamaindex/ollama';
import { config } from '../../config/default.js';
import { streamGeminiText } from '../gemini-client.js';
import type { KnowledgeDoc } from './markdown-data-source.js';
import { getKnowledgeDocDirs, loadMarkdownKnowledgeDocs } from './markdown-data-source.js';
import type {
  ChildNodeRecord,
  DocFingerprint,
  EnhancedNodeMetadata,
  FilterStrategy,
  IngestionCacheFile,
  IngestionResult,
  ParentNodeRecord,
  ProcessedDocCache,
} from './knowledge-types.js';

type CachedIndexState = {
  signature: string;
  index: VectorStoreIndex;
  docsCount: number;
  children: ChildNodeRecord[];
  parentById: Record<string, ParentNodeRecord>;
};

type PersistMeta = {
  signature: string;
  docsCount: number;
  updatedAt: string;
};

type RebuildMode = 'full' | 'incremental';

export type KnowledgeCitation = {
  path: string;
  score?: number;
  snippet: string;
};

export type KnowledgeQueryResult = {
  answer: string;
  citations: KnowledgeCitation[];
  docsCount: number;
};

export type KnowledgeQueryStreamCallbacks = {
  onProgress?: (message: string) => void;
  onAnswerDelta?: (delta: string) => void;
  provider?: 'gemini';
  apiKey?: string;
  baseUrl?: string;
};

export type RebuildProgressCallback = (message: string) => void;

type RankedNode = {
  node: ChildNodeRecord;
  score: number;
};

// AI 生成 By Peng.Guo
type PersistableChildMetadata = Omit<EnhancedNodeMetadata, 'embeddingText'>;

// AI 生成 By Peng.Guo
function toPersistableChildMetadata(metadata: EnhancedNodeMetadata): PersistableChildMetadata {
  return {
    filePath: metadata.filePath,
    docId: metadata.docId,
    nodeId: metadata.nodeId,
    nodeType: metadata.nodeType,
    parentId: metadata.parentId,
    title: metadata.title,
    summary: metadata.summary,
    hypotheticalQuestions: metadata.hypotheticalQuestions,
    keyEntities: metadata.keyEntities,
  };
}

class TitleExtractor {
  async extract(text: string): Promise<string> {
    const firstLine = text
      .split('\n')
      .map((v) => v.trim())
      .find((v) => !!v && !v.startsWith('```'));
    if (!firstLine) return '未命名片段';
    return firstLine.slice(0, 60);
  }
}

class QuestionAnsweredExtractor {
  async extract(text: string, askLLM: (prompt: string) => Promise<string[]>): Promise<string[]> {
    return askLLM(`请基于以下片段生成 3 个用户可能提出的口语化问题，返回 JSON 数组字符串：\n${text.slice(0, 2400)}`);
  }
}

class KeywordRetriever {
  private readonly docs: ChildNodeRecord[];

  constructor(docs: ChildNodeRecord[]) {
    this.docs = docs;
  }

  retrieve(query: string, topK: number, filter: FilterStrategy): RankedNode[] {
    const qTokens = tokenize(query);
    const avgLen = this.docs.reduce((acc, d) => acc + tokenize(d.text).length, 0) / Math.max(1, this.docs.length);
    const k1 = 1.2;
    const b = 0.75;
    const idfMap = new Map<string, number>();
    for (const token of qTokens) {
      const df = this.docs.reduce((acc, doc) => (containsToken(doc, token) ? acc + 1 : acc), 0);
      const idf = Math.log(1 + (this.docs.length - df + 0.5) / (df + 0.5));
      idfMap.set(token, idf);
    }
    return this.docs
      .map((doc) => {
        if (!passesMetadataFilter(doc, filter)) return { node: doc, score: 0 };
        const tokens = tokenize(composeLexicalText(doc));
        const tf = new Map<string, number>();
        for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
        const lenNorm = 1 - b + (b * tokens.length) / Math.max(1, avgLen);
        let score = 0;
        for (const qt of qTokens) {
          const freq = tf.get(qt) ?? 0;
          if (freq === 0) continue;
          const idf = idfMap.get(qt) ?? 0;
          score += idf * ((freq * (k1 + 1)) / (freq + k1 * lenNorm));
        }
        return { node: doc, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

class ReciprocalRankFusion {
  constructor(private readonly k: number) {}

  fuse(rankedLists: RankedNode[][], topK: number): RankedNode[] {
    const scoreMap = new Map<string, { node: ChildNodeRecord; score: number }>();
    rankedLists.forEach((list) => {
      list.forEach((item, idx) => {
        const current = scoreMap.get(item.node.id) ?? { node: item.node, score: 0 };
        current.score += 1 / (this.k + idx + 1);
        scoreMap.set(item.node.id, current);
      });
    });
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((item) => ({ node: item.node, score: item.score }));
  }
}

class RecursiveRetriever {
  constructor(private readonly parentById: Record<string, ParentNodeRecord>) {}

  hydrate(rankedChildren: RankedNode[]): Array<{ child: RankedNode; parent: ParentNodeRecord | null }> {
    return rankedChildren.map((child) => ({
      child,
      parent: child.node.metadata.parentId ? this.parentById[child.node.metadata.parentId] ?? null : null,
    }));
  }
}

// AI 生成 By Peng.Guo：避免同一文档多个相邻片段挤占 TopK，优先保证多文档覆盖
function diversifyByDocSource(ranked: RankedNode[], topK: number, maxPerDoc = 2): RankedNode[] {
  const selected: RankedNode[] = [];
  const perDocCount = new Map<string, number>();
  for (const item of ranked) {
    const docKey = item.node.metadata.docId || item.node.metadata.filePath || item.node.id;
    const current = perDocCount.get(docKey) ?? 0;
    if (current >= maxPerDoc) continue;
    selected.push(item);
    perDocCount.set(docKey, current + 1);
    if (selected.length >= topK) break;
  }
  // 若去重后不足 topK，再按原序补齐
  if (selected.length < topK) {
    for (const item of ranked) {
      if (selected.includes(item)) continue;
      selected.push(item);
      if (selected.length >= topK) break;
    }
  }
  return selected;
}

function isUsageIntentQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const hints = ['怎么用', '如何用', '如何使用', '怎么配置', '快速开始', 'quick start', 'usage', '接入', '示例'];
  return hints.some((k) => q.includes(k));
}

// AI 生成 By Peng.Guo：按问题主题动态注入锚点与可执行信号，避免“主从合并”特征污染其它问题
function buildQueryProfile(query: string): { anchors: string[]; actionSignals: RegExp[] } {
  const lower = query.toLowerCase();
  const anchors = ['快速开始', '使用说明', '示例', '配置', '接入'];
  const actionSignals: RegExp[] = [
    /示例|步骤|配置|开关|使用说明|快速开始|接入|api|interface/i,
    /import\s+\{[^}]+\}\s+from/i,
    /props?|参数|选项|默认值|mode|profile/i,
  ];

  if (lower.includes('主从合并') || /\bslave\b/.test(lower)) {
    anchors.push('slaveMergeConfig', 'masterField', 'slaveFields', 'displayMode', 'defaultEnableSlaveMerge', 'detailListDisplayMode');
    actionSignals.push(
      /masterfield/i,
      /slavefields?/i,
      /slavemergeconfig/i,
      /displaymode/i,
      /defaultenableslavemerge/i,
      /detaillistdisplaymode/i,
      /split|merge-center|merge-top|hidden/i
    );
  }
  if (lower.includes('条件格式化') || lower.includes('conditional formatting') || lower.includes('conditionalformatting')) {
    anchors.push('conditionalFormatting', 'formatRules', 'rowData', 'processedData');
    actionSignals.push(/conditionalformatting|formatrules?|rowdata|processeddata/i);
  }
  if (lower.includes('化清空选中') || lower.includes('selection') || lower.includes('选中')) {
    anchors.push('selection memory', 'clearSelectionMemory', 'gridRef.current?.api');
    actionSignals.push(/selectionmemory|clearselectionmemory|gridref\.current\?\.api/i);
  }

  return { anchors: Array.from(new Set(anchors)), actionSignals };
}

function buildExpandedHybridQuery(query: string): string {
  const q = query.trim();
  if (!q) return q;
  if (!isUsageIntentQuery(q)) return q;
  const profile = buildQueryProfile(q);
  return `${q} ${profile.anchors.join(' ')}`;
}

function calcUsageIntentContentBoost(node: ChildNodeRecord, query: string): number {
  const qTokens = tokenize(query).filter((t) => t.length >= 2);
  const title = (node.metadata.title || '').toLowerCase();
  const summary = (node.metadata.summary || '').toLowerCase();
  const questions = (node.metadata.hypotheticalQuestions || []).join(' ').toLowerCase();
  const text = (node.text || '').toLowerCase();
  const lex = `${title}\n${summary}\n${questions}\n${text}`;

  // 1) 查询词覆盖度（标题/摘要/可回答问题优先）
  const titleHit = qTokens.filter((t) => title.includes(t)).length;
  const summaryHit = qTokens.filter((t) => summary.includes(t)).length;
  const questionHit = qTokens.filter((t) => questions.includes(t)).length;

  // 2) “怎么用”类可执行信号：通用规则 + 问题主题特有规则
  const { actionSignals } = buildQueryProfile(query);
  const actionability = actionSignals.reduce((acc, re) => acc + (re.test(lex) ? 1 : 0), 0);

  // 3) 导航/入口页惩罚（不是文件名规则，而是内容形态规则）
  const navSignals = [
    /功能列表|适用场景|本文将帮助你选择|对比|目录|索引|入口/,
    /\|\s*功能\s*\|\s*说明\s*\|\s*适用场景\s*\|/,
  ];
  const navigationPenalty = navSignals.reduce((acc, re) => acc + (re.test(lex) ? 1 : 0), 0);

  // 入口/导航型片段强降权：即使词覆盖高，也不应压过可执行配置文档
  if (navigationPenalty > 0 && actionability < 3) {
    return -0.08 - navigationPenalty * 0.03;
  }

  return titleHit * 0.014 + summaryHit * 0.01 + questionHit * 0.008 + actionability * 0.012 - navigationPenalty * 0.03;
}

function isNavigationLike(node: ChildNodeRecord): boolean {
  const title = (node.metadata.title || '').toLowerCase();
  const summary = (node.metadata.summary || '').toLowerCase();
  const text = (node.text || '').toLowerCase();
  const lex = `${title}\n${summary}\n${text}`;
  const navSignals = [
    /功能列表|适用场景|本文将帮助你选择|对比|目录|索引|入口/,
    /\|\s*功能\s*\|\s*说明\s*\|\s*适用场景\s*\|/,
  ];
  return navSignals.some((re) => re.test(lex));
}

function hasExecutableSignal(node: ChildNodeRecord, query: string): boolean {
  const title = (node.metadata.title || '').toLowerCase();
  const summary = (node.metadata.summary || '').toLowerCase();
  const text = (node.text || '').toLowerCase();
  const lex = `${title}\n${summary}\n${text}`;
  const { actionSignals } = buildQueryProfile(query);
  return actionSignals.some((re) => re.test(lex));
}

function rerankByUsageDocPriority(ranked: RankedNode[], query: string): RankedNode[] {
  if (!isUsageIntentQuery(query)) return ranked;
  return ranked
    .map((item) => ({
      ...item,
      score: item.score + calcUsageIntentContentBoost(item.node, query),
    }))
    .sort((a, b) => b.score - a.score);
}

type RerankStrategy = 'rule' | 'model';

function getRerankStrategy(): RerankStrategy {
  return config.knowledgeBase.rerankMode === 'rule' ? 'rule' : 'model';
}

function extractJSONArray(raw: string): string | null {
  const first = raw.indexOf('[');
  const last = raw.lastIndexOf(']');
  if (first < 0 || last <= first) return null;
  return raw.slice(first, last + 1);
}

async function rerankByLocalModel(query: string, ranked: RankedNode[], callbacks?: KnowledgeQueryStreamCallbacks): Promise<RankedNode[]> {
  if (ranked.length <= 1) return ranked;
  const pool = ranked.slice(0, config.knowledgeBase.rerankPoolSize);
  const docsForRerank = pool.map((item) => {
    const md = item.node.metadata;
    const text = trimContextText(item.node.text, 320).replace(/\s+/g, ' ');
    return `path=${md.filePath}\ntitle=${md.title}\nsummary=${md.summary}\ntext=${text}`;
  });
  // 优先使用 Ollama 原生 rerank 接口（适配 bge-reranker-v2-m3）
  try {
    const rerankRes = await fetch(`${config.ollama.baseUrl}/api/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.knowledgeBase.rerankModel,
        query,
        documents: docsForRerank,
        top_n: docsForRerank.length,
      }),
    });
    if (rerankRes.ok) {
      const rerankData = (await rerankRes.json()) as {
        results?: Array<{ index?: number; relevance_score?: number; score?: number }>;
        rankings?: Array<{ index?: number; relevance_score?: number; score?: number }>;
      };
      const rows = Array.isArray(rerankData.results)
        ? rerankData.results
        : Array.isArray(rerankData.rankings)
          ? rerankData.rankings
          : [];
      const scoreMap = new Map<number, number>();
      for (const row of rows) {
        const idx = Number(row.index);
        const score = Number(row.relevance_score ?? row.score);
        if (!Number.isFinite(idx) || !Number.isFinite(score)) continue;
        if (idx < 0 || idx >= pool.length) continue;
        scoreMap.set(idx, score);
      }
      if (scoreMap.size > 0) {
        callbacks?.onProgress?.(`本地模型重排完成：模型 ${config.knowledgeBase.rerankModel}（api/rerank）候选 ${pool.length}`);
        return pool
          .map((item, idx) => ({
            ...item,
            score: item.score + (scoreMap.get(idx) ?? 0) * 0.35,
          }))
          .sort((a, b) => b.score - a.score);
      }
    }
  } catch {
    // fall through to chat-based rerank
  }

  const prompt = [
    '你是知识检索重排器。请根据用户问题，为候选片段输出相关性分数。',
    '要求：',
    '1) 只返回 JSON 数组，元素格式 {"idx":数字,"score":0到1的小数}；',
    '2) idx 对应候选编号；',
    '3) 对“入口/导航”内容降分，对“可执行配置/步骤/字段映射”内容升分；',
    `问题：${query}`,
    '候选：',
    ...pool.map((item, idx) => {
      const md = item.node.metadata;
      const text = trimContextText(item.node.text, 280).replace(/\s+/g, ' ');
      return `[${idx}] path=${md.filePath} title=${md.title} summary=${md.summary} text=${text}`;
    }),
  ].join('\n');
  const res = await fetch(`${config.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.knowledgeBase.rerankModel,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
      options: {
        num_ctx: Math.max(config.knowledgeBase.numCtx, 4096),
        flash_attention: config.knowledgeBase.flashAttention,
      },
    }),
  });
  if (!res.ok) throw new Error(`本地模型重排失败：${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const raw = data.message?.content ?? '';
  const arrText = extractJSONArray(raw);
  if (!arrText) throw new Error('本地模型重排返回格式错误（缺少 JSON 数组）');
  const parsed = JSON.parse(arrText) as Array<{ idx?: number; score?: number }>;
  const scoreMap = new Map<number, number>();
  parsed.forEach((row) => {
    const idx = Number(row.idx);
    const score = Number(row.score);
    if (!Number.isFinite(idx) || !Number.isFinite(score)) return;
    if (idx < 0 || idx >= pool.length) return;
    scoreMap.set(idx, Math.max(0, Math.min(1, score)));
  });
  callbacks?.onProgress?.(`本地模型重排完成：模型 ${config.knowledgeBase.rerankModel}，候选 ${pool.length}`);
  return pool
    .map((item, idx) => ({
      ...item,
      score: item.score + (scoreMap.get(idx) ?? 0) * 0.2,
    }))
    .sort((a, b) => b.score - a.score);
}

async function rerankCandidates(
  query: string,
  ranked: RankedNode[],
  callbacks?: KnowledgeQueryStreamCallbacks
): Promise<{ ranked: RankedNode[]; strategy: RerankStrategy }> {
  const strategy = getRerankStrategy();
  if (strategy === 'rule') {
    return { ranked: rerankByUsageDocPriority(ranked, query), strategy };
  }
  try {
    callbacks?.onProgress?.(`开始本地模型重排：${config.knowledgeBase.rerankModel}`);
    const modelRanked = await rerankByLocalModel(query, ranked, callbacks);
    const withRuleBias = rerankByUsageDocPriority(modelRanked, query);
    const beforeMap = new Map(ranked.map((item) => [item.node.id, item.score]));
    const diffLines = withRuleBias.slice(0, 5).map((item, idx) => {
      const before = beforeMap.get(item.node.id) ?? 0;
      const after = item.score;
      const delta = after - before;
      return `${idx + 1}. ${item.node.metadata.filePath} ${before.toFixed(3)} -> ${after.toFixed(3)} (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(3)})`;
    });
    callbacks?.onProgress?.(`重排分数变化（Top5）\n${diffLines.join('\n')}`);
    return { ranked: withRuleBias, strategy };
  } catch (err) {
    callbacks?.onProgress?.(`本地模型重排失败，已回退规则重排：${err instanceof Error ? err.message : String(err)}`);
    return { ranked: rerankByUsageDocPriority(ranked, query), strategy: 'rule' };
  }
}

function applyUsageIntentGuard(ranked: RankedNode[], query: string, topK: number): RankedNode[] {
  if (!isUsageIntentQuery(query)) return ranked;
  const weakNavigation = ranked.filter((item) => isNavigationLike(item.node) && !hasExecutableSignal(item.node, query));
  const strongOrNormal = ranked.filter((item) => !weakNavigation.includes(item));
  const executableStrong = strongOrNormal.filter((item) => hasExecutableSignal(item.node, query));
  const nonExecutableStrong = strongOrNormal.filter((item) => !hasExecutableSignal(item.node, query));
  const prioritized = [...executableStrong, ...nonExecutableStrong];
  // 硬约束：只有前面候选不足 topK 时，才允许入口/导航片段补位
  const needFallback = Math.max(0, topK - prioritized.length);
  return needFallback > 0 ? [...prioritized, ...weakNavigation.slice(0, needFallback)] : prioritized;
}

let cachedState: CachedIndexState | null = null;
let rebuildingPromise: Promise<CachedIndexState> | null = null;

const KB_PERSIST_DIR = path.resolve(process.cwd(), config.knowledgeBase.persistDir);
const KB_META_FILE = path.join(KB_PERSIST_DIR, 'meta.json');
const KB_INGEST_CACHE_FILE = path.join(KB_PERSIST_DIR, 'ingestion-cache.json');

try {
  if (typeof (Settings as any).storageDir === 'string' || (Settings as any).storageDir === undefined) {
    (Settings as any).storageDir = KB_PERSIST_DIR;
  }
} catch {
  // ignore
}

const KNOWLEDGE_SYSTEM_PROMPT = `你是一位技术架构师。请根据参考资料回答问题，并严格遵守：
1) 严禁整段照抄参考资料，禁止连续引用超过 30 个原文字符；
2) 信息要精确完整，但表达要美观、主次分明，优先给“可执行结论”；
3) 若资料不存在直接答案，必须明确“基于现有信息推理”，并说明风险与不确定性；
4) 用 Markdown 输出，严格按以下结构（保留标题）：
### 一句话结论
用 1-2 句话先回答“怎么做/是否可行”。

### 操作步骤
用 3-6 条有序列表给出实施步骤（每条一句话，动词开头）。
每一步以“**关键词：**”开头（如 **开启开关：**、**配置模式：**），让读者可快速扫读重点。

### 关键代码（按需）
仅给最关键的最小片段，使用 \`\`\`ts 或 \`\`\`tsx 代码块；不要贴整页长代码。
若问题属于“配置/接入/开关”类，按“双层输出”：
1) 先给“快速起步配置”（可直接运行）；
2) 再给“完整配置清单”（包含可选项、默认值、省略后影响）。
在“完整配置清单”中，每个配置项固定输出三元信息：用途 / 默认值 / 不配置的后果。
并为每个配置项添加优先级标签：[必需] / [推荐] / [可选]。
若资料中出现 profile、mode、开关、环境变量、字段映射、白名单/黑名单、兼容性限制等配置维度，必须全部覆盖，不得只给最小示例。
若用户问题包含“怎么用/如何配置/怎么开启/怎么接入”，必须显式输出一节“配置项覆盖清单”，至少包含：
- profile 或模式相关配置
- 关键开关与默认值
- 主字段/从字段/映射规则（若场景存在）
- 生效条件与前置依赖
- 常见误配与排查

### 注意事项与风险
用 2-4 条 bullet 说明边界条件、兼容性、潜在风险与排查建议。

补充要求：
- 不要输出“根据资料/从文档可知”等空话；
- 不要按原文段落顺序复述；
- 标题简短、段落短句化，避免大段文字堆叠；
- 重点优先：前三条步骤必须覆盖“开关/关键配置/主字段映射”（若题目存在这三类信息）；
- 信息完整：禁止只给最小配置而不说明被省略项；
- 在答案末尾追加“覆盖自检”一行：列出已覆盖的配置维度；若某维度资料不存在，明确写“资料未提供”。`;

function nowTag(): string {
  return new Date().toISOString();
}

function logLifecycle(stage: string): void {
  console.log(`[KB][${nowTag()}] ${stage}`);
}

function isRulePatchDebugEnabled(): boolean {
  const raw = String(process.env.KB_RULE_PATCH_DEBUG ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function safeRelPath(absPath: string): string {
  const rel = path.relative(process.cwd(), absPath).split(path.sep).join('/');
  return rel || absPath;
}

function normalizeSnippet(raw: unknown, maxChars: number): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '';
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

// AI 生成 By Peng.Guo
function trimContextText(text: string, maxChars: number): string {
  const t = text.trim();
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n...（已截断）`;
}

function md5Text(text: string): string {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

function approximateTokenLimit(tokens: number): number {
  return Math.max(120, tokens * 4);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?\.])\s+|\n+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunkBySemanticSentences(text: string, chunkTokens: number, overlapTokens: number): string[] {
  const maxChars = approximateTokenLimit(chunkTokens);
  const overlapChars = approximateTokenLimit(overlapTokens);
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const candidate = current ? `${current}\n${sentence}` : sentence;
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim());
      const tail = current.slice(Math.max(0, current.length - overlapChars));
      current = `${tail}\n${sentence}`.trim();
      continue;
    }
    current = candidate;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function buildEmbeddingText(text: string, metadata: Pick<EnhancedNodeMetadata, 'title' | 'summary' | 'hypotheticalQuestions' | 'keyEntities'>): string {
  return [
    `title: ${metadata.title}`,
    `summary: ${metadata.summary}`,
    `questions: ${metadata.hypotheticalQuestions.join(' | ')}`,
    `entities: ${metadata.keyEntities.join(', ')}`,
    `content: ${text}`,
  ].join('\n');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function containsToken(doc: ChildNodeRecord, token: string): boolean {
  const joined = composeLexicalText(doc).toLowerCase();
  return joined.includes(token.toLowerCase());
}

function composeLexicalText(doc: ChildNodeRecord): string {
  return [
    doc.text,
    doc.metadata.title,
    doc.metadata.summary,
    doc.metadata.keyEntities.join(' '),
    doc.metadata.hypotheticalQuestions.join(' '),
  ].join('\n');
}

function buildSignatureFromFingerprints(fingerprints: DocFingerprint[]): string {
  return fingerprints
    .slice()
    .sort((a, b) => a.docId.localeCompare(b.docId, 'zh-CN'))
    .map((f) => `${f.docId}:${f.md5}`)
    .join('|');
}

function buildFilterStrategy(query: string): FilterStrategy {
  const queryTokens = tokenize(query);
  const possibleEntities = queryTokens.filter((t) => /[_\d-]/.test(t) || t.length > 6);
  return { query, queryTokens, possibleEntities };
}

function passesMetadataFilter(doc: ChildNodeRecord, filter: FilterStrategy): boolean {
  if (filter.possibleEntities.length === 0) return true;
  // AI 生成 By Peng.Guo：过滤时同时参考正文，避免 metadata 未覆盖术语导致误过滤（如中英混合问法）
  const bag = composeLexicalText(doc).toLowerCase();
  return filter.possibleEntities.some((t) => bag.includes(t.toLowerCase()));
}

// AI 生成 By Peng.Guo：将“严格实体过滤”改为“软优先重排”，避免硬过滤导致频繁零命中
function prioritizeEntityMatches(ranked: RankedNode[], filter: FilterStrategy): { ranked: RankedNode[]; matchedCount: number } {
  if (filter.possibleEntities.length === 0) {
    return {
      ranked: ranked.slice().sort((a, b) => b.score - a.score),
      matchedCount: 0,
    };
  }
  const sorted = ranked.slice().sort((a, b) => b.score - a.score);
  const matched = sorted.filter((item) => passesMetadataFilter(item.node, filter));
  const unmatched = sorted.filter((item) => !passesMetadataFilter(item.node, filter));
  return {
    ranked: [...matched, ...unmatched],
    matchedCount: matched.length,
  };
}

function normalizeLooseJSON(jsonLike: string): string {
  return jsonLike
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/：/g, ':')
    .replace(/，/g, ',');
}

function extractJSONObject(raw: string): string | null {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return raw.slice(first, last + 1);
}

function parseMetadataFromModel(raw: string): {
  title: string;
  summary: string;
  hypotheticalQuestions: string[];
  keyEntities: string[];
} {
  const empty = { title: '', summary: '', hypotheticalQuestions: [], keyEntities: [] };
  const objText = extractJSONObject(raw);
  if (!objText) return empty;

  const attempts = [objText, normalizeLooseJSON(objText)];
  for (const text of attempts) {
    try {
      const parsed = JSON.parse(text) as {
        title?: string;
        summary?: string;
        hypothetical_questions?: string[];
        key_entities?: string[];
      };
      return {
        title: (parsed.title ?? '').trim(),
        summary: (parsed.summary ?? '').trim().slice(0, 50),
        hypotheticalQuestions: Array.isArray(parsed.hypothetical_questions) ? parsed.hypothetical_questions.slice(0, 3).map((v) => String(v).trim()) : [],
        keyEntities: Array.isArray(parsed.key_entities) ? parsed.key_entities.slice(0, 12).map((v) => String(v).trim()) : [],
      };
    } catch {
      // continue to next parse attempt
    }
  }
  return empty;
}

async function askMetadataJSONWith35B(content: string, ingestModel: string): Promise<{
  title: string;
  summary: string;
  hypotheticalQuestions: string[];
  keyEntities: string[];
}> {
  const prompt = `请输出严格 JSON，字段为 title, summary, hypothetical_questions, key_entities。
要求：
1) summary 不超过 50 字；
2) hypothetical_questions 仅 3 条；
3) key_entities 提取术语/API/错误码；
4) 不要输出多余解释。
片段：
${content.slice(0, 5000)}`;
  const res = await fetch(`${config.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ingestModel,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
      options: {
        num_ctx: config.knowledgeBase.numCtx,
        flash_attention: config.knowledgeBase.flashAttention,
      },
    }),
  });
  if (!res.ok) throw new Error(`${ingestModel} 元数据提取失败：${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const raw = data.message?.content ?? '';
  return parseMetadataFromModel(raw);
}

async function askQuestionsWith35B(prompt: string, ingestModel: string): Promise<string[]> {
  const res = await fetch(`${config.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ingestModel,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
      options: {
        num_ctx: config.knowledgeBase.numCtx,
        flash_attention: config.knowledgeBase.flashAttention,
      },
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { message?: { content?: string } };
  const raw = data.message?.content ?? '[]';
  try {
    const json = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
    if (!Array.isArray(json)) return [];
    return json.map((v) => String(v).trim()).filter(Boolean).slice(0, 3);
  } catch {
    return [];
  }
}

function resolveIngestModel(preferredModel?: string): string {
  const normalized = preferredModel?.trim();
  return normalized || config.knowledgeBase.ingestModel;
}

async function processDocWith35B(doc: KnowledgeDoc, onProgress?: RebuildProgressCallback, preferredModel?: string): Promise<ProcessedDocCache> {
  const ingestModel = resolveIngestModel(preferredModel);
  const titleExtractor = new TitleExtractor();
  const questionExtractor = new QuestionAnsweredExtractor();
  const parentChunks = chunkBySemanticSentences(doc.text, config.knowledgeBase.parentChunkTokens, config.knowledgeBase.chunkOverlapTokens);
  const parents: ParentNodeRecord[] = [];
  const children: ChildNodeRecord[] = [];
  for (let i = 0; i < parentChunks.length; i += 1) {
    const parentText = parentChunks[i] ?? '';
    const parentId = `${doc.id}::parent::${i}`;
    const childChunks = chunkBySemanticSentences(parentText, config.knowledgeBase.childChunkTokens, config.knowledgeBase.chunkOverlapTokens);
    let parentTitle = await titleExtractor.extract(parentText);
    let parentSummary = parentText.slice(0, 50);
    let parentEntities: string[] = [];
    let parentQuestions: string[] = [];
    for (let j = 0; j < childChunks.length; j += 1) {
      const childText = childChunks[j] ?? '';
      let extracted: {
        title: string;
        summary: string;
        hypotheticalQuestions: string[];
        keyEntities: string[];
      } = { title: '', summary: '', hypotheticalQuestions: [], keyEntities: [] };
      let fallbackQuestions: string[] = [];
      try {
        extracted = await askMetadataJSONWith35B(childText, ingestModel);
      } catch (err) {
        logLifecycle(`metadata_extract_fallback (${doc.id} ${i + 1}/${parentChunks.length} ${j + 1}/${childChunks.length}) ${err instanceof Error ? err.message : String(err)}`);
      }
      try {
        fallbackQuestions = await questionExtractor.extract(childText, (prompt) => askQuestionsWith35B(prompt, ingestModel));
      } catch {
        fallbackQuestions = [];
      }
      const title = extracted.title || parentTitle;
      const summary = extracted.summary || childText.slice(0, 50);
      const hypotheticalQuestions = (extracted.hypotheticalQuestions.length ? extracted.hypotheticalQuestions : fallbackQuestions).slice(0, 3);
      const keyEntities = extracted.keyEntities;
      parentTitle = parentTitle || title;
      parentSummary = parentSummary || summary;
      parentEntities = Array.from(new Set([...parentEntities, ...keyEntities])).slice(0, 12);
      parentQuestions = Array.from(new Set([...parentQuestions, ...hypotheticalQuestions])).slice(0, 3);
      const nodeId = `${doc.id}::child::${i}-${j}`;
      const mdBase: Omit<EnhancedNodeMetadata, 'embeddingText'> = {
        filePath: safeRelPath(doc.filePath),
        docId: doc.id,
        nodeId,
        nodeType: 'child',
        parentId,
        title,
        summary,
        hypotheticalQuestions,
        keyEntities,
      };
      const child: ChildNodeRecord = {
        id: nodeId,
        text: childText,
        metadata: {
          ...mdBase,
          embeddingText: buildEmbeddingText(childText, mdBase),
        },
      };
      children.push(child);
      onProgress?.(`${ingestModel} 元数据提取: ${doc.id} parent=${i + 1}/${parentChunks.length} child=${j + 1}/${childChunks.length}`);
    }
    const parentMdBase: Omit<EnhancedNodeMetadata, 'embeddingText'> = {
      filePath: safeRelPath(doc.filePath),
      docId: doc.id,
      nodeId: parentId,
      nodeType: 'parent',
      title: parentTitle || '未命名段落',
      summary: parentSummary.slice(0, 50),
      hypotheticalQuestions: parentQuestions.slice(0, 3),
      keyEntities: parentEntities.slice(0, 12),
    };
    parents.push({
      id: parentId,
      text: parentText,
      metadata: {
        ...parentMdBase,
        embeddingText: buildEmbeddingText(parentText, parentMdBase),
      },
    });
  }
  return {
    fingerprint: { docId: doc.id, md5: md5Text(doc.text), updatedAt: new Date().toISOString() },
    parents,
    children,
  };
}

async function readCache(): Promise<IngestionCacheFile> {
  try {
    const raw = await fs.readFile(KB_INGEST_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as IngestionCacheFile;
    if (parsed?.version === 1 && parsed.docs) return parsed;
  } catch {
    // ignore
  }
  return { version: 1, docs: {}, updatedAt: new Date().toISOString() };
}

async function writeCache(cache: IngestionCacheFile): Promise<void> {
  await fs.mkdir(KB_PERSIST_DIR, { recursive: true });
  await fs.writeFile(KB_INGEST_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

async function readPersistMeta(): Promise<PersistMeta | null> {
  try {
    const raw = await fs.readFile(KB_META_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PersistMeta;
    if (!parsed || typeof parsed.signature !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePersistMeta(meta: PersistMeta): Promise<void> {
  await fs.mkdir(KB_PERSIST_DIR, { recursive: true });
  await fs.writeFile(KB_META_FILE, JSON.stringify(meta, null, 2), 'utf8');
}

async function removePersistedIndexFiles(): Promise<void> {
  try {
    await fs.rm(KB_PERSIST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function createStateFromDocs(
  docs: KnowledgeDoc[],
  onProgress?: RebuildProgressCallback,
  preferredModel?: string,
  mode: RebuildMode = 'full'
): Promise<CachedIndexState> {
  const ingestModel = resolveIngestModel(preferredModel);
  const cache = await readCache();
  onProgress?.(`[KB_PROGRESS] stage=summary status=cache_total count=${Object.keys(cache.docs).length}`);
  const nextCache: IngestionCacheFile = { version: 1, docs: {}, updatedAt: new Date().toISOString() };
  const ingestionResults: IngestionResult[] = [];
  const removedDocIds = Object.keys(cache.docs).filter((docId) => !docs.some((doc) => doc.id === docId));
  const expectedSignature = buildSignatureFromFingerprints(
    docs.map((doc) => ({
      docId: doc.id,
      md5: md5Text(doc.text),
      updatedAt: new Date(doc.mtimeMs).toISOString(),
    }))
  );
  for (const doc of docs) {
    const nextMd5 = md5Text(doc.text);
    const previous = cache.docs[doc.id];
    if (previous && previous.fingerprint.md5 === nextMd5) {
      nextCache.docs[doc.id] = previous;
      ingestionResults.push({ docId: doc.id, changed: false, parentCount: previous.parents.length, childCount: previous.children.length, md5: nextMd5 });
      onProgress?.(`[KB_PROGRESS] stage=preprocess status=reused doc=${doc.id}`);
      continue;
    }
    onProgress?.(`[KB_PROGRESS] stage=preprocess status=start doc=${doc.id}`);
    onProgress?.(`文档变更，触发预处理（模型 ${ingestModel}）：${doc.id}`);
    const processed = await processDocWith35B(doc, onProgress, ingestModel);
    nextCache.docs[doc.id] = processed;
    ingestionResults.push({
      docId: doc.id,
      changed: true,
      parentCount: processed.parents.length,
      childCount: processed.children.length,
      md5: nextMd5,
    });
    onProgress?.(`[KB_PROGRESS] stage=preprocess status=done doc=${doc.id}`);
  }
  const changedCount = ingestionResults.filter((r) => r.changed).length;
  const unchangedCount = ingestionResults.length - changedCount;
  onProgress?.(`预处理统计：总文档 ${docs.length}，变更 ${changedCount}，复用 ${unchangedCount}，删除 ${removedDocIds.length}`);
  if (mode === 'incremental') {
    onProgress?.('增量模式说明：当前仅对“文档预处理”做增量；向量索引阶段仍按全集节点重建。');
  }
  if (mode === 'incremental' && changedCount === 0 && removedDocIds.length === 0) {
    const loaded = await tryLoadPersistedState(expectedSignature, docs);
    if (loaded) {
      onProgress?.('检测到无文档变化，已直接复用已有向量索引（跳过索引重建）。');
      return loaded;
    }
    onProgress?.('无文档变化，但未找到可复用索引文件，将继续重建索引。');
  }
  await writeCache(nextCache);
  const allChildren = Object.values(nextCache.docs).flatMap((item) => item.children);
  const allParents = Object.values(nextCache.docs).flatMap((item) => item.parents);
  const parentById = Object.fromEntries(allParents.map((node) => [node.id, node]));
  onProgress?.(`预处理完成：变更文档 ${ingestionResults.filter((r) => r.changed).length} 个，共 Child 节点 ${allChildren.length} 个`);

  const embedModel = new OllamaEmbedding({
    model: config.knowledgeBase.embedModel,
    config: { host: config.ollama.baseUrl },
  });
  const llm = new Ollama({
    model: config.knowledgeBase.chatModel,
    config: { host: config.ollama.baseUrl },
    options: {
      num_ctx: config.knowledgeBase.contextWindow,
      flash_attention: config.knowledgeBase.flashAttention,
    } as Record<string, unknown>,
  });
  Settings.embedModel = embedModel;
  Settings.llm = llm;

  const storageContext = await storageContextFromDefaults({ persistDir: KB_PERSIST_DIR });
  const documents: Document[] = [];
  const docEntries = Object.entries(nextCache.docs);
  for (const [docId, docCache] of docEntries) {
    onProgress?.(`[KB_PROGRESS] stage=vector status=start doc=${docId}`);
    for (const child of docCache.children) {
      documents.push(
        new Document({
          id_: child.id,
          text: child.metadata.embeddingText,
          // 仅持久化轻量 metadata，避免 embeddingText 进入 metadata 导致 chunk-size 校验失败
          metadata: toPersistableChildMetadata(child.metadata) as unknown as Record<string, unknown>,
        })
      );
    }
    onProgress?.(`[KB_PROGRESS] stage=vector status=done doc=${docId}`);
  }
  onProgress?.('正在创建向量索引（Child 节点）...');
  const index = await VectorStoreIndex.fromDocuments(documents, { storageContext });
  await (storageContext as any).docStore?.persist?.(path.join(KB_PERSIST_DIR, 'doc_store.json'));
  await (storageContext as any).indexStore?.persist?.(path.join(KB_PERSIST_DIR, 'index_store.json'));
  const vectorStores = Object.values((storageContext as any).vectorStores ?? {});
  for (const store of vectorStores) {
    await (store as any).persist?.(path.join(KB_PERSIST_DIR, 'vector_store.json'));
  }
  const fingerprints = Object.values(nextCache.docs).map((item) => item.fingerprint);
  const signature = buildSignatureFromFingerprints(fingerprints);
  await writePersistMeta({ signature, docsCount: docs.length, updatedAt: new Date().toISOString() });
  return { signature, index, docsCount: docs.length, children: allChildren, parentById };
}

async function tryLoadPersistedState(expectedSignature: string, docs: KnowledgeDoc[]): Promise<CachedIndexState | null> {
  const meta = await readPersistMeta();
  if (!meta || meta.signature !== expectedSignature) return null;
  try {
    // AI 生成 By Peng.Guo：加载持久化索引前必须先补齐 Settings.embedModel/llm，避免 VectorStoreIndex.init 报错
    const embedModel = new OllamaEmbedding({
      model: config.knowledgeBase.embedModel,
      config: { host: config.ollama.baseUrl },
    });
    const llm = new Ollama({
      model: config.knowledgeBase.chatModel,
      config: { host: config.ollama.baseUrl },
      options: {
        num_ctx: config.knowledgeBase.contextWindow,
        flash_attention: config.knowledgeBase.flashAttention,
      } as Record<string, unknown>,
    });
    Settings.embedModel = embedModel;
    Settings.llm = llm;
    const storageContext = await storageContextFromDefaults({ persistDir: KB_PERSIST_DIR });
    const index = await VectorStoreIndex.init({ storageContext });
    const cache = await readCache();
    const allChildren = docs.flatMap((doc) => cache.docs[doc.id]?.children ?? []);
    const allParents = docs.flatMap((doc) => cache.docs[doc.id]?.parents ?? []);
    return {
      signature: expectedSignature,
      index,
      docsCount: docs.length,
      children: allChildren,
      parentById: Object.fromEntries(allParents.map((node) => [node.id, node])),
    };
  } catch {
    return null;
  }
}

function allowStaleQueryIndex(): boolean {
  const raw = String(process.env.KB_QUERY_ALLOW_STALE_INDEX ?? '1').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(raw);
}

// AI 生成 By Peng.Guo：签名不一致时允许回退到上次可用索引（避免重启后必须立即全量重建）
async function tryLoadStalePersistedState(
  persistedSignature: string,
  expectedSignature: string,
  docs: KnowledgeDoc[]
): Promise<CachedIndexState | null> {
  try {
    // AI 生成 By Peng.Guo：回退加载旧索引同样需要先初始化 embedding/llm settings
    const embedModel = new OllamaEmbedding({
      model: config.knowledgeBase.embedModel,
      config: { host: config.ollama.baseUrl },
    });
    const llm = new Ollama({
      model: config.knowledgeBase.chatModel,
      config: { host: config.ollama.baseUrl },
      options: {
        num_ctx: config.knowledgeBase.contextWindow,
        flash_attention: config.knowledgeBase.flashAttention,
      } as Record<string, unknown>,
    });
    Settings.embedModel = embedModel;
    Settings.llm = llm;
    const storageContext = await storageContextFromDefaults({ persistDir: KB_PERSIST_DIR });
    const index = await VectorStoreIndex.init({ storageContext });
    const cache = await readCache();
    const allChildrenByCurrentDocs = docs.flatMap((doc) => cache.docs[doc.id]?.children ?? []);
    const allParentsByCurrentDocs = docs.flatMap((doc) => cache.docs[doc.id]?.parents ?? []);
    const fallbackChildren =
      allChildrenByCurrentDocs.length > 0
        ? allChildrenByCurrentDocs
        : Object.values(cache.docs).flatMap((item) => item.children);
    const fallbackParents =
      allParentsByCurrentDocs.length > 0
        ? allParentsByCurrentDocs
        : Object.values(cache.docs).flatMap((item) => item.parents);
    logLifecycle(`stale_index_fallback persisted=${persistedSignature} expected=${expectedSignature}`);
    return {
      signature: expectedSignature,
      index,
      docsCount: docs.length,
      children: fallbackChildren,
      parentById: Object.fromEntries(fallbackParents.map((node) => [node.id, node])),
    };
  } catch (err) {
    logLifecycle(`stale_index_fallback_failed ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// AI 生成 By Peng.Guo：查询阶段严格只读，不再触发隐式重建
async function ensureReadonlyIndexState(): Promise<CachedIndexState> {
  const docDirs = getKnowledgeDocDirs();
  const docs = await loadMarkdownKnowledgeDocs(process.cwd(), docDirs);
  if (docs.length === 0) throw new Error(`知识库目录无 Markdown 文档，请先导入私人知识库文档：${docDirs.join(',')}`);
  const fingerprints = docs.map((doc) => ({ docId: doc.id, md5: md5Text(doc.text), updatedAt: new Date(doc.mtimeMs).toISOString() }));
  const signature = buildSignatureFromFingerprints(fingerprints);
  if (cachedState && cachedState.signature === signature) return cachedState;
  const loaded = await tryLoadPersistedState(signature, docs);
  if (loaded) {
    cachedState = loaded;
    return loaded;
  }
  const persistedMeta = await readPersistMeta();
  if (persistedMeta) {
    if (allowStaleQueryIndex()) {
      const stale = await tryLoadStalePersistedState(persistedMeta.signature, signature, docs);
      if (stale) {
        cachedState = stale;
        return stale;
      }
    }
    throw new Error('检测到知识库文档已变化，查询模式为只读，不再自动重建。请先执行“重建知识库索引”后再查询。');
  }
  throw new Error('知识库索引尚未构建。请先导入文档并执行“重建知识库索引”后再查询。');
}

function mapVectorResults(raw: unknown): RankedNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as { score?: number; node?: { id_?: string; text?: string; metadata?: Record<string, unknown> } };
      const nodeId = row.node?.id_;
      if (!nodeId) return null;
      const metadata = (row.node?.metadata ?? {}) as Record<string, unknown>;
      const hypotheticalQuestions = Array.isArray(metadata.hypotheticalQuestions)
        ? metadata.hypotheticalQuestions.map((v) => String(v))
        : Array.isArray(metadata.hypothetical_questions)
          ? (metadata.hypothetical_questions as unknown[]).map((v) => String(v))
          : [];
      const keyEntities = Array.isArray(metadata.keyEntities)
        ? metadata.keyEntities.map((v) => String(v))
        : Array.isArray(metadata.key_entities)
          ? (metadata.key_entities as unknown[]).map((v) => String(v))
          : [];
      const md: EnhancedNodeMetadata = {
        filePath: String(metadata.filePath ?? '未知来源'),
        docId: String(metadata.docId ?? ''),
        nodeId: String(metadata.nodeId ?? nodeId),
        nodeType: 'child',
        parentId: typeof metadata.parentId === 'string' ? metadata.parentId : undefined,
        title: String(metadata.title ?? ''),
        summary: String(metadata.summary ?? ''),
        hypotheticalQuestions,
        keyEntities,
        embeddingText: typeof row.node?.text === 'string' ? row.node.text : '',
      };
      return {
        node: {
          id: nodeId,
          text: typeof row.node?.text === 'string' ? row.node.text : '',
          metadata: md,
        },
        score: Number(row.score ?? 0),
      } as RankedNode;
    })
    .filter((item): item is RankedNode => !!item);
}

async function streamAnswerFromOllama(
  question: string,
  contexts: Array<{ parentText: string; childText: string; metadata: EnhancedNodeMetadata }>,
  callbacks?: KnowledgeQueryStreamCallbacks,
  modelOverride?: string
): Promise<string> {
  const contextText = contexts
    .map(
      (ctx, idx) => `# 片段${idx + 1}
标题: ${ctx.metadata.title}
摘要: ${ctx.metadata.summary}
关键词: ${ctx.metadata.keyEntities.join(', ')}
可回答问题: ${ctx.metadata.hypotheticalQuestions.join(' | ')}
Parent:
${trimContextText(ctx.parentText, 600)}

Child:
${trimContextText(ctx.childText, 420)}`
    )
    .join('\n\n---\n\n');
  const prompt = `${KNOWLEDGE_SYSTEM_PROMPT}

问题：${question}

检索上下文：
${contextText}`;
  const res = await fetch(`${config.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelOverride?.trim() || config.knowledgeBase.chatModel,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
      options: {
        num_ctx: config.knowledgeBase.contextWindow,
        flash_attention: config.knowledgeBase.flashAttention,
      },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama 流式生成失败：${res.status}`);
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let answer = '';
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;
      try {
        const json = JSON.parse(text) as { message?: { content?: string }; done?: boolean };
        const delta = json.message?.content ?? '';
        if (delta) {
          for (const ch of delta) {
            callbacks?.onAnswerDelta?.(ch);
            answer += ch;
          }
        }
      } catch {
        // ignore malformed line
      }
    }
  }
  return answer.trim();
}

function isGeminiModel(modelName?: string): boolean {
  const normalized = modelName?.trim().toLowerCase() ?? '';
  return normalized.startsWith('gemini');
}

async function streamAnswerFromSelectedModel(
  question: string,
  contexts: Array<{ parentText: string; childText: string; metadata: EnhancedNodeMetadata }>,
  callbacks?: KnowledgeQueryStreamCallbacks,
  modelOverride?: string
): Promise<string> {
  const model = modelOverride?.trim();
  if (isGeminiModel(model)) {
    const contextText = contexts
      .map(
        (ctx, idx) => `# 片段${idx + 1}
标题: ${ctx.metadata.title}
摘要: ${ctx.metadata.summary}
关键词: ${ctx.metadata.keyEntities.join(', ')}
可回答问题: ${ctx.metadata.hypotheticalQuestions.join(' | ')}
Parent:
${trimContextText(ctx.parentText, 600)}

Child:
${trimContextText(ctx.childText, 420)}`
      )
      .join('\n\n---\n\n');
    const prompt = `问题：${question}

检索上下文：
${contextText}`;
    const result = await streamGeminiText(
      [
        { role: 'system', content: KNOWLEDGE_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      { apiKey: callbacks?.apiKey ?? '', model: model!, baseUrl: callbacks?.baseUrl },
      {
        onDelta: (delta) => callbacks?.onAnswerDelta?.(delta),
      }
    );
    return result.text || '未生成答案';
  }
  return streamAnswerFromOllama(question, contexts, callbacks, modelOverride);
}

function extractQueryKeywords(question: string): string[] {
  const tokens = tokenize(question)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2);
  return Array.from(new Set(tokens));
}

function isRuleLikeSentence(line: string): boolean {
  const l = line.toLowerCase();
  return (
    l.includes(' 映射') ||
    l.includes('默认') ||
    l.includes('未传') ||
    l.includes('显式') ||
    l.includes('以该值为准') ||
    l.includes('->') ||
    l.includes('=>') ||
    l.includes(' when ') ||
    l.includes('if ')
  );
}

function normalizeCoverageKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/[`"'*#\s]+/g, ' ')
    .replace(/[^\p{L}\p{N}._/-]+/gu, ' ')
    .trim();
}

function buildRuleFamilyKey(line: string): string {
  const normalized = normalizeCoverageKey(line);
  if (!normalized) return '';
  const head = normalized.split(/[：:]/)[0] ?? normalized;
  return head
    .split(' ')
    .filter(Boolean)
    .slice(0, 8)
    .join(' ');
}

function buildRuleBlocksFromLines(lines: string[]): string[] {
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i] ?? '';
    if (!current) continue;
    const parts = [current];
    // AI 生成 By Peng.Guo：若规则句以“：”结尾，通常后续 1~2 行是映射/分支，拼接避免截断
    const needStrongContinuation = /映射[：:]?$|mapping[：:]?$/i.test(current);
    if (/[：:]$/.test(current) || needStrongContinuation) {
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
        const next = (lines[j] ?? '').trim();
        if (!next) break;
        if (/^#{1,6}\s|^###|^##|^常见问题|^注意事项|^总结/.test(next)) break;
        const isContinuation =
          /^[-*•]/.test(next) ||
          /->|=>|映射|默认|未传|merge|centered|hidden|split|displaymode|profile/i.test(next);
        if (!isContinuation) break;
        parts.push(next.replace(/^[-*•\d.)\s]+/, '').trim());
        // 如果已经包含映射箭头和目标值，可提前结束
        const joined = parts.join(' ').toLowerCase();
        if ((joined.includes('->') || joined.includes('=>')) && (joined.includes('centered') || joined.includes('hidden'))) {
          break;
        }
      }
    }
    blocks.push(parts.join(' '));
  }
  return blocks;
}

function extractMustContainTokensFromRule(line: string): string[] {
  const key = normalizeCoverageKey(line);
  if (!key) return [];
  const base = key.split(' ').filter(Boolean).slice(0, 3);
  const extra: string[] = [];
  const lower = line.toLowerCase();
  const mappingWords = [
    'detaillistdisplaymode',
    'displaymode',
    'merge-center',
    'merge-top',
    'centered',
    'hidden',
  ];
  for (const w of mappingWords) {
    if (lower.includes(w)) extra.push(w);
  }
  if (lower.includes('->') || lower.includes('=>') || lower.includes('映射')) {
    // 映射类规则需要更严格校验，避免“只有前半句被判已覆盖”
    return Array.from(new Set([...base, ...extra])).slice(0, 8);
  }
  return base;
}

function collectCriticalRuleCandidates(
  question: string,
  contexts: Array<{ parentText: string; childText: string; metadata: EnhancedNodeMetadata }>
): string[] {
  const keywords = extractQueryKeywords(question);
  const lines = contexts
    .flatMap((ctx) => `${ctx.parentText}\n${ctx.childText}`.split(/\r?\n/))
    .map((line) => line.trim())
    .filter((line) => line.length >= 12);
  const ruleBlocks = buildRuleBlocksFromLines(lines);
  const scored = ruleBlocks
    .map((block) => {
      const lower = block.toLowerCase();
      const hit = keywords.filter((k) => lower.includes(k)).length;
      const configSignal = /[a-zA-Z]+\.[a-zA-Z]+|masterfield|slavefields?|displaymode|profile|默认|映射|未传|显式/.test(lower)
        ? 1
        : 0;
      const ruleSignal = isRuleLikeSentence(lower) ? 1 : 0;
      // AI 生成 By Peng.Guo：完整规则块优先于半截规则块（含箭头映射、枚举值、更长上下文）
      const hasArrow = /->|=>/.test(lower) ? 1 : 0;
      const hasRuleTargets = /(centered|hidden|split|merge-center|merge-top|true|false)/.test(lower) ? 1 : 0;
      const lengthBonus = Math.min(2, Math.floor(block.length / 90));
      const score = hit * 2 + configSignal * 2 + ruleSignal * 2 + hasArrow * 3 + hasRuleTargets * 2 + lengthBonus;
      return { block, score, family: buildRuleFamilyKey(block) };
    })
    .filter((row) => row.score >= 4)
    .sort((a, b) => b.score - a.score);
  const bestByFamily = new Map<string, { block: string; score: number }>();
  for (const row of scored) {
    const family = row.family || normalizeCoverageKey(row.block);
    if (!family) continue;
    const prev = bestByFamily.get(family);
    if (!prev || row.score > prev.score || (row.score === prev.score && row.block.length > prev.block.length)) {
      bestByFamily.set(family, { block: row.block, score: row.score });
    }
  }
  const selected = Array.from(bestByFamily.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.block.replace(/^[-*•\d.)\s]+/, '').trim());
  if (isRulePatchDebugEnabled()) {
    const topCandidates = scored.slice(0, 8).map((item) => ({
      score: item.score,
      family: item.family || normalizeCoverageKey(item.block),
      preview: item.block.slice(0, 220),
    }));
    console.log(
      `[KB][${nowTag()}] [RULE_PATCH_DEBUG] topCandidates=${JSON.stringify(topCandidates)} selected=${JSON.stringify(
        selected.slice(0, 4)
      )}`
    );
  }
  return selected;
}

function patchMissingCriticalRules(
  question: string,
  answer: string,
  contexts: Array<{ parentText: string; childText: string; metadata: EnhancedNodeMetadata }>
): string {
  const candidates = collectCriticalRuleCandidates(question, contexts);
  if (candidates.length === 0) return answer;
  const answerNorm = normalizeCoverageKey(answer);
  const missing = candidates.filter((line) => {
    const mustContainTokens = extractMustContainTokensFromRule(line);
    if (mustContainTokens.length === 0) return false;
    return !mustContainTokens.every((tk) => answerNorm.includes(tk));
  });
  if (isRulePatchDebugEnabled()) {
    console.log(
      `[KB][${nowTag()}] [RULE_PATCH_DEBUG] candidates=${JSON.stringify(candidates)} missing=${JSON.stringify(
        missing
      )}`
    );
  }
  if (missing.length === 0) return answer;
  const patch = ['### 关键规则补充（检索兜底）', ...missing.slice(0, 3).map((line) => `- ${line}`)].join('\n');
  return `${answer.trim()}\n\n${patch}`;
}

export async function ingestDocument(doc: KnowledgeDoc, onProgress?: RebuildProgressCallback, preferredModel?: string): Promise<IngestionResult> {
  const ingestModel = resolveIngestModel(preferredModel);
  const cache = await readCache();
  const nextMd5 = md5Text(doc.text);
  const previous = cache.docs[doc.id];
  if (previous && previous.fingerprint.md5 === nextMd5) {
    return {
      docId: doc.id,
      changed: false,
      parentCount: previous.parents.length,
      childCount: previous.children.length,
      md5: nextMd5,
    };
  }
  const processed = await processDocWith35B(doc, onProgress, ingestModel);
  cache.docs[doc.id] = processed;
  cache.updatedAt = new Date().toISOString();
  await writeCache(cache);
  return {
    docId: doc.id,
    changed: true,
    parentCount: processed.parents.length,
    childCount: processed.children.length,
    md5: nextMd5,
  };
}

export async function rebuildKnowledgeIndex(onProgress?: RebuildProgressCallback, preferredModel?: string): Promise<{ docsCount: number }> {
  onProgress?.(`索引目录: ${KB_PERSIST_DIR}`);
  const docDirs = getKnowledgeDocDirs();
  const docs = await loadMarkdownKnowledgeDocs(process.cwd(), docDirs);
  if (docs.length === 0) throw new Error(`知识库目录无 Markdown 文档，请先导入私人知识库文档：${docDirs.join(',')}`);
  await fs.mkdir(KB_PERSIST_DIR, { recursive: true });
  onProgress?.(`重建索引预处理模型：${resolveIngestModel(preferredModel)}（优先当前项目模型）`);
  const state = await createStateFromDocs(docs, onProgress, preferredModel, 'full');
  cachedState = state;
  return { docsCount: state.docsCount };
}

// AI 生成 By Peng.Guo：增量重建（预处理增量 + 无变更时复用已持久化索引）
export async function incrementalRebuildKnowledgeIndex(
  onProgress?: RebuildProgressCallback,
  preferredModel?: string
): Promise<{ docsCount: number }> {
  onProgress?.(`索引目录: ${KB_PERSIST_DIR}`);
  const docDirs = getKnowledgeDocDirs();
  const docs = await loadMarkdownKnowledgeDocs(process.cwd(), docDirs);
  if (docs.length === 0) throw new Error(`知识库目录无 Markdown 文档，请先导入私人知识库文档：${docDirs.join(',')}`);
  await fs.mkdir(KB_PERSIST_DIR, { recursive: true });
  onProgress?.(`增量重建预处理模型：${resolveIngestModel(preferredModel)}（优先当前项目模型）`);
  const state = await createStateFromDocs(docs, onProgress, preferredModel, 'incremental');
  cachedState = state;
  return { docsCount: state.docsCount };
}

export async function forceRebuildKnowledgeIndex(onProgress?: RebuildProgressCallback, preferredModel?: string): Promise<{ docsCount: number }> {
  await removePersistedIndexFiles();
  cachedState = null;
  return rebuildKnowledgeIndex(onProgress, preferredModel);
}

// AI 生成 By Peng.Guo
export async function clearKnowledgeIndexStorage(onProgress?: RebuildProgressCallback): Promise<void> {
  onProgress?.(`正在清理知识库索引目录: ${KB_PERSIST_DIR}`);
  await removePersistedIndexFiles();
  cachedState = null;
  rebuildingPromise = null;
}

export async function queryKnowledgeIndex(question: string, chatModel?: string, callbacks?: KnowledgeQueryStreamCallbacks): Promise<KnowledgeQueryResult> {
  const q = question.trim();
  if (!q) throw new Error('知识库查询问题不能为空');
  const hybridQuery = buildExpandedHybridQuery(q);
  const retrieveStartMs = Date.now();
  callbacks?.onProgress?.('开始检索知识库...');
  logLifecycle('retrieve_start');
  const slowTimer = setTimeout(() => {
    callbacks?.onProgress?.('正在检索高价值知识点，请稍候...');
    console.log(`[KB][${nowTag()}] 正在检索高价值知识点，请稍候...`);
  }, 5000);
  const state = await ensureReadonlyIndexState();
  const filter = buildFilterStrategy(q);
  const relaxedFilter: FilterStrategy = { query: q, queryTokens: filter.queryTokens, possibleEntities: [] };

  const vectorRetriever = state.index.asRetriever({ similarityTopK: config.knowledgeBase.hybridTopK });
  const rawVector = await (vectorRetriever as any).retrieve?.(hybridQuery);
  const vectorRanked = mapVectorResults(rawVector);
  const keywordRetriever = new KeywordRetriever(state.children);
  const keywordRanked = keywordRetriever.retrieve(hybridQuery, config.knowledgeBase.hybridTopK, relaxedFilter);

  const vectorPrioritized = prioritizeEntityMatches(vectorRanked, filter);
  const keywordPrioritized = prioritizeEntityMatches(keywordRanked, filter);
  const rankedLists: RankedNode[][] = [vectorPrioritized.ranked, keywordPrioritized.ranked];
  if (filter.possibleEntities.length > 0) {
    if (vectorPrioritized.matchedCount > 0 || keywordPrioritized.matchedCount > 0) {
      callbacks?.onProgress?.(
        `实体增强重排已启用：向量命中 ${vectorPrioritized.matchedCount} 条，关键词命中 ${keywordPrioritized.matchedCount} 条`
      );
      // AI 生成 By Peng.Guo：追加实体优先列表到 RRF，作为软约束加权而非硬过滤
      rankedLists.push(vectorPrioritized.ranked, keywordPrioritized.ranked);
    } else {
      callbacks?.onProgress?.('实体增强未命中，已自动使用宽松检索结果');
    }
  }
  const normalizeByMax = (items: RankedNode[]): RankedNode[] => {
    const maxScore = items.reduce((max, item) => Math.max(max, item.score), 0);
    if (maxScore <= 0) return items.map((item) => ({ ...item, score: 0 }));
    return items.map((item) => ({ ...item, score: item.score / maxScore }));
  };
  const fuseByAlpha = (vector: RankedNode[], keyword: RankedNode[], topN: number, alpha: number): RankedNode[] => {
    // alpha 表示向量权重，关键词权重为 (1 - alpha)
    const vectorWeight = Math.max(0, Math.min(1, alpha));
    const keywordWeight = 1 - vectorWeight;
    const vectorNorm = normalizeByMax(vector);
    const keywordNorm = normalizeByMax(keyword);
    const merged = new Map<string, RankedNode>();
    const upsert = (item: RankedNode, weight: number) => {
      const id = item.node.id;
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, { node: item.node, score: item.score * weight });
        return;
      }
      existing.score += item.score * weight;
      merged.set(id, existing);
    };
    vectorNorm.forEach((item) => upsert(item, vectorWeight));
    keywordNorm.forEach((item) => upsert(item, keywordWeight));
    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  };
  const fusedRaw = fuseByAlpha(
    vectorPrioritized.ranked,
    keywordPrioritized.ranked,
    Math.max(config.knowledgeBase.topK, config.knowledgeBase.rerankPoolSize, config.knowledgeBase.topK * 3),
    config.knowledgeBase.hybridAlpha
  );
  const { ranked: reranked, strategy } = await rerankCandidates(q, fusedRaw, callbacks);
  const guarded = applyUsageIntentGuard(reranked, q, config.knowledgeBase.topK);
  const maxPerDoc = isUsageIntentQuery(q) ? 1 : 2;
  const fused = diversifyByDocSource(guarded, config.knowledgeBase.topK, maxPerDoc);
  const recursiveRetriever = new RecursiveRetriever(state.parentById);
  const hydrated = recursiveRetriever.hydrate(fused);
  clearTimeout(slowTimer);
  const elapsed = Date.now() - retrieveStartMs;
  logLifecycle(`retrieve_done (${elapsed}ms)`);
  const hitDocCount = new Set(hydrated.map((row) => row.child.node.metadata.docId || row.child.node.metadata.filePath)).size;
  callbacks?.onProgress?.(
    `检索完成，用时 ${elapsed}ms，hybrid(alpha=${config.knowledgeBase.hybridAlpha.toFixed(2)}, 向量=${config.knowledgeBase.hybridAlpha.toFixed(
      2
    )}, 关键词=${(1 - config.knowledgeBase.hybridAlpha).toFixed(2)})，重排=${strategy}，命中 ${hydrated.length} 个候选片段，覆盖 ${hitDocCount} 个文档`
  );

  const contexts = hydrated.map((row) => ({
    parentText: row.parent?.text ?? row.child.node.text,
    childText: row.child.node.text,
    metadata: row.child.node.metadata,
  }));
  logLifecycle('generation_start');
  callbacks?.onProgress?.('LLM 开始生成（streaming=true）...');
  const rawAnswer = await streamAnswerFromSelectedModel(q, contexts, callbacks, chatModel);
  const answer = patchMissingCriticalRules(q, rawAnswer, contexts);
  const citations = hydrated.map((item) => ({
    path: item.child.node.metadata.filePath,
    score: item.child.score,
    snippet: normalizeSnippet(item.parent?.text ?? item.child.node.text, config.knowledgeBase.maxSnippetChars),
  }));
  return {
    answer: answer || '未生成答案',
    citations,
    docsCount: state.docsCount,
  };
}
