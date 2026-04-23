/* AI 生成 By Peng.Guo */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Document, Settings, VectorStoreIndex, storageContextFromDefaults } from 'llamaindex';
import { Ollama, OllamaEmbedding } from '@llamaindex/ollama';
import { config } from '../../config/default.js';
import type { KnowledgeDoc } from './markdown-data-source.js';
import { loadMarkdownKnowledgeDocs } from './markdown-data-source.js';

type CachedIndexState = {
  signature: string;
  index: VectorStoreIndex;
  docsCount: number;
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

let cachedState: CachedIndexState | null = null;
let rebuildingPromise: Promise<CachedIndexState> | null = null;
const KB_PERSIST_DIR = path.resolve(process.cwd(), 'runtime', 'knowledge-index');
const KB_META_FILE = path.join(KB_PERSIST_DIR, 'meta.json');

function buildSignature(docs: KnowledgeDoc[]): string {
  return docs.map((doc) => `${doc.id}:${Math.floor(doc.mtimeMs)}`).join('|');
}

function normalizeSnippet(raw: unknown, maxChars: number): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function safeRelPath(absPath: string): string {
  const rel = path.relative(process.cwd(), absPath).split(path.sep).join('/');
  return rel || absPath;
}

async function createIndexState(): Promise<CachedIndexState> {
  const docs = await loadMarkdownKnowledgeDocs(process.cwd(), config.knowledgeBase.docDirs);
  if (docs.length === 0) {
    throw new Error(`知识库目录无 Markdown 文档，请检查 KB_DOC_DIRS=${config.knowledgeBase.docDirs.join(',')}`);
  }
  const llm = new Ollama({
    model: config.knowledgeBase.chatModel,
    config: { host: config.ollama.baseUrl },
  });
  const embedModel = new OllamaEmbedding({
    model: config.knowledgeBase.embedModel,
    config: { host: config.ollama.baseUrl },
  });
  Settings.llm = llm;
  Settings.embedModel = embedModel;
  const storageContext = await storageContextFromDefaults({ persistDir: KB_PERSIST_DIR });
  const documents = docs.map((doc) => new Document({ id_: doc.id, text: doc.text, metadata: { filePath: safeRelPath(doc.filePath) } }));
  const index = await VectorStoreIndex.fromDocuments(documents, { storageContext });
  await persistStorageContext(storageContext);
  const state = { signature: buildSignature(docs), index, docsCount: docs.length };
  await writePersistMeta({ signature: state.signature, docsCount: state.docsCount, updatedAt: new Date().toISOString() });
  return state;
}

async function readPersistMeta(): Promise<PersistMeta | null> {
  try {
    const raw = await fs.readFile(KB_META_FILE, 'utf-8');
    const data = JSON.parse(raw) as PersistMeta;
    if (!data || typeof data.signature !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

async function removePersistedIndexFiles(): Promise<void> {
  try {
    await fs.rm(KB_PERSIST_DIR, { recursive: true, force: true });
  } catch {
    /* ignore cleanup error */
  }
}

async function writePersistMeta(meta: PersistMeta): Promise<void> {
  await fs.mkdir(KB_PERSIST_DIR, { recursive: true });
  await fs.writeFile(KB_META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

async function persistStorageContext(storageContext: unknown): Promise<void> {
  const ctx = storageContext as {
    docStore?: { persist?: () => void | Promise<void> };
    indexStore?: { persist?: () => void | Promise<void> };
    vectorStores?: Record<string, { persist?: () => void | Promise<void> }>;
  };
  await ctx.docStore?.persist?.();
  await ctx.indexStore?.persist?.();
  const vectorStores = Object.values(ctx.vectorStores ?? {});
  for (const store of vectorStores) {
    await store.persist?.();
  }
}

async function tryLoadPersistedState(expectedSignature: string, docsCount: number): Promise<CachedIndexState | null> {
  const meta = await readPersistMeta();
  if (!meta || meta.signature !== expectedSignature) return null;
  try {
    const storageContext = await storageContextFromDefaults({ persistDir: KB_PERSIST_DIR });
    const index = await VectorStoreIndex.init({ storageContext });
    return { signature: expectedSignature, index, docsCount };
  } catch {
    await removePersistedIndexFiles();
    return null;
  }
}

async function ensureIndexState(): Promise<CachedIndexState> {
  const docs = await loadMarkdownKnowledgeDocs(process.cwd(), config.knowledgeBase.docDirs);
  const nextSignature = buildSignature(docs);
  if (cachedState && cachedState.signature === nextSignature) return cachedState;
  if (rebuildingPromise) return rebuildingPromise;
  rebuildingPromise = (async () => {
    const loaded = await tryLoadPersistedState(nextSignature, docs.length);
    if (loaded) {
      cachedState = loaded;
      return loaded;
    }
    const llm = new Ollama({
      model: config.knowledgeBase.chatModel,
      config: { host: config.ollama.baseUrl },
    });
    const embedModel = new OllamaEmbedding({
      model: config.knowledgeBase.embedModel,
      config: { host: config.ollama.baseUrl },
    });
    Settings.llm = llm;
    Settings.embedModel = embedModel;
    if (docs.length === 0) {
      throw new Error(`知识库目录无 Markdown 文档，请检查 KB_DOC_DIRS=${config.knowledgeBase.docDirs.join(',')}`);
    }
    await removePersistedIndexFiles();
    const storageContext = await storageContextFromDefaults({ persistDir: KB_PERSIST_DIR });
    const documents = docs.map((doc) => new Document({ id_: doc.id, text: doc.text, metadata: { filePath: safeRelPath(doc.filePath) } }));
    const index = await VectorStoreIndex.fromDocuments(documents, { storageContext });
    await persistStorageContext(storageContext);
    const state = { signature: nextSignature, index, docsCount: docs.length };
    await writePersistMeta({ signature: state.signature, docsCount: state.docsCount, updatedAt: new Date().toISOString() });
    cachedState = state;
    return state;
  })();
  try {
    return await rebuildingPromise;
  } finally {
    rebuildingPromise = null;
  }
}

export async function rebuildKnowledgeIndex(): Promise<{ docsCount: number }> {
  await removePersistedIndexFiles();
  const state = await createIndexState();
  cachedState = state;
  return { docsCount: state.docsCount };
}

export async function queryKnowledgeIndex(question: string): Promise<KnowledgeQueryResult> {
  const q = question.trim();
  if (!q) throw new Error('知识库查询问题不能为空');
  const state = await ensureIndexState();
  const retriever = state.index.asRetriever({ similarityTopK: config.knowledgeBase.topK });
  const queryEngine = state.index.asQueryEngine({ retriever });
  const response = (await queryEngine.query({ query: q })) as {
    response?: string;
    toString?: () => string;
    sourceNodes?: Array<{ score?: number; metadata?: Record<string, unknown>; node?: { text?: string; metadata?: Record<string, unknown> } }>;
  };
  const sourceNodes = Array.isArray(response.sourceNodes) ? response.sourceNodes : [];
  const citations: KnowledgeCitation[] = sourceNodes
    .map((item) => {
      const metadata = item.node?.metadata ?? item.metadata ?? {};
      const relPathRaw = metadata.filePath;
      const sourcePath = typeof relPathRaw === 'string' && relPathRaw.trim() ? relPathRaw.trim() : '未知来源';
      const snippet = normalizeSnippet(item.node?.text, config.knowledgeBase.maxSnippetChars);
      return { path: sourcePath, score: item.score, snippet };
    })
    .filter((item) => !!item.snippet);
  const answer = (typeof response.response === 'string' && response.response.trim()) || response.toString?.().trim() || '未生成答案';
  return { answer, citations, docsCount: state.docsCount };
}
