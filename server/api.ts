/* AI 生成 By Peng.Guo */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runAgent } from '../agent/agent.js';
import { healthCheck } from '../agent/ollama-client.js';
import { config } from '../config/default.js';
import { getJenkinsPreset } from '../config/jenkins-presets.js';
import { deploy as jenkinsDeploy, getDeployStatus, getDeployStatusByBuildHistory } from '../tools/jenkins-tool.js';
import { open as openBrowser } from '../tools/browser-tool.js';
import { getAllProjects, getProjectByCode } from '../config/projects.js';
import { mergeByCode, mergeNova, mergeBizSolution, mergeScm } from '../tools/merge-tool.js';
import { runWorkflowStep } from '../tools/workflow-tool.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => res.status(200).json({ ok: true, service: 'ai-dev-control-center' }));

app.get('/health', async (_req, res) => {
  const ok = await healthCheck();
  res.status(ok ? 200 : 503).json({ ok, service: 'ai-dev-control-center' });
});

app.post('/agent/chat', async (req, res) => {
  const message = (req.body?.message ?? '').trim();
  if (!message) {
    res.status(400).json({ success: false, error: '缺少 message' });
    return;
  }
  try {
    const result = await runAgent(message);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
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

/** 快捷触发 Jenkins 部署：body.job 为预定义 key（如 nova、base）或完整 job 名称；预定义可带固定构建参数 */
app.post('/jenkins/deploy', async (req, res) => {
  const jobKey = (req.body?.job ?? '').trim();
  if (!jobKey) {
    res.status(400).json({ success: false, error: '缺少 job' });
    return;
  }
  let preset = getJenkinsPreset(jobKey);
  if (!preset) {
    const entry = getProjectByCode(jobKey);
    if (entry?.jenkins) {
      preset = {
        name: entry.jenkins.jobName,
        parameters: { BRANCH_NAME: entry.jenkins.defaultBranch },
      };
    }
  }
  const jobName = preset ? preset.name : jobKey;
  const parameters = preset?.parameters;
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
export function startServer(): Promise<number> {
  const basePort = config.server.port;
  const maxPort = basePort + 20;

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
if (isMain) startServer();
