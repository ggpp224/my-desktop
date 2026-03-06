/* AI 生成 By Peng.Guo */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runAgent } from '../agent/agent.js';
import { healthCheck } from '../agent/ollama-client.js';
import { config } from '../config/default.js';
import { deploy as jenkinsDeploy } from '../tools/jenkins-tool.js';

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

/** 快捷触发 Jenkins 部署：body.job 为预定义 key（如 nova）或完整 job 名称；预定义可带固定构建参数 */
const JENKINS_JOB_PRESETS: Record<string, { name: string; parameters?: Record<string, string> }> = {
  nova: { name: config.jenkins.jobs.nova, parameters: { BRANCH_NAME: 'test' } },
};
app.post('/jenkins/deploy', async (req, res) => {
  const jobKey = (req.body?.job ?? '').trim();
  if (!jobKey) {
    res.status(400).json({ success: false, error: '缺少 job' });
    return;
  }
  const preset = JENKINS_JOB_PRESETS[jobKey];
  const jobName = preset ? preset.name : jobKey;
  const parameters = preset?.parameters;
  try {
    const result = await jenkinsDeploy(jobName, parameters);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
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
