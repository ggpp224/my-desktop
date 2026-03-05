/* AI 生成 By Peng.Guo */
import express from 'express';
import cors from 'cors';
import { runAgent } from '../agent/agent.js';
import { healthCheck } from '../agent/ollama-client.js';
import { config } from '../config/default.js';

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

export function startServer(): void {
  const port = config.server.port;
  app.listen(port, () => {
    console.log(`API http://localhost:${port}`);
  });
}

const isMain = process.argv[1]?.includes('api.');
if (isMain) startServer();
