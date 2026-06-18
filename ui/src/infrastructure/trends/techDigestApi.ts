/* AI 生成 By Peng.Guo */
import type { AgentChatLlmBody } from '../../domain/llm/agentLlmRequest.js';
import type {
  TechDigestLatestAllResponse,
  TechDigestLatestScopeResponse,
  TechDigestReport,
  TechDigestScope,
} from '../../domain/trends/models.js';

export type TechDigestSsePayload =
  | { type: 'progress'; message: string }
  | { type: 'llm_delta'; thinkingDelta?: string; contentDelta?: string }
  | { type: 'result'; report: TechDigestReport }
  | { type: 'error'; error: string };

export async function fetchTechDigestLatestAll(apiBase: string): Promise<TechDigestLatestAllResponse> {
  const res = await fetch(`${apiBase}/tech-digest/latest`);
  if (!res.ok) {
    throw new Error(`读取技术趋势缓存失败: ${res.status}`);
  }
  return res.json() as Promise<TechDigestLatestAllResponse>;
}

export async function fetchTechDigestLatestScope(
  apiBase: string,
  scope: TechDigestScope
): Promise<TechDigestLatestScopeResponse> {
  const res = await fetch(`${apiBase}/tech-digest/latest?scope=${encodeURIComponent(scope)}`);
  if (!res.ok) {
    throw new Error(`读取技术趋势缓存失败: ${res.status}`);
  }
  return res.json() as Promise<TechDigestLatestScopeResponse>;
}

async function consumeTechDigestSse(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onProgress: (message: string) => void;
    onLlmDelta?: (d: { thinkingDelta?: string; contentDelta?: string }) => void;
    onResult: (report: TechDigestReport) => void;
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
        let payload: TechDigestSsePayload;
        try {
          payload = JSON.parse(dataLine.slice(6)) as TechDigestSsePayload;
        } catch {
          continue;
        }
        if (payload.type === 'progress') {
          handlers.onProgress(payload.message);
        } else if (payload.type === 'llm_delta') {
          handlers.onLlmDelta?.({
            thinkingDelta: payload.thinkingDelta,
            contentDelta: payload.contentDelta,
          });
        } else if (payload.type === 'result') {
          handlers.onResult(payload.report);
        } else if (payload.type === 'error') {
          handlers.onError(payload.error);
        }
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

export async function postTechDigestRefreshStream(
  apiBase: string,
  scope: TechDigestScope,
  signal: AbortSignal,
  handlers: {
    onProgress: (message: string) => void;
    onLlmDelta?: (d: { thinkingDelta?: string; contentDelta?: string }) => void;
    onResult: (report: TechDigestReport) => void;
    onError: (message: string) => void;
  },
  opts?: { llm?: AgentChatLlmBody }
): Promise<void> {
  const body: Record<string, unknown> = { scope };
  if (opts?.llm) body.llm = opts.llm;
  const res = await fetch(`${apiBase}/tech-digest/refresh/stream`, {
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
  await consumeTechDigestSse(res.body, handlers);
}
