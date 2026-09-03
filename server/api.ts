/* AI 生成 By Peng.Guo */
import 'dotenv/config';
import dns from 'node:dns';
import type { Server } from 'node:http';
import express from 'express';
import cors from 'cors';
import { runAgent, type AgentLlmOptions } from '../agent/agent.js';
import { testGeminiConnection } from '../agent/gemini-client.js';
import { getGeminiEnvSettingsSnapshot, saveGeminiEnvSettings } from './gemini-env-settings.js';
import { config } from '../config/default.js';
import { healthCheck } from '../agent/ollama-client.js';
import {
  fetchOllamaInstalledModelNames,
  getOllamaActiveModel,
  setOllamaActiveModel,
  syncActiveModelFromOllamaPs,
  unloadOllamaModel,
} from '../agent/ollama-runtime.js';
import { getJenkinsPreset } from '../config/jenkins-presets.js';
import { deploy as jenkinsDeploy, getDeployStatus, getDeployStatusByBuildHistory } from '../tools/jenkins-tool.js';
import { open as openBrowser } from '../tools/browser-tool.js';
import { getAllProjects, getProjectByCode } from '../config/projects.js';
import { searchTodoBugs, searchInProgressBugs, searchAssigneeTasks } from '../tools/jira-tool.js';
import { submitIssueForTest } from '../tools/jira-submit-for-test.js';
import { closeIssue } from '../tools/jira-close-issue.js';
import { deployNovaPretest, deployByJobKey } from '../tools/deploy-jenkins-helper.js';
import {
  mergeByCode,
  mergeNova,
  mergeNovaPretest,
  mergeBizSolution,
  mergeBizSolutionPretest,
  mergeScm,
} from '../tools/merge-tool.js';
import { buildCommandCapabilityDetail } from '../config/command-capability-catalog.js';
import { listSupportedWorkflows, runWorkflowStep } from '../tools/workflow-tool.js';
import { addManualTerminalToSession, closeEmbeddedWorkflowSession, getEmbeddedWorkflowSession, removeTerminalFromSession, startEmbeddedWorkflow } from '../tools/workflow-embedded-service.js';
import {
  closeTerminalSession,
  getTerminalSessionOutput,
  resizeTerminalSession,
  writeTerminalSessionInput,
} from '../tools/terminal-proxy.js';
import { promises as fs } from 'fs';
import path from 'path';
import type { CommandStatSource } from './stats/command-stat-labels.js';
import {
  formatRangeForResponse,
  parseStatsRangeQuery,
  queryAggregated,
  queryBySource,
  queryTimeline,
} from './stats/command-stats-repository.js';
import { getApiBootId, rotateApiBootId } from './api-boot.js';
import { enqueueRemoteCommand, subscribeRemoteCommands } from './remote-command-hub.js';
import {
  recordChatCommand,
  recordDeploy,
  recordDeployNovaPretest,
  recordKnowledgeImport,
  recordMerge,
  recordOpenUrl,
  recordWorkflowEmbedded,
  recordWorkflowStep,
} from './stats/command-stats-record.js';
import { loadAllDigests, loadDigest } from './trends/trends-repository.js';
import { runTechDigestRefreshForPeriod } from './trends/trends-service.js';
import type { TechDigestScope } from './trends/trends-types.js';
/** 出站 DNS 优先 IPv4，避免部分网络 IPv6 不通导致 Google 等连接在 IPv6 上卡死至超时 */
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));

/** 进行中的 /agent/chat 可中止：切换模型或新请求时取消与 Ollama 的连接 */
let agentChatAbort: AbortController | null = null;

/** 进行中的技术趋势刷新可中止（按 scope 独立） */
const techDigestAbortByScope: Partial<Record<TechDigestScope, AbortController>> = {};

function parseTechDigestScope(raw: unknown): TechDigestScope | null {
  const s = String(raw ?? '').trim();
  if (s === 'daily' || s === 'monthly' || s === 'halfYear') return s;
  return null;
}

function abortTechDigestRefresh(scope: TechDigestScope): void {
  techDigestAbortByScope[scope]?.abort();
  delete techDigestAbortByScope[scope];
}


function abortAgentChat(): void {
  agentChatAbort?.abort();
  agentChatAbort = null;
}

const COMMAND_HISTORY_MAX = 30;
const COMMAND_HISTORY_FILE = path.resolve(process.cwd(), 'runtime', 'command-history.json');
const PRIVATE_KB_BASE_DIR = path.resolve(process.cwd(), 'runtime', 'private-kb');

type CommandHistoryStore = { items: string[] };

async function readCommandHistory(): Promise<string[]> {
  try {
    const raw = await fs.readFile(COMMAND_HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as CommandHistoryStore;
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(-COMMAND_HISTORY_MAX);
  } catch {
    return [];
  }
}

async function writeCommandHistory(items: string[]): Promise<void> {
  const normalized = items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(-COMMAND_HISTORY_MAX);
  await fs.mkdir(path.dirname(COMMAND_HISTORY_FILE), { recursive: true });
  await fs.writeFile(
    COMMAND_HISTORY_FILE,
    JSON.stringify({ items: normalized }, null, 2),
    'utf-8'
  );
}

type KnowledgeImportFile = { path?: string; content?: string };

function sanitizeRelativePath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  const parts = normalized
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== '.' && part !== '..')
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_'));
  return parts.join('/');
}

function resolveWorkspaceFilePath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, '/').trim();
  if (!normalized) throw new Error('缺少 path');
  if (path.isAbsolute(normalized)) throw new Error('不支持绝对路径');
  if (normalized.includes('..')) throw new Error('路径不合法');
  const abs = path.resolve(process.cwd(), normalized);
  const cwd = process.cwd();
  if (!abs.startsWith(cwd)) throw new Error('越界路径');
  return abs;
}

function buildKnowledgeDocPathCandidates(inputPath: string): string[] {
  const normalized = inputPath.replace(/\\/g, '/').trim().replace(/^\/+/, '');
  const candidates = new Set<string>([normalized]);
  const stripDocsPrefix = (p: string): string | null => {
    if (p.startsWith('docs/')) return p.slice('docs/'.length);
    if (p.startsWith('doc/')) return p.slice('doc/'.length);
    return null;
  };
  const directStripped = stripDocsPrefix(normalized);
  if (directStripped) candidates.add(directStripped);
  const importMarker = '/import-';
  const markerIdx = normalized.indexOf(importMarker);
  if (markerIdx >= 0) {
    const slashAfterImport = normalized.indexOf('/', markerIdx + importMarker.length);
    if (slashAfterImport > 0) {
      const prefix = normalized.slice(0, slashAfterImport + 1);
      const rest = normalized.slice(slashAfterImport + 1);
      const restStripped = stripDocsPrefix(rest);
      if (restStripped) candidates.add(prefix + restStripped);
    }
  }
  // AI 生成 By Peng.Guo：目录链接兜底，自动尝试常见文档入口文件
  const snapshot = Array.from(candidates);
  const indexNames = ['README.md', 'QUICK_START.md', 'USAGE.md', 'SUMMARY.md', 'index.md'];
  for (const item of snapshot) {
    const clean = item.replace(/\/+$/, '');
    const hasExt = /\.[a-zA-Z0-9]+$/.test(clean);
    if (!clean || hasExt) continue;
    for (const indexName of indexNames) {
      candidates.add(`${clean}/${indexName}`);
    }
  }
  return Array.from(candidates);
}

app.get('/', (_req, res) => res.status(200).json({ ok: true, service: 'ai-dev-control-center' }));

// AI 生成 By Peng.Guo：读取知识库引用来源文档全文，供 UI 新页签查看
app.get('/knowledge-base/document', async (req, res) => {
  try {
    const relPath = String(req.query?.path ?? '').trim();
    const pathCandidates = buildKnowledgeDocPathCandidates(relPath).map((item) => ({
      rel: item,
      abs: resolveWorkspaceFilePath(item),
    }));
    let resolved: { rel: string; abs: string } | null = null;
    let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    for (const candidate of pathCandidates) {
      try {
        const nextStat = await fs.stat(candidate.abs);
        if (!nextStat.isFile()) continue;
        resolved = candidate;
        stat = nextStat;
        break;
      } catch {
        // try next candidate
      }
    }
    if (!resolved || !stat) {
      res.status(404).json({ success: false, error: `未找到文档：${relPath}` });
      return;
    }
    const content = await fs.readFile(resolved.abs, 'utf8');
    res.json({
      success: true,
      path: resolved.rel,
      size: stat.size,
      modifiedAt: new Date(stat.mtimeMs).toISOString(),
      content,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg });
  }
});

function parseAgentLlmFromBody(body: unknown): AgentLlmOptions | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as Record<string, unknown>).llm;
  if (raw == null || typeof raw !== 'object') return undefined;
  const l = raw as Record<string, unknown>;
  const mode = String(l.mode ?? 'local').toLowerCase();
  if (mode !== 'external') return { mode: 'local' };
  const provider = String(l.provider ?? '').toLowerCase();
  if (provider !== 'gemini') {
    throw new Error(`不支持的 provider: ${provider}（当前仅支持 gemini）`);
  }
  const apiKeyFromBody = String(l.apiKey ?? '').trim();
  const apiKeyFromEnv = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
  if (!apiKeyFromBody && !apiKeyFromEnv) {
    throw new Error('外部模型需要提供 API Key：在请求 body.llm.apiKey 中传入，或在启动 API 的进程中设置 GEMINI_API_KEY / GOOGLE_API_KEY（与 A2UI 一致）');
  }
  const model = String(l.model ?? '').trim() || config.gemini.defaultModel;
  const baseUrlRaw = String(l.baseUrl ?? '').trim();
  return {
    mode: 'external',
    provider: 'gemini',
    ...(apiKeyFromBody ? { apiKey: apiKeyFromBody } : {}),
    model,
    baseUrl: baseUrlRaw || undefined,
  };
}

/** 设置页：读取 .env 中已保存的 Gemini 配置（不回传完整 Key） */
app.get('/agent/gemini/settings', (_req, res) => {
  res.json(getGeminiEnvSettingsSnapshot());
});

/** 设置页：保存 Gemini API Key / 默认模型到 .env，并立即写入当前 API 进程环境 */
app.post('/agent/gemini/settings', (req, res) => {
  try {
    const apiKey = String(req.body?.apiKey ?? '').trim();
    const model = String(req.body?.model ?? '').trim();
    const snapshot = saveGeminiEnvSettings({
      ...(apiKey ? { apiKey } : {}),
      ...(model ? { model } : {}),
    });
    res.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

/** 设置页：测试当前表单或环境变量中的 Gemini 是否可达（不落盘） */
app.post('/agent/gemini/test', async (req, res) => {
  const apiKeyFromBody = String(req.body?.apiKey ?? '').trim();
  const apiKeyFromEnv = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
  const apiKey = apiKeyFromBody || apiKeyFromEnv;
  if (!apiKey) {
    res.status(400).json({ ok: false, error: '缺少 API Key：在请求体中传入 apiKey，或配置 GEMINI_API_KEY / GOOGLE_API_KEY' });
    return;
  }
  const model = String(req.body?.model ?? '').trim() || config.gemini.defaultModel;
  const baseUrlRaw = String(req.body?.baseUrl ?? '').trim();
  try {
    const result = await testGeminiConnection({ apiKey, model, baseUrl: baseUrlRaw || undefined });
    if (result.ok) {
      res.json({ ok: true, message: result.message });
    } else {
      res.status(502).json({ ok: false, error: result.error });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

/** 轻量探活：仅表示本 Express 子进程存活，不访问 Ollama（避免高频 health 拖慢或误判） */
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    bootId: getApiBootId(),
    service: 'ai-dev-control-center',
    port: config.server.port,
  });
});

/** Cursor CLI 投递口令：有中控窗口则立即广播，否则排队等 SSE 连接 */
app.post('/agent/remote-command', (req, res) => {
  const message = String(req.body?.message ?? '').trim();
  if (!message) {
    res.status(400).json({ ok: false, error: '缺少 message' });
    return;
  }
  const { payload, subscriberCount, queued } = enqueueRemoteCommand(message);
  res.json({
    ok: true,
    id: payload.id,
    subscriberCount,
    queued,
  });
});

app.get('/agent/remote-command/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(': connected\n\n');
  const unsubscribe = subscribeRemoteCommands((payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
  req.on('close', () => {
    unsubscribe();
  });
});

app.get('/health/ollama', async (_req, res) => {
  const ollamaReachable = await healthCheck();
  res.status(200).json({ ok: true, ollamaReachable });
});

/** 返回当前使用的本地模型名（可运行时切换），供前端展示 */
app.get('/agent/model', (_req, res) => {
  res.json({ model: getOllamaActiveModel() });
});

/** Ollama 已安装模型列表（/api/tags），供下拉切换 */
app.get('/agent/ollama/models', async (_req, res) => {
  try {
    const models = await fetchOllamaInstalledModelNames();
    res.json({ models });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ models: [] as string[], error: msg });
  }
});

/**
 * 切换 Agent 使用的 Ollama 模型：中止当前推理、卸载旧模型、启用新模型（下次 chat 加载）。
 */
app.post('/agent/model', async (req, res) => {
  const next = (req.body?.model ?? '').toString().trim();
  if (!next) {
    res.status(400).json({ success: false, error: '缺少 model' });
    return;
  }
  let installed: string[];
  try {
    installed = await fetchOllamaInstalledModelNames();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ success: false, error: `无法连接 Ollama: ${msg}` });
    return;
  }
  if (!installed.includes(next)) {
    res.status(400).json({ success: false, error: `模型未安装或名称不匹配: ${next}` });
    return;
  }
  const prev = getOllamaActiveModel();
  if (prev !== next) {
    abortAgentChat();
    await unloadOllamaModel(prev);
    setOllamaActiveModel(next);
  }
  res.json({ success: true, model: getOllamaActiveModel() });
});

/** 最近指令历史：从本地文件读取，避免重启丢失 */
app.get('/agent/history', async (_req, res) => {
  const items = await readCommandHistory();
  res.json({ items });
});

/** 最近指令历史：写入本地文件，供下次启动恢复 */
app.post('/agent/history', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) {
    res.status(400).json({ success: false, error: '缺少 items' });
    return;
  }
  const normalized = items
    .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(-COMMAND_HISTORY_MAX);
  try {
    await writeCommandHistory(normalized);
    res.json({ success: true, items: normalized });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 私人知识库：导入目录中的 Markdown 文档（前端选择目录后传文件列表） */
app.post('/knowledge-base/import', async (req, res) => {
  const sourceNameRaw = String(req.body?.sourceName ?? '').trim() || 'import-latest';
  const files = Array.isArray(req.body?.files) ? (req.body.files as KnowledgeImportFile[]) : [];
  if (!files.length) {
    res.status(400).json({ success: false, error: '缺少 files' });
    return;
  }
  recordKnowledgeImport('POST /knowledge-base/import');
  const sourceName = sourceNameRaw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'import-latest';
  const targetRoot = path.join(PRIVATE_KB_BASE_DIR, sourceName);
  let imported = 0;
  try {
    // AI 生成 By Peng.Guo：默认导入目录复用时先清理，避免旧文件残留影响增量判断
    await fs.rm(targetRoot, { recursive: true, force: true });
    await fs.mkdir(targetRoot, { recursive: true });
    for (const file of files) {
      const rawPath = String(file.path ?? '').trim();
      const content = String(file.content ?? '');
      if (!rawPath || !rawPath.toLowerCase().endsWith('.md')) continue;
      const rel = sanitizeRelativePath(rawPath);
      if (!rel || !rel.toLowerCase().endsWith('.md')) continue;
      const abs = path.join(targetRoot, rel);
      if (!abs.startsWith(targetRoot)) continue;
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf-8');
      imported += 1;
    }
    res.json({
      success: true,
      imported,
      sourceName,
      targetDir: path.relative(process.cwd(), targetRoot).split(path.sep).join('/'),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg, imported });
  }
});

app.post('/agent/chat', async (req, res) => {
  const message = (req.body?.message ?? '').trim();
  if (!message) {
    res.status(400).json({ success: false, error: '缺少 message' });
    return;
  }
  recordChatCommand(message, 'POST /agent/chat');
  let llm: AgentLlmOptions | undefined;
  try {
    llm = parseAgentLlmFromBody(req.body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ success: false, error: msg });
    return;
  }
  abortAgentChat();
  agentChatAbort = new AbortController();
  const { signal } = agentChatAbort;
  try {
    const result = await runAgent(message, { signal, llm });
    res.json(result);
  } catch (err) {
    const aborted = signal.aborted || (err instanceof Error && err.name === 'AbortError');
    if (aborted) {
      res.json({ success: false, error: '请求已取消（模型切换或新请求已打断当前推理）', aborted: true });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  } finally {
    if (agentChatAbort?.signal === signal) agentChatAbort = null;
  }
});

/**
 * Agent 对话（SSE）：首轮模型思考/输出以 `llm_delta` 事件实时推送，结束时 `result` 与 POST /agent/chat 一致。
 */
app.post('/agent/chat/stream', async (req, res) => {
  const message = (req.body?.message ?? '').toString().trim();
  if (!message) {
    res.status(400).json({ success: false, error: '缺少 message' });
    return;
  }
  recordChatCommand(message, 'POST /agent/chat/stream');
  let llm: AgentLlmOptions | undefined;
  try {
    llm = parseAgentLlmFromBody(req.body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ success: false, error: msg });
    return;
  }
  abortAgentChat();
  agentChatAbort = new AbortController();
  const { signal } = agentChatAbort;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const socket = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
  if (socket?.setNoDelay) socket.setNoDelay(true);
  res.flushHeaders?.();

  const send = (obj: unknown) => {
    const payload = `data: ${JSON.stringify(obj)}\n\n`;
    res.write(payload, 'utf8', () => {
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    });
  };

  try {
    const result = await runAgent(message, {
      signal,
      llm,
      onFirstLLMStream: (chunk) =>
        send({
          type: 'llm_delta',
          thinkingDelta: chunk.thinkingDelta,
          contentDelta: chunk.contentDelta,
        }),
      onTokenUsage: (usage) =>
        send({
          type: 'token_usage',
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        }),
      onToolProgress: (e) => {
        if (e.phase === 'start') send({ type: 'tool_progress', phase: 'start', tool: e.tool });
        else if (e.phase === 'progress') send({ type: 'tool_progress', phase: 'progress', tool: e.tool, message: e.message });
        else if (e.phase === 'stream_delta') {
          send({
            type: 'tool_progress',
            phase: 'stream_delta',
            tool: e.tool,
            thinkingDelta: e.thinkingDelta,
            contentDelta: e.contentDelta,
          });
        } else send({ type: 'tool_progress', phase: 'done', tool: e.tool, ok: e.ok, message: e.message });
      },
    });
    send({ type: 'result', result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      send({ type: 'error', error: msg });
    } catch {
      /* 客户端已断开 */
    }
  } finally {
    if (agentChatAbort?.signal === signal) agentChatAbort = null;
    res.end();
  }
});

/** 在系统默认浏览器中打开 URL */
app.post('/open-url', async (req, res) => {
  const url = (req.body?.url ?? '').toString().trim();
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    res.status(400).json({ success: false, error: '缺少或无效的 url（需 http/https）' });
    return;
  }
  recordOpenUrl('POST /open-url');
  try {
    await openBrowser(url);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 技术趋势：读取缓存报告（可选 scope） */
app.get('/tech-digest/latest', (req, res) => {
  try {
    const scope = parseTechDigestScope(req.query?.scope);
    if (scope) {
      const report = loadDigest(scope);
      res.json({ success: true, report });
      return;
    }
    const all = loadAllDigests();
    res.json({
      success: true,
      daily: all.daily ?? null,
      monthly: all.monthly ?? null,
      halfYear: all.halfYear ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 技术趋势：按 scope 手动刷新（SSE 进度） */
app.post('/tech-digest/refresh/stream', async (req, res) => {
  const scope = parseTechDigestScope(req.body?.scope);
  if (!scope) {
    res.status(400).json({ success: false, error: '缺少或无效的 scope（daily | monthly | halfYear）' });
    return;
  }

  let llm: AgentLlmOptions | undefined;
  try {
    llm = parseAgentLlmFromBody(req.body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ success: false, error: msg });
    return;
  }

  abortTechDigestRefresh(scope);
  const controller = new AbortController();
  techDigestAbortByScope[scope] = controller;
  const { signal } = controller;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const socket = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
  if (socket?.setNoDelay) socket.setNoDelay(true);
  res.flushHeaders?.();

  const send = (obj: unknown) => {
    const payload = `data: ${JSON.stringify(obj)}\n\n`;
    res.write(payload, 'utf8', () => {
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    });
  };

  try {
    const report = await runTechDigestRefreshForPeriod(scope, llm, {
      signal,
      onProgress: (message) => send({ type: 'progress', message }),
      onLlmDelta: (delta) =>
        send({
          type: 'llm_delta',
          thinkingDelta: delta.thinkingDelta,
          contentDelta: delta.contentDelta,
        }),
    });
    send({ type: 'result', report });
  } catch (err) {
    const aborted = signal.aborted || (err instanceof Error && err.name === 'AbortError');
    const msg = aborted ? '刷新已取消' : err instanceof Error ? err.message : String(err);
    try {
      send({ type: 'error', error: msg });
    } catch {
      /* 客户端已断开 */
    }
  } finally {
    if (techDigestAbortByScope[scope]?.signal === signal) {
      delete techDigestAbortByScope[scope];
    }
    res.end();
  }
});

function parseStatsSourceParam(raw: string): CommandStatSource | undefined {
  const s = raw.trim() as CommandStatSource;
  if (['chat', 'workflow', 'deploy', 'merge', 'browser', 'knowledge'].includes(s)) return s;
  return undefined;
}

/** 待办 bug 列表（按日期落入的修复版本迭代、打开状态），供聊天区表格刷新；可选 fixVersion 切换前一/当前/下一档 */
app.get('/jira/todo-bugs', async (req, res) => {
  try {
    const maxResults = Number(req.query.maxResults ?? 100);
    const fixVersion = String(req.query.fixVersion ?? '').trim() || undefined;
    const result = await searchTodoBugs(maxResults, fixVersion);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 处理中 bug 列表（按日期落入的修复版本迭代、In Progress），供聊天区表格刷新；可选 fixVersion 切换前一/当前/下一档 */
app.get('/jira/in-progress-bugs', async (req, res) => {
  try {
    const maxResults = Number(req.query.maxResults ?? 100);
    const fixVersion = String(req.query.fixVersion ?? '').trim() || undefined;
    const result = await searchInProgressBugs(maxResults, fixVersion);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 一键提测：执行 Jira「提测」工作流转场并按默认策略填屏字段 */
app.post('/jira/issues/:key/submit-for-test', async (req, res) => {
  try {
    const key = String(req.params.key ?? '').trim();
    const result = await submitIssueForTest(key);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 经办人任务列表（供聊天区表格刷新） */
app.get('/jira/assignee-tasks', async (req, res) => {
  try {
    const maxResults = Number(req.query.maxResults ?? 100);
    const result = await searchAssigneeTasks(maxResults);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 一键关闭：执行 Jira「关闭问题」工作流转场并按默认策略填屏字段 */
app.post('/jira/issues/:key/close', async (req, res) => {
  try {
    const key = String(req.params.key ?? '').trim();
    const result = await closeIssue(key);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 指令统计：按 canonical_key 聚合（柱状图/饼图） */
app.get('/stats/commands', (req, res) => {
  try {
    const range = parseStatsRangeQuery({
      days: String(req.query?.days ?? ''),
      from: String(req.query?.from ?? ''),
      to: String(req.query?.to ?? ''),
    });
    const source = parseStatsSourceParam(String(req.query?.source ?? ''));
    const limit = parseInt(String(req.query?.limit ?? '15'), 10);
    const { items, total } = queryAggregated({ range, source, limit });
    res.json({ items, total, range: formatRangeForResponse(range) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 指令统计：按日时间序列（折线图） */
app.get('/stats/commands/timeline', (req, res) => {
  try {
    const range = parseStatsRangeQuery({
      days: String(req.query?.days ?? ''),
      from: String(req.query?.from ?? ''),
      to: String(req.query?.to ?? ''),
    });
    const source = parseStatsSourceParam(String(req.query?.source ?? ''));
    const { buckets, total } = queryTimeline({ range, source });
    res.json({
      buckets,
      granularity: 'day',
      total,
      range: formatRangeForResponse(range),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 指令统计：按来源分组（饼图「按来源」模式） */
app.get('/stats/commands/by-source', (req, res) => {
  try {
    const range = parseStatsRangeQuery({
      days: String(req.query?.days ?? ''),
      from: String(req.query?.from ?? ''),
      to: String(req.query?.to ?? ''),
    });
    const { items, total } = queryBySource({ range });
    res.json({ items, total, range: formatRangeForResponse(range) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 获取 workflows/*.json 预设工作流目录 */
app.get('/workflows', async (_req, res) => {
  try {
    const workflows = await listSupportedWorkflows();
    const panelWorkflows = workflows.filter((w) => w.showInPanel !== false);
    const projectSnapshot = getAllProjects().map((p) => ({
      codes: p.codes,
      jenkins: p.jenkins,
      merge: p.merge,
    }));
    const capabilities = buildCommandCapabilityDetail(projectSnapshot);
    res.json({
      total: workflows.length,
      panelTotal: panelWorkflows.length,
      commandCapabilityTotal: capabilities.total,
      commandBreakdown: capabilities.breakdown,
      commandCapabilitySections: capabilities.sections,
      workflows,
      panelWorkflows,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 当前支持的全部可执行指令统计（与聊天输入提示口径一致） */
app.get('/commands/capabilities', (_req, res) => {
  const projectSnapshot = getAllProjects().map((p) => ({
    codes: p.codes,
    jenkins: p.jenkins,
    merge: p.merge,
  }));
  res.json(buildCommandCapabilityDetail(projectSnapshot));
});

/** 获取统一项目列表（代号、路径、Jenkins、merge），便于前端展示与扩展 */
app.get('/projects', (_req, res) => {
  const list = getAllProjects().map((p) => ({
    codes: p.codes,
    path: p.path,
    jenkins: p.jenkins
      ? { jobName: p.jenkins.jobName, defaultBranch: p.jenkins.defaultBranch }
      : undefined,
    merge: p.merge
      ? { targetBranch: p.merge.targetBranch, runRelease: p.merge.runRelease }
      : undefined,
  }));
  res.json(list);
});

/** 快捷触发 Jenkins 部署：body.job 为预定义 key（如 nova、base）或完整 job 名称；body.branch 可选，指定则覆盖项目配置的分支参数（如 BRANCH_NAME/BRANCH） */
app.post('/jenkins/deploy', async (req, res) => {
  const jobKey = (req.body?.job ?? '').trim();
  const branch = (req.body?.branch ?? '').trim();
  if (!jobKey) {
    res.status(400).json({ success: false, error: '缺少 job' });
    return;
  }
  recordDeploy(jobKey, branch || undefined, 'POST /jenkins/deploy');
  const keyLower = jobKey.toLowerCase();
  if (keyLower === 'nova-pretest' || keyLower === 'nova集测') {
    try {
      const result = await deployNovaPretest();
      res.json({ ...result, jobName: result.jobName });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, message: msg });
      return;
    }
  }
  try {
    const result = await deployByJobKey(jobKey, branch || undefined);
    res.json({ ...result, jobName: result.jobName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

/** 部署 nova 集测：Jenkins 任务同 nova，分支为 react18 最大 sprint */
app.post('/jenkins/deploy/nova-pretest', async (_req, res) => {
  recordDeployNovaPretest('POST /jenkins/deploy/nova-pretest');
  try {
    const result = await deployNovaPretest();
    res.json({ ...result, jobName: result.jobName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

/** 从 URL 中判断是否为 job 页地址（非队列项），并提取 job 名。队列项格式为 .../queue/item/123/ */
function parseJobNameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    if (path.includes('/queue/item/')) return null;
    const m = path.match(/\/job\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** 查询一次部署状态（不阻塞），由前端轮询。支持 queueUrl（队列 API）或 jobName（buildHistory/ajax）。若 queueUrl 实为 job 页地址则按 jobName 用 buildHistory 查 */
app.get('/jenkins/deploy/status', async (req, res) => {
  const queueUrlRaw = (req.query?.queueUrl ?? '').toString().trim();
  const jobNameParam = (req.query?.jobName ?? '').toString().trim();
  const queueUrl = queueUrlRaw ? decodeURIComponent(queueUrlRaw) : '';
  const jobNameFromUrl = queueUrl ? parseJobNameFromUrl(queueUrl) : null;
  const jobName = jobNameParam ? decodeURIComponent(jobNameParam) : jobNameFromUrl;
  if (jobName) {
    try {
      const result = await getDeployStatusByBuildHistory(jobName);
      return res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ status: 'unknown', message: msg });
    }
  }
  if (queueUrl) {
    try {
      const result = await getDeployStatus(queueUrl);
      return res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ status: 'unknown', message: msg });
    }
  }
  res.status(400).json({ status: 'unknown', message: '缺少 queueUrl 或 jobName' });
});

/** 执行指定工作流中的单步，path: /workflow/:workflowName/step，body: { taskKey?: string; stepIndex?: number } */
app.post('/workflow/:workflowName/step', async (req, res) => {
  const workflowName = (req.params?.workflowName ?? '').trim() || 'start-work';
  const taskKey = (req.body?.taskKey ?? '').toString().trim();
  const stepIndex = req.body?.stepIndex;
  if (!taskKey && typeof stepIndex !== 'number') {
    res.status(400).json({ success: false, error: '缺少 taskKey 或 stepIndex' });
    return;
  }
  recordWorkflowStep(workflowName, taskKey || undefined, typeof stepIndex === 'number' ? stepIndex : undefined, 'POST /workflow/:workflowName/step');
  try {
    const result = await runWorkflowStep(workflowName, {
      ...(taskKey ? { taskKey } : {}),
      ...(typeof stepIndex === 'number' ? { stepIndex } : {}),
    });
    if (result.success) {
      res.json({ success: true, results: result.results });
    } else {
      res.status(400).json({ success: false, error: result.error, results: result.results });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 启动内嵌工作流终端：用于 UI 子页签展示，不再依赖外部终端 */
app.post('/workflow/:workflowName/embedded', async (req, res) => {
  const workflowName = (req.params?.workflowName ?? '').trim() || 'start-work';
  recordWorkflowEmbedded(workflowName, 'POST /workflow/:workflowName/embedded');
  try {
    const result = await startEmbeddedWorkflow(workflowName);
    res.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/** 查询内嵌工作流会话快照：前端轮询获取各终端输出 */
app.get('/workflow/sessions/:sessionId', (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const session = getEmbeddedWorkflowSession(sessionId);
  if (!session) {
    res.status(404).json({ success: false, error: `会话不存在: ${sessionId}` });
    return;
  }
  res.json({
    success: true,
    sessionId: session.id,
    workflowName: session.workflowName,
    createdAt: session.createdAt,
    terminals: session.terminals,
  });
});

/** 关闭整个内嵌工作会话（会优雅关闭会话下所有终端） */
app.delete('/workflow/sessions/:sessionId', (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const ok = closeEmbeddedWorkflowSession(sessionId);
  if (!ok) {
    res.status(404).json({ success: false, error: `会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true });
});

/** 在已有工作会话中新增手动终端；可选 body.cwdAbs 为初始工作目录（通常继承当前页签） */
app.post('/workflow/sessions/:sessionId/terminals', async (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const cwdFromBody = (req.body?.cwdAbs ?? req.body?.cwd ?? '').toString().trim();
  const terminal = await addManualTerminalToSession(sessionId, cwdFromBody ? { cwd: cwdFromBody } : undefined);
  if (!terminal) {
    res.status(404).json({ success: false, error: `会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true, terminal });
});

/** 关闭并移除会话中的某个终端页签 */
app.delete('/workflow/sessions/:sessionId/terminals/:terminalId', (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  const terminalId = (req.params?.terminalId ?? '').trim();
  if (!sessionId || !terminalId) {
    res.status(400).json({ success: false, error: '缺少 sessionId 或 terminalId' });
    return;
  }
  const ok = removeTerminalFromSession(sessionId, terminalId);
  if (!ok) {
    res.status(404).json({ success: false, error: '终端不存在或会话不存在' });
    return;
  }
  res.json({ success: true });
});

/** 获取终端增量输出（from=上次 seq），用于 xterm 渲染 */
app.get('/terminal/sessions/:sessionId/output', async (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  const from = Number((req.query?.from ?? 0).toString());
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const data = await getTerminalSessionOutput(sessionId, Number.isFinite(from) ? from : 0);
  if (!data) {
    res.status(404).json({ success: false, error: `终端会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true, ...data });
});

/** 写入终端输入，支持回车/编辑/快捷键 */
app.post('/terminal/sessions/:sessionId/input', async (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  const data = (req.body?.data ?? '').toString();
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  if (!data) {
    res.status(400).json({ success: false, error: '缺少 data' });
    return;
  }
  const ok = await writeTerminalSessionInput(sessionId, data);
  if (!ok) {
    res.status(404).json({ success: false, error: `终端会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true });
});

/** 通知后端终端尺寸变化，保证 curses 类程序正常显示 */
app.post('/terminal/sessions/:sessionId/resize', async (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  const cols = Number(req.body?.cols ?? 80);
  const rows = Number(req.body?.rows ?? 24);
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const ok = await resizeTerminalSession(sessionId, cols, rows);
  if (!ok) {
    res.status(404).json({ success: false, error: `终端会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true });
});

/** 直接关闭终端会话（保留接口，便于未来非 workflow 终端管理） */
app.delete('/terminal/sessions/:sessionId', async (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const ok = await closeTerminalSession(sessionId);
  if (!ok) {
    res.status(404).json({ success: false, error: `终端会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true });
});

/** 合并 nova：SSE 流式输出每步，前端可实时展示 */
app.post('/merge/nova', async (_req, res) => {
  recordMerge('nova', 'POST /merge/nova');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const socket = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
  if (socket?.setNoDelay) socket.setNoDelay(true);
  res.flushHeaders?.();
  const send = (msg: string) => {
    const payload = `data: ${JSON.stringify({ step: msg })}\n\n`;
    res.write(payload, 'utf8', () => {
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    });
  };
  try {
    const result = await mergeNova({ onStep: send });
    res.write(`data: ${JSON.stringify({ done: true, success: result.success, error: result.error })}\n\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ done: true, success: false, error: msg })}\n\n`);
  }
  res.end();
});

/** 合并 nova 集测：目标分支为 react18 远程最大 sprint-N，流程同 merge nova（含 release） */
app.post('/merge/nova-pretest', async (_req, res) => {
  recordMerge('nova-pretest', 'POST /merge/nova-pretest');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const socket = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
  if (socket?.setNoDelay) socket.setNoDelay(true);
  res.flushHeaders?.();
  const send = (msg: string) => {
    const payload = `data: ${JSON.stringify({ step: msg })}\n\n`;
    res.write(payload, 'utf8', () => {
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    });
  };
  try {
    const result = await mergeNovaPretest({ onStep: send });
    res.write(`data: ${JSON.stringify({ done: true, success: result.success, error: result.error })}\n\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ done: true, success: false, error: msg })}\n\n`);
  }
  res.end();
});

/** 合并 biz-solution 集测：目标分支为 react18 远程最大 sprint-N，无 release，SSE 流式输出 */
app.post('/merge/biz-solution-pretest', async (_req, res) => {
  recordMerge('biz-solution-pretest', 'POST /merge/biz-solution-pretest');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const socket = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
  if (socket?.setNoDelay) socket.setNoDelay(true);
  res.flushHeaders?.();
  const send = (msg: string) => {
    const payload = `data: ${JSON.stringify({ step: msg })}\n\n`;
    res.write(payload, 'utf8', () => {
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    });
  };
  try {
    const result = await mergeBizSolutionPretest({ onStep: send });
    res.write(`data: ${JSON.stringify({ done: true, success: result.success, error: result.error })}\n\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ done: true, success: false, error: msg })}\n\n`);
  }
  res.end();
});

/** 合并 biz-solution：目标分支 test-260423，无 pnpm run release，SSE 流式输出 */
app.post('/merge/biz-solution', async (_req, res) => {
  recordMerge('biz-solution', 'POST /merge/biz-solution');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const socket = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
  if (socket?.setNoDelay) socket.setNoDelay(true);
  res.flushHeaders?.();
  const send = (msg: string) => {
    res.write(`data: ${JSON.stringify({ step: msg })}\n\n`, 'utf8', () => {
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    });
  };
  try {
    const result = await mergeBizSolution({ onStep: send });
    res.write(`data: ${JSON.stringify({ done: true, success: result.success, error: result.error })}\n\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ done: true, success: false, error: msg })}\n\n`);
  }
  res.end();
});

/** 合并 scm：目标分支 test-260423，无 pnpm run release，SSE 流式输出 */
app.post('/merge/scm', async (_req, res) => {
  recordMerge('scm', 'POST /merge/scm');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const socket = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
  if (socket?.setNoDelay) socket.setNoDelay(true);
  res.flushHeaders?.();
  const send = (msg: string) => {
    res.write(`data: ${JSON.stringify({ step: msg })}\n\n`, 'utf8', () => {
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    });
  };
  try {
    const result = await mergeScm({ onStep: send });
    res.write(`data: ${JSON.stringify({ done: true, success: result.success, error: result.error })}\n\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ done: true, success: false, error: msg })}\n\n`);
  }
  res.end();
});

/** 按代号合并（配置来自 config/projects），SSE 流式输出；便于扩展新项目合并 */
app.post('/merge/:code', async (req, res) => {
  const code = (req.params?.code ?? '').trim();
  if (!code) {
    res.status(400).json({ success: false, error: '缺少项目代号' });
    return;
  }
  const entry = getProjectByCode(code);
  if (!entry) {
    res.status(404).json({ success: false, error: `未找到项目代号: ${code}` });
    return;
  }
  if (!entry.merge) {
    res.status(400).json({ success: false, error: `项目 ${entry.codes[0]} 未配置 merge` });
    return;
  }
  recordMerge(code, 'POST /merge/:code');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const socket = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
  if (socket?.setNoDelay) socket.setNoDelay(true);
  res.flushHeaders?.();
  const send = (msg: string) => {
    res.write(`data: ${JSON.stringify({ step: msg })}\n\n`, 'utf8', () => {
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    });
  };
  try {
    const result = await mergeByCode(code, { onStep: send });
    res.write(`data: ${JSON.stringify({ done: true, success: result.success, error: result.error })}\n\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ done: true, success: false, error: msg })}\n\n`);
  }
  res.end();
});

let httpServer: Server | null = null;

export type StartServerOptions = {
  /** 期望监听端口，默认 config.server.port */
  preferredPort?: number;
  /** 为 false 时端口占用直接失败，不尝试 3001、3002…（Electron 托管启动用） */
  allowPortFallback?: boolean;
};

/** 关闭由本进程 startServer 启动的 HTTP 服务 */
export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!httpServer) {
      resolve();
      return;
    }
    const server = httpServer;
    httpServer = null;
    server.close(() => resolve());
  });
}

/** 启动 API 服务；默认若端口被占用则尝试下一端口；返回实际监听端口 */
export async function startServer(options?: StartServerOptions): Promise<number> {
  const basePort = options?.preferredPort ?? config.server.port;
  const allowPortFallback = options?.allowPortFallback !== false;
  const maxPort = basePort + 20;

  await stopServer();

  await syncActiveModelFromOllamaPs().catch(() => {
    /* Ollama 未启动或 /api/ps 不可用时保留内存中的默认（来自 env） */
  });

  const listenHost = process.env.API_STRICT_PORT === '1' ? '127.0.0.1' : '';

  function tryListen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const onListening = () => {
        httpServer = server;
        const actual = (server.address() as { port: number })?.port ?? port;
        const hostLabel = listenHost || 'localhost';
        const bootId = rotateApiBootId();
        console.log(`API http://${hostLabel}:${actual} bootId=${bootId}`);
        resolve(actual);
      };
      const server = listenHost ? app.listen(port, listenHost, onListening) : app.listen(port, onListening);
      server.on('error', (err: NodeJS.ErrnoException) => {
        server.close();
        if (allowPortFallback && err.code === 'EADDRINUSE' && port < maxPort) {
          tryListen(port + 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  return tryListen(basePort);
}

const isMain = process.argv[1]?.includes('api.');
if (isMain) {
  const strictPort = process.env.API_STRICT_PORT === '1';
  const preferredPort = Number(process.env.PORT) || config.server.port;
  void startServer({ allowPortFallback: !strictPort, preferredPort }).catch((e) =>
    console.error('startServer failed:', e)
  );
}
