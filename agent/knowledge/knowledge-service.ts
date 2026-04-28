/* AI 生成 By Peng.Guo */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../../config/default.js';
import {
  clearKnowledgeIndexStorage,
  forceRebuildKnowledgeIndex,
  incrementalRebuildKnowledgeIndex,
  ingestDocument,
  queryKnowledgeIndex,
  rebuildKnowledgeIndex,
} from './llamaindex-retriever.js';
import { getKnowledgeDocDirs, loadMarkdownKnowledgeDocs } from './markdown-data-source.js';

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

// AI 生成 By Peng.Guo
export type KnowledgeQueryCallbacks = {
  onProgress?: (message: string) => void;
  onAnswerDelta?: (delta: string) => void;
};

export type KnowledgeChatConfig = {
  provider?: 'gemini';
  apiKey?: string;
  baseUrl?: string;
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

async function ensureKnowledgeModelsInstalled(): Promise<Set<string>> {
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
  if (!isModelInstalled(names, config.knowledgeBase.ingestModel)) {
    throw new Error(`知识库预处理模型未安装：${config.knowledgeBase.ingestModel}。请先执行 ollama pull ${config.knowledgeBase.ingestModel}`);
  }
  return names;
}

function isExternalChatModel(model?: string): boolean {
  const normalized = model?.trim().toLowerCase() ?? '';
  return normalized.startsWith('gemini');
}

// AI 生成 By Peng.Guo：重建索引预处理仅允许本地已安装的 Ollama 模型
function resolveInstalledOllamaModel(
  installedNames: Set<string>,
  preferredModel: string | undefined,
  fallbackModel: string
): { model: string; fallbackFrom?: string } {
  const preferred = preferredModel?.trim();
  if (preferred && isModelInstalled(installedNames, preferred)) {
    return { model: preferred };
  }
  if (preferred) {
    return { model: fallbackModel, fallbackFrom: preferred };
  }
  return { model: fallbackModel };
}

// AI 生成 By Peng.Guo：知识库问答支持外部与本地模型；以当前已选模型为准，本地未安装时回退默认
function resolveKnowledgeChatModel(
  installedNames: Set<string>,
  preferredModel: string | undefined
): { model: string; fallbackFrom?: string } {
  const preferred = preferredModel?.trim();
  if (!preferred) return { model: config.knowledgeBase.chatModel };
  if (isExternalChatModel(preferred)) return { model: preferred };
  if (isModelInstalled(installedNames, preferred)) return { model: preferred };
  if (isModelInstalled(installedNames, config.knowledgeBase.chatModel)) {
    return { model: config.knowledgeBase.chatModel, fallbackFrom: preferred };
  }
  throw new Error(
    `知识库问答模型不可用：当前模型 ${preferred} 未安装，且默认模型 ${config.knowledgeBase.chatModel} 也未安装。请先执行 ollama pull ${config.knowledgeBase.chatModel}`
  );
}

export async function queryKnowledgeBase(
  question: string,
  chatModel?: string,
  chatConfig?: KnowledgeChatConfig,
  callbacks?: KnowledgeQueryCallbacks
): Promise<KnowledgeAnswerPayload> {
  try {
    callbacks?.onProgress?.('正在检查知识库依赖模型...');
    const installedNames = await ensureKnowledgeModelsInstalled();
    const resolvedChat = resolveKnowledgeChatModel(installedNames, chatModel);
    if (resolvedChat.fallbackFrom) {
      callbacks?.onProgress?.(`当前模型 ${resolvedChat.fallbackFrom} 未安装，已回退为 ${resolvedChat.model}`);
    }
    const modelToUse = resolvedChat.model;
    callbacks?.onProgress?.('模型检查完成，开始查询知识库...');
    const data = await withTimeout(
      queryKnowledgeIndex(question, modelToUse, {
        provider: chatConfig?.provider,
        apiKey: chatConfig?.apiKey,
        baseUrl: chatConfig?.baseUrl,
        onProgress: callbacks?.onProgress,
        onAnswerDelta: callbacks?.onAnswerDelta,
      }),
      config.knowledgeBase.queryTimeoutMs,
      `知识库查询超时（>${config.knowledgeBase.queryTimeoutMs}ms）。建议：1) 调大 KB_QUERY_TIMEOUT_MS（如 120000）；2) 使用更快的模型（如 qwen2.5:7b）；3) 减少 KB_TOP_K（如 3）`
    );
    return {
      success: true,
      answer: data.answer,
      citations: data.citations,
      docsCount: data.docsCount,
      model: {
        chat: modelToUse,
        embed: config.knowledgeBase.embedModel,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      model: {
        chat: chatModel?.trim() || config.knowledgeBase.chatModel,
        embed: config.knowledgeBase.embedModel,
      },
    };
  }
}

// AI 生成 By Peng.Guo
export type RebuildProgressCallback = (message: string) => void;

export async function rebuildKnowledgeBaseIndex(
  onProgress?: RebuildProgressCallback,
  preferredModel?: string
): Promise<{ success: boolean; docsCount?: number; error?: string }> {
  try {
    onProgress?.('正在扫描知识库文档目录...');
    const installedNames = await ensureKnowledgeModelsInstalled();
    const resolvedIngest = resolveInstalledOllamaModel(installedNames, preferredModel, config.knowledgeBase.ingestModel);
    if (resolvedIngest.fallbackFrom) {
      onProgress?.(`当前模型 ${resolvedIngest.fallbackFrom} 非本地 Ollama 模型，重建已回退为 ${resolvedIngest.model}`);
    }
    const result = await rebuildKnowledgeIndex(onProgress, resolvedIngest.model);
    return { success: true, docsCount: result.docsCount };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// AI 生成 By Peng.Guo
export async function incrementalRebuildKnowledgeBaseIndex(
  onProgress?: RebuildProgressCallback,
  preferredModel?: string
): Promise<{ success: boolean; docsCount?: number; error?: string }> {
  try {
    onProgress?.('开始增量重建知识库索引（变更文档预处理增量，无变更时复用已有向量索引）...');
    const installedNames = await ensureKnowledgeModelsInstalled();
    const resolvedIngest = resolveInstalledOllamaModel(installedNames, preferredModel, config.knowledgeBase.ingestModel);
    if (resolvedIngest.fallbackFrom) {
      onProgress?.(`当前模型 ${resolvedIngest.fallbackFrom} 非本地 Ollama 模型，增量重建已回退为 ${resolvedIngest.model}`);
    }
    const result = await incrementalRebuildKnowledgeIndex(onProgress, resolvedIngest.model);
    return { success: true, docsCount: result.docsCount };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// AI 生成 By Peng.Guo
export async function forceRebuildKnowledgeBaseIndex(
  onProgress?: RebuildProgressCallback,
  preferredModel?: string
): Promise<{ success: boolean; docsCount?: number; error?: string }> {
  try {
    onProgress?.('正在强制清理并重建知识库索引...');
    const installedNames = await ensureKnowledgeModelsInstalled();
    const resolvedIngest = resolveInstalledOllamaModel(installedNames, preferredModel, config.knowledgeBase.ingestModel);
    if (resolvedIngest.fallbackFrom) {
      onProgress?.(`当前模型 ${resolvedIngest.fallbackFrom} 非本地 Ollama 模型，强制重建已回退为 ${resolvedIngest.model}`);
    }
    const result = await forceRebuildKnowledgeIndex(onProgress, resolvedIngest.model);
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
    const docs = await loadMarkdownKnowledgeDocs(process.cwd(), getKnowledgeDocDirs());

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

// AI 生成 By Peng.Guo
export async function ingestKnowledgeDocument(
  relativePath: string,
  onProgress?: (message: string) => void
): Promise<{ success: boolean; changed?: boolean; parentCount?: number; childCount?: number; md5?: string; error?: string }> {
  try {
    const target = relativePath.trim();
    if (!target) throw new Error('ingestKnowledgeDocument 缺少 relativePath');
    const docs = await loadMarkdownKnowledgeDocs(process.cwd(), getKnowledgeDocDirs());
    const doc = docs.find((item) => item.id === target || item.filePath.endsWith(target));
    if (!doc) throw new Error(`未找到文档：${target}`);
    onProgress?.(`开始增量摄取：${doc.id}`);
    const result = await ingestDocument(doc, onProgress);
    onProgress?.(`摄取完成：changed=${String(result.changed)} child=${result.childCount}`);
    return {
      success: true,
      changed: result.changed,
      parentCount: result.parentCount,
      childCount: result.childCount,
      md5: result.md5,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// AI 生成 By Peng.Guo
export async function clearPrivateKnowledgeBase(
  onProgress?: RebuildProgressCallback
): Promise<{ success: boolean; removedDocsDir?: string; removedIndexDir?: string; error?: string }> {
  try {
    const privateKbDir = path.resolve(process.cwd(), 'runtime', 'private-kb');
    onProgress?.(`正在清理私人知识库文档目录: ${privateKbDir}`);
    await fs.rm(privateKbDir, { recursive: true, force: true });
    await clearKnowledgeIndexStorage(onProgress);
    return {
      success: true,
      removedDocsDir: privateKbDir,
      removedIndexDir: path.resolve(process.cwd(), config.knowledgeBase.persistDir),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
