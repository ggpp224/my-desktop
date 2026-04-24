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

// AI 生成 By Peng.Guo：尝试设置全局存储路径，防止 llamaindex 在项目根目录创建 storage
try {
  if (typeof (Settings as any).storageDir === 'string' || (Settings as any).storageDir === undefined) {
    (Settings as any).storageDir = KB_PERSIST_DIR;
  }
} catch {
  /* 如果 Settings 不支持 storageDir，忽略 */
}

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

// AI 生成 By Peng.Guo
export type RebuildProgressCallback = (message: string) => void;

// AI 生成 By Peng.Guo：确保项目根目录下没有 storage 文件阻塞
async function ensureNoStorageFileConflict(): Promise<void> {
  try {
    const storagePath = path.resolve(process.cwd(), 'storage');
    try {
      const stat = await fs.stat(storagePath);
      // 如果是文件，删除它
      if (stat.isFile()) {
        await fs.unlink(storagePath);
      }
      // 如果是目录，清空它但保留目录
      if (stat.isDirectory()) {
        const files = await fs.readdir(storagePath);
        for (const file of files) {
          await fs.rm(path.join(storagePath, file), { recursive: true, force: true });
        }
      }
    } catch (err: any) {
      // storage 不存在，创建空目录
      if (err?.code === 'ENOENT') {
        await fs.mkdir(storagePath, { recursive: true });
      }
    }
  } catch {
    /* 忽略所有错误 */
  }
}

async function createIndexState(onProgress?: RebuildProgressCallback): Promise<CachedIndexState> {
  await ensureNoStorageFileConflict();
  onProgress?.('正在加载文档...');
  const docs = await loadMarkdownKnowledgeDocs(process.cwd(), config.knowledgeBase.docDirs);
  if (docs.length === 0) {
    throw new Error(`知识库目录无 Markdown 文档，请检查 KB_DOC_DIRS=${config.knowledgeBase.docDirs.join(',')}`);
  }
  onProgress?.(`已加载 ${docs.length} 个文档，正在初始化模型...`);

  // AI 生成 By Peng.Guo：确保 KB_PERSIST_DIR 存在
  await fs.mkdir(KB_PERSIST_DIR, { recursive: true });

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
  onProgress?.('正在创建向量索引（这可能需要几分钟）...');

  const storageContext = await storageContextFromDefaults({ persistDir: KB_PERSIST_DIR });
  const documents = docs.map((doc) => new Document({ id_: doc.id, text: doc.text, metadata: { filePath: safeRelPath(doc.filePath) } }));
  const index = await VectorStoreIndex.fromDocuments(documents, { storageContext });
  onProgress?.('正在保存索引到磁盘...');

  // AI 生成 By Peng.Guo：手动持久化各个 store，传入完整的文件路径
  const docStorePath = path.join(KB_PERSIST_DIR, 'doc_store.json');
  const indexStorePath = path.join(KB_PERSIST_DIR, 'index_store.json');
  const vectorStorePath = path.join(KB_PERSIST_DIR, 'vector_store.json');

  await (storageContext as any).docStore?.persist?.(docStorePath);
  await (storageContext as any).indexStore?.persist?.(indexStorePath);
  const vectorStores = Object.values((storageContext as any).vectorStores ?? {});
  for (const store of vectorStores) {
    await (store as any).persist?.(vectorStorePath);
  }

  const state = { signature: buildSignature(docs), index, docsCount: docs.length };
  await writePersistMeta({ signature: state.signature, docsCount: state.docsCount, updatedAt: new Date().toISOString() });
  onProgress?.(`索引创建完成，共 ${docs.length} 个文档`);
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
  // AI 生成 By Peng.Guo：清理项目根目录下可能存在的 storage 文件/目录
  try {
    const storagePath = path.resolve(process.cwd(), 'storage');
    const stat = await fs.stat(storagePath);
    if (stat.isFile()) {
      await fs.unlink(storagePath);
    } else if (stat.isDirectory()) {
      await fs.rm(storagePath, { recursive: true, force: true });
    }
  } catch {
    /* storage 不存在或删除失败，忽略 */
  }
}

async function writePersistMeta(meta: PersistMeta): Promise<void> {
  await fs.mkdir(KB_PERSIST_DIR, { recursive: true });
  await fs.writeFile(KB_META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

async function persistStorageContext(storageContext: unknown, persistDir: string): Promise<void> {
  const ctx = storageContext as {
    docStore?: { persist?: (path: string) => void | Promise<void> };
    indexStore?: { persist?: (path: string) => void | Promise<void> };
    vectorStores?: Record<string, { persist?: (path: string) => void | Promise<void> }>;
  };
  await ctx.docStore?.persist?.(persistDir);
  await ctx.indexStore?.persist?.(persistDir);
  const vectorStores = Object.values(ctx.vectorStores ?? {});
  for (const store of vectorStores) {
    await store.persist?.(persistDir);
  }
}

async function tryLoadPersistedState(expectedSignature: string, docsCount: number): Promise<CachedIndexState | null> {
  await ensureNoStorageFileConflict();
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
  await ensureNoStorageFileConflict();
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
    // AI 生成 By Peng.Guo：加载失败或签名不匹配，重新构建索引
    if (docs.length === 0) {
      throw new Error(`知识库目录无 Markdown 文档，请检查 KB_DOC_DIRS=${config.knowledgeBase.docDirs.join(',')}`);
    }
    await removePersistedIndexFiles();
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
    await persistStorageContext(storageContext, KB_PERSIST_DIR);
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

export async function rebuildKnowledgeIndex(onProgress?: RebuildProgressCallback): Promise<{ docsCount: number }> {
  onProgress?.('正在清理旧索引...');
  await removePersistedIndexFiles();
  const state = await createIndexState(onProgress);
  cachedState = state;
  return { docsCount: state.docsCount };
}

export async function queryKnowledgeIndex(question: string, chatModel?: string): Promise<KnowledgeQueryResult> {
  const q = question.trim();
  if (!q) throw new Error('知识库查询问题不能为空');
  const state = await ensureIndexState();

  // AI 生成 By Peng.Guo：使用传入的模型或默认模型
  const modelToUse = chatModel?.trim() || config.knowledgeBase.chatModel;
  const llm = new Ollama({
    model: modelToUse,
    config: { host: config.ollama.baseUrl },
  });
  Settings.llm = llm;

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
