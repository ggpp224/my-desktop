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

class BM25Retriever {
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

### 注意事项与风险
用 2-4 条 bullet 说明边界条件、兼容性、潜在风险与排查建议。

补充要求：
- 不要输出“根据资料/从文档可知”等空话；
- 不要按原文段落顺序复述；
- 标题简短、段落短句化，避免大段文字堆叠；
- 重点优先：前三条步骤必须覆盖“开关/关键配置/主字段映射”（若题目存在这三类信息）；
- 信息完整：禁止只给最小配置而不说明被省略项。`;

function nowTag(): string {
  return new Date().toISOString();
}

function logLifecycle(stage: string): void {
  console.log(`[KB][${nowTag()}] ${stage}`);
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

async function createStateFromDocs(docs: KnowledgeDoc[], onProgress?: RebuildProgressCallback, preferredModel?: string): Promise<CachedIndexState> {
  const ingestModel = resolveIngestModel(preferredModel);
  const cache = await readCache();
  const nextCache: IngestionCacheFile = { version: 1, docs: {}, updatedAt: new Date().toISOString() };
  const ingestionResults: IngestionResult[] = [];
  for (const doc of docs) {
    const nextMd5 = md5Text(doc.text);
    const previous = cache.docs[doc.id];
    if (previous && previous.fingerprint.md5 === nextMd5) {
      nextCache.docs[doc.id] = previous;
      ingestionResults.push({ docId: doc.id, changed: false, parentCount: previous.parents.length, childCount: previous.children.length, md5: nextMd5 });
      continue;
    }
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
  const documents = allChildren.map(
    (child) =>
      new Document({
        id_: child.id,
        text: child.metadata.embeddingText,
        // 仅持久化轻量 metadata，避免 embeddingText 进入 metadata 导致 chunk-size 校验失败
        metadata: toPersistableChildMetadata(child.metadata) as unknown as Record<string, unknown>,
      })
  );
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
  const state = await createStateFromDocs(docs, onProgress, preferredModel);
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
  const rawVector = await (vectorRetriever as any).retrieve?.(q);
  const vectorRanked = mapVectorResults(rawVector);
  const bm25Retriever = new BM25Retriever(state.children);
  const bm25Ranked = bm25Retriever.retrieve(q, config.knowledgeBase.hybridTopK, relaxedFilter);

  const vectorPrioritized = prioritizeEntityMatches(vectorRanked, filter);
  const bm25Prioritized = prioritizeEntityMatches(bm25Ranked, filter);
  const rankedLists: RankedNode[][] = [vectorPrioritized.ranked, bm25Prioritized.ranked];
  if (filter.possibleEntities.length > 0) {
    if (vectorPrioritized.matchedCount > 0 || bm25Prioritized.matchedCount > 0) {
      callbacks?.onProgress?.(
        `实体增强重排已启用：向量命中 ${vectorPrioritized.matchedCount} 条，关键词命中 ${bm25Prioritized.matchedCount} 条`
      );
      // AI 生成 By Peng.Guo：追加实体优先列表到 RRF，作为软约束加权而非硬过滤
      rankedLists.push(vectorPrioritized.ranked, bm25Prioritized.ranked);
    } else {
      callbacks?.onProgress?.('实体增强未命中，已自动使用宽松检索结果');
    }
  }
  const fused = new ReciprocalRankFusion(config.knowledgeBase.rrfK).fuse(rankedLists, config.knowledgeBase.topK);
  const recursiveRetriever = new RecursiveRetriever(state.parentById);
  const hydrated = recursiveRetriever.hydrate(fused);
  clearTimeout(slowTimer);
  const elapsed = Date.now() - retrieveStartMs;
  logLifecycle(`retrieve_done (${elapsed}ms)`);
  callbacks?.onProgress?.(`检索完成，用时 ${elapsed}ms，命中 ${hydrated.length} 个候选片段`);

  const contexts = hydrated.map((row) => ({
    parentText: row.parent?.text ?? row.child.node.text,
    childText: row.child.node.text,
    metadata: row.child.node.metadata,
  }));
  logLifecycle('generation_start');
  callbacks?.onProgress?.('LLM 开始生成（streaming=true）...');
  const answer = await streamAnswerFromSelectedModel(q, contexts, callbacks, chatModel);
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
