/* AI 生成 By Peng.Guo */

export type VideoHealthResponse = {
  success: boolean;
  ok: boolean;
  ffmpeg: boolean;
  ollama: boolean;
  mockMode: boolean;
  scriptModel: string;
  sidecars: Record<string, { ok: boolean; model?: string; mock?: boolean }>;
};

export type VideoSsePayload =
  | { type: 'step'; message: string }
  | { type: 'progress'; percent: number }
  | { type: 'done'; jobId: string; outputPath?: string; script?: unknown }
  | { type: 'error'; message: string; jobId?: string; steps?: unknown[] };

export type VideoServicesStartResponse = {
  success: boolean;
  started?: string[];
  skipped?: string[];
  notes?: string[];
  error?: string;
};

export async function postVideoStartServices(apiBase: string): Promise<VideoServicesStartResponse> {
  const res = await fetch(`${apiBase}/video/services/start`, { method: 'POST' });
  const body = (await res.json()) as VideoServicesStartResponse & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `启动服务失败: HTTP ${res.status}`);
  }
  return body;
}

export async function fetchVideoHealth(apiBase: string): Promise<VideoHealthResponse> {
  const res = await fetch(`${apiBase}/video/health`);
  if (!res.ok) throw new Error(`健康检查失败: HTTP ${res.status}`);
  return res.json() as Promise<VideoHealthResponse>;
}

async function consumeVideoSse(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onStep: (message: string) => void;
    onProgress: (percent: number) => void;
    onDone: (payload: { jobId: string; outputPath?: string; script?: unknown }) => void;
    onError: (message: string) => void;
  }
): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const dataLine = block
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        let payload: VideoSsePayload;
        try {
          payload = JSON.parse(dataLine.slice(6)) as VideoSsePayload;
        } catch {
          continue;
        }
        if (payload.type === 'step') handlers.onStep(payload.message);
        else if (payload.type === 'progress') handlers.onProgress(payload.percent);
        else if (payload.type === 'done') {
          handlers.onDone({ jobId: payload.jobId, outputPath: payload.outputPath, script: payload.script });
        } else if (payload.type === 'error') handlers.onError(payload.message);
      }
    }
  } catch (e) {
    handlers.onError(e instanceof Error ? e.message : String(e));
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

export async function postVideoGenerateStream(
  apiBase: string,
  prompt: string,
  signal: AbortSignal,
  handlers: {
    onStep: (message: string) => void;
    onProgress: (percent: number) => void;
    onDone: (payload: { jobId: string; outputPath?: string; script?: unknown }) => void;
    onError: (message: string) => void;
  },
  opts?: { scriptModel?: string }
): Promise<void> {
  const body: Record<string, unknown> = { prompt };
  if (opts?.scriptModel) body.scriptModel = opts.scriptModel;
  const res = await fetch(`${apiBase}/video/generate/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let errText = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) errText = j.error;
    } catch {
      try {
        errText = await res.text();
      } catch {
        /* ignore */
      }
    }
    handlers.onError(errText);
    return;
  }
  if (!res.body) {
    handlers.onError('无响应体');
    return;
  }
  await consumeVideoSse(res.body, handlers);
}

export async function cancelVideoGenerate(apiBase: string): Promise<void> {
  await fetch(`${apiBase}/video/generate/cancel`, { method: 'POST' });
}

export function buildVideoFinalUrl(apiBase: string, jobId: string): string {
  return `${apiBase}/video/jobs/${encodeURIComponent(jobId)}/final`;
}
