/* AI 生成 By Peng.Guo */
import type { Express, Response } from 'express';
import { existsSync } from 'fs';
import { checkVideoPipelineHealth } from '../tools/video/video-health.js';
import { startVideoServices } from '../tools/video/video-services-starter.js';
import { runVideoPipeline } from '../tools/video/video-pipeline-orchestrator.js';
import { getVideoJobFinalPath, loadVideoJobMeta } from '../tools/video/video-job-store.js';

const activeVideoJobs = new Map<string, AbortController>();

function sendSse(res: Response, obj: unknown): void {
  const payload = `data: ${JSON.stringify(obj)}\n\n`;
  res.write(payload, 'utf8', () => {
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
      (res as unknown as { flush: () => void }).flush();
    }
  });
}

export function registerVideoRoutes(app: Express): void {
  app.post('/video/services/start', async (_req, res) => {
    try {
      const result = await startVideoServices();
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  app.get('/video/health', async (_req, res) => {
    try {
      const report = await checkVideoPipelineHealth();
      res.json({ success: true, ...report });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  app.get('/video/jobs/:id', async (req, res) => {
    const jobId = String(req.params.id ?? '').trim();
    if (!jobId) {
      res.status(400).json({ success: false, error: '缺少 job id' });
      return;
    }
    const meta = await loadVideoJobMeta(jobId);
    if (!meta) {
      res.status(404).json({ success: false, error: 'Job 不存在' });
      return;
    }
    res.json({ success: true, job: meta });
  });

  app.get('/video/jobs/:id/final', async (req, res) => {
    const jobId = String(req.params.id ?? '').trim();
    const finalPath = getVideoJobFinalPath(jobId);
    if (!existsSync(finalPath)) {
      res.status(404).json({ success: false, error: '成片尚未生成' });
      return;
    }
    res.type('video/mp4');
    res.sendFile(finalPath);
  });

  app.post('/video/generate/stream', async (req, res) => {
    const prompt = String(req.body?.prompt ?? '').trim();
    if (!prompt) {
      res.status(400).json({ success: false, error: '缺少 prompt' });
      return;
    }
    const scriptModel = req.body?.scriptModel ? String(req.body.scriptModel).trim() : undefined;

    activeVideoJobs.forEach((c) => c.abort());
    activeVideoJobs.clear();
    const abort = new AbortController();
    const jobKey = `pending-${Date.now()}`;
    activeVideoJobs.set(jobKey, abort);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const socket = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
    if (socket?.setNoDelay) socket.setNoDelay(true);
    res.flushHeaders?.();

    try {
      const result = await runVideoPipeline({
        prompt,
        scriptModel,
        signal: abort.signal,
        onStep: (message) => sendSse(res, { type: 'step', message }),
        onProgress: (percent) => sendSse(res, { type: 'progress', percent }),
      });

      if (result.success) {
        sendSse(res, {
          type: 'done',
          jobId: result.jobId,
          outputPath: result.outputPath,
          script: result.script,
        });
      } else {
        sendSse(res, { type: 'error', message: result.message, jobId: result.jobId, steps: result.steps });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendSse(res, { type: 'error', message: msg });
    } finally {
      activeVideoJobs.delete(jobKey);
      res.end();
    }
  });

  app.post('/video/generate/cancel', (_req, res) => {
    activeVideoJobs.forEach((c) => c.abort());
    activeVideoJobs.clear();
    res.json({ success: true });
  });
}
