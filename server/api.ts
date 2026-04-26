/* AI 生成 By Peng.Guo */
import 'dotenv/config';
import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import { runAgent, type AgentLlmOptions } from '../agent/agent.js';
import { testGeminiConnection } from '../agent/gemini-client.js';
import { healthCheck } from '../agent/ollama-client.js';
import {
  fetchOllamaInstalledModelNames,
  getOllamaActiveModel,
  setOllamaActiveModel,
  syncActiveModelFromOllamaPs,
  unloadOllamaModel,
} from '../agent/ollama-runtime.js';
import { config } from '../config/default.js';
import { getJenkinsPreset } from '../config/jenkins-presets.js';
import { deploy as jenkinsDeploy, getDeployStatus, getDeployStatusByBuildHistory } from '../tools/jenkins-tool.js';
import { open as openBrowser } from '../tools/browser-tool.js';
import { getAllProjects, getProjectByCode } from '../config/projects.js';
import { mergeByCode, mergeNova, mergeBizSolution, mergeScm } from '../tools/merge-tool.js';
import { runWorkflowStep } from '../tools/workflow-tool.js';
import { addManualTerminalToSession, closeEmbeddedWorkflowSession, getEmbeddedWorkflowSession, removeTerminalFromSession, startEmbeddedWorkflow } from '../tools/workflow-embedded-service.js';
import { closeTerminalSession, getTerminalSessionOutput, resizeTerminalSession, writeTerminalSessionInput } from '../tools/terminal-session-service.js';
import { promises as fs } from 'fs';
import path from 'path';

/** 出站 DNS 优先 IPv4，避免部分网络 IPv6 不通导致 Google 等连接在 IPv6 上卡死至超时 */
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));

/** 进行中的 /agent/chat 可中止：切换模型或新请求时取消与 Ollama 的连接 */
let agentChatAbort: AbortController | null = null;

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
  const model = String(l.model ?? '').trim() || 'gemini-2.0-flash';
  const baseUrlRaw = String(l.baseUrl ?? '').trim();
  return {
    mode: 'external',
    provider: 'gemini',
    ...(apiKeyFromBody ? { apiKey: apiKeyFromBody } : {}),
    model,
    baseUrl: baseUrlRaw || undefined,
  };
}

/** 设置页：测试当前表单或环境变量中的 Gemini 是否可达（不落盘） */
app.post('/agent/gemini/test', async (req, res) => {
  const apiKeyFromBody = String(req.body?.apiKey ?? '').trim();
  const apiKeyFromEnv = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
  const apiKey = apiKeyFromBody || apiKeyFromEnv;
  if (!apiKey) {
    res.status(400).json({ ok: false, error: '缺少 API Key：在请求体中传入 apiKey，或配置 GEMINI_API_KEY / GOOGLE_API_KEY' });
    return;
  }
  const model = String(req.body?.model ?? '').trim() || 'gemini-2.0-flash';
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

app.get('/health', async (_req, res) => {
  const ollamaReachable = await healthCheck();
  res.status(200).json({ ok: true, ollamaReachable, service: 'ai-dev-control-center' });
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
  const sourceNameRaw = String(req.body?.sourceName ?? '').trim() || `import-${Date.now()}`;
  const files = Array.isArray(req.body?.files) ? (req.body.files as KnowledgeImportFile[]) : [];
  if (!files.length) {
    res.status(400).json({ success: false, error: '缺少 files' });
    return;
  }
  const sourceName = sourceNameRaw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || `import-${Date.now()}`;
  const targetRoot = path.join(PRIVATE_KB_BASE_DIR, sourceName);
  let imported = 0;
  try {
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
  try {
    await openBrowser(url);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
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
  let preset = getJenkinsPreset(jobKey);
  if (!preset) {
    const entry = getProjectByCode(jobKey);
    if (entry?.jenkins) {
      const branchParam = (entry.jenkins.branchParam || 'BRANCH_NAME').trim() || 'BRANCH_NAME';
      preset = {
        name: entry.jenkins.jobName,
        branchParam,
        parameters: { [branchParam]: branch || entry.jenkins.defaultBranch },
      };
    }
  }
  const jobName = preset ? preset.name : jobKey;
  let parameters: Record<string, string> | undefined = preset?.parameters;
  if (preset && branch) {
    const branchParam = preset.branchParam || 'BRANCH_NAME';
    parameters = { ...(preset.parameters ?? {}), [branchParam]: branch };
  }
  try {
    const result = await jenkinsDeploy(jobName, parameters);
    res.json({ ...result, jobName });
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
app.post('/workflow/sessions/:sessionId/terminals', (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const cwdFromBody = (req.body?.cwdAbs ?? req.body?.cwd ?? '').toString().trim();
  const terminal = addManualTerminalToSession(sessionId, cwdFromBody ? { cwd: cwdFromBody } : undefined);
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
app.get('/terminal/sessions/:sessionId/output', (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  const from = Number((req.query?.from ?? 0).toString());
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const data = getTerminalSessionOutput(sessionId, Number.isFinite(from) ? from : 0);
  if (!data) {
    res.status(404).json({ success: false, error: `终端会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true, ...data });
});

/** 写入终端输入，支持回车/编辑/快捷键 */
app.post('/terminal/sessions/:sessionId/input', (req, res) => {
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
  const ok = writeTerminalSessionInput(sessionId, data);
  if (!ok) {
    res.status(404).json({ success: false, error: `终端会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true });
});

/** 通知后端终端尺寸变化，保证 curses 类程序正常显示 */
app.post('/terminal/sessions/:sessionId/resize', (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  const cols = Number(req.body?.cols ?? 80);
  const rows = Number(req.body?.rows ?? 24);
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const ok = resizeTerminalSession(sessionId, cols, rows);
  if (!ok) {
    res.status(404).json({ success: false, error: `终端会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true });
});

/** 直接关闭终端会话（保留接口，便于未来非 workflow 终端管理） */
app.delete('/terminal/sessions/:sessionId', (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  if (!sessionId) {
    res.status(400).json({ success: false, error: '缺少 sessionId' });
    return;
  }
  const ok = closeTerminalSession(sessionId);
  if (!ok) {
    res.status(404).json({ success: false, error: `终端会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true });
});

/** 合并 nova：SSE 流式输出每步，前端可实时展示 */
app.post('/merge/nova', async (_req, res) => {
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

/** 合并 biz-solution：目标分支 test-260127，无 pnpm run release，SSE 流式输出 */
app.post('/merge/biz-solution', async (_req, res) => {
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

/** 合并 scm：目标分支 test-260127，无 pnpm run release，SSE 流式输出 */
app.post('/merge/scm', async (_req, res) => {
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

/** 启动 API 服务；若端口被占用则尝试 3001、3002…，返回实际监听端口 */
export async function startServer(): Promise<number> {
  const basePort = config.server.port;
  const maxPort = basePort + 20;

  await syncActiveModelFromOllamaPs().catch(() => {
    /* Ollama 未启动或 /api/ps 不可用时保留内存中的默认（来自 env） */
  });

  function tryListen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = app.listen(port, () => {
        const actual = (server.address() as { port: number })?.port ?? port;
        console.log(`API http://localhost:${actual}`);
        resolve(actual);
      });
      server.on('error', (err: NodeJS.ErrnoException) => {
        server.close();
        if (err.code === 'EADDRINUSE' && port < maxPort) {
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
if (isMain) void startServer().catch((e) => console.error('startServer failed:', e));
