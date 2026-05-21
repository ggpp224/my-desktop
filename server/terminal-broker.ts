/* AI 生成 By Peng.Guo */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from '../config/default.js';
import { stripApiPortFromProcessEnv } from './sanitize-shell-env.js';
import {
  closeTerminalSession,
  createTerminalSession,
  getTerminalSessionOutput,
  resizeTerminalSession,
  writeTerminalSessionInput,
} from '../tools/terminal-session-service.js';

/** broker 内嵌 PTY 不得继承 .env 的 PORT，否则 cc-web yarn dev 与 API 抢端口 */
stripApiPortFromProcessEnv();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'terminal-broker' });
});

app.post('/sessions', (req, res) => {
  try {
    const title = (req.body?.title ?? 'terminal').toString();
    const cwd = (req.body?.cwd ?? req.body?.cwdAbs ?? '').toString().trim() || undefined;
    const command = (req.body?.command ?? '').toString().trim() || undefined;
    const session = createTerminalSession({ title, cwd, command });
    res.json({ success: true, ...session });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

app.get('/sessions/:sessionId/output', (req, res) => {
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

app.post('/sessions/:sessionId/input', (req, res) => {
  const sessionId = (req.params?.sessionId ?? '').trim();
  const data = (req.body?.data ?? '').toString();
  if (!sessionId || !data) {
    res.status(400).json({ success: false, error: '缺少 sessionId 或 data' });
    return;
  }
  const ok = writeTerminalSessionInput(sessionId, data);
  if (!ok) {
    res.status(404).json({ success: false, error: `终端会话不存在: ${sessionId}` });
    return;
  }
  res.json({ success: true });
});

app.post('/sessions/:sessionId/resize', (req, res) => {
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

app.delete('/sessions/:sessionId', (req, res) => {
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

const port = Number(process.env.TERMINAL_BROKER_PORT) || config.server.terminalBrokerPort;
const host = '127.0.0.1';

app.listen(port, host, () => {
  console.log(`Terminal broker http://${host}:${port}`);
});
