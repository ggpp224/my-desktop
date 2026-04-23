/* AI 生成 By Peng.Guo */
import { config } from '../../config/default.js';
import { queryKnowledgeIndex, rebuildKnowledgeIndex } from './llamaindex-retriever.js';

export type KnowledgeAnswerPayload = {
  success: boolean;
  answer?: string;
  citations?: Array<{ path: string; score?: number; snippet: string }>;
  docsCount?: number;
  model?: { chat: string; embed: string };
  error?: string;
};

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

function isModelInstalled(installedNames: Set<string>, expectedModel: string): boolean {
  const target = expectedModel.trim().toLowerCase();
  if (!target) return false;
  if (installedNames.has(target)) return true;
  const base = target.split(':')[0] ?? target;
  for (const installed of installedNames) {
    const normalized = installed.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === base) return true;
    if (normalized.startsWith(`${base}:`)) return true;
  }
  return false;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

async function ensureKnowledgeModelsInstalled(): Promise<void> {
  const res = await fetch(`${config.ollama.baseUrl}/api/tags`);
  if (!res.ok) throw new Error(`无法连接 Ollama：${res.status}`);
  const data = (await res.json()) as OllamaTagsResponse;
  const names = new Set(
    (data.models ?? [])
      .flatMap((item) => [item.name, item.model])
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
  if (!isModelInstalled(names, config.knowledgeBase.embedModel)) {
    throw new Error(`知识库嵌入模型未安装：${config.knowledgeBase.embedModel}。请先执行 ollama pull ${config.knowledgeBase.embedModel}`);
  }
  if (!isModelInstalled(names, config.knowledgeBase.chatModel)) {
    throw new Error(`知识库问答模型未安装：${config.knowledgeBase.chatModel}。请先执行 ollama pull ${config.knowledgeBase.chatModel}`);
  }
}

export async function queryKnowledgeBase(question: string): Promise<KnowledgeAnswerPayload> {
  try {
    await ensureKnowledgeModelsInstalled();
    const data = await withTimeout(
      queryKnowledgeIndex(question),
      config.knowledgeBase.queryTimeoutMs,
      `知识库查询超时（>${config.knowledgeBase.queryTimeoutMs}ms），请稍后重试或调大 KB_QUERY_TIMEOUT_MS`
    );
    return {
      success: true,
      answer: data.answer,
      citations: data.citations,
      docsCount: data.docsCount,
      model: {
        chat: config.knowledgeBase.chatModel,
        embed: config.knowledgeBase.embedModel,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      model: {
        chat: config.knowledgeBase.chatModel,
        embed: config.knowledgeBase.embedModel,
      },
    };
  }
}

export async function rebuildKnowledgeBaseIndex(): Promise<{ success: boolean; docsCount?: number; error?: string }> {
  try {
    const result = await rebuildKnowledgeIndex();
    return { success: true, docsCount: result.docsCount };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// AI 生成 By Peng.Guo
export async function listKnowledgeDocs(): Promise<{
  success: boolean;
  docs?: Array<{ id: string; filePath: string; relativePath: string; size: number; modifiedAt: string }>;
  totalCount?: number;
  error?: string;
}> {
  try {
    const { loadMarkdownKnowledgeDocs } = await import('./markdown-data-source.js');
    const docs = await loadMarkdownKnowledgeDocs(process.cwd(), config.knowledgeBase.docDirs);

    const docList = docs.map((doc) => ({
      id: doc.id,
      filePath: doc.filePath,
      relativePath: doc.id,
      size: Buffer.byteLength(doc.text, 'utf-8'),
      modifiedAt: new Date(doc.mtimeMs).toISOString(),
    }));

    return {
      success: true,
      docs: docList,
      totalCount: docList.length,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
