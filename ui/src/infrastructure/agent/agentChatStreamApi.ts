/* AI 生成 By Peng.Guo */
/** 解析 POST /agent/chat/stream 返回的 SSE，驱动 UI 增量与最终结果 */

export type AgentChatSsePayload =
  | { type: 'llm_delta'; thinkingDelta?: string; contentDelta?: string }
  | {
      type: 'tool_progress';
      phase: 'start' | 'progress' | 'stream_delta' | 'done';
      tool: string;
      message?: string;
      ok?: boolean;
      thinkingDelta?: string;
      contentDelta?: string;
    }
  | { type: 'result'; result: unknown }
  | { type: 'error'; error: string };

export type AgentToolProgressEvent = {
  phase: 'start' | 'progress' | 'stream_delta' | 'done';
  tool: string;
  message?: string;
  ok?: boolean;
  thinkingDelta?: string;
  contentDelta?: string;
};

export async function consumeAgentChatSseStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onLlmDelta: (d: { thinkingDelta?: string; contentDelta?: string }) => void;
    onToolProgress?: (e: AgentToolProgressEvent) => void;
    onResult: (result: unknown) => void;
    onError: (message: string) => void;
  }
): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let gotResult = false;
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
        let payload: AgentChatSsePayload;
        try {
          payload = JSON.parse(dataLine.slice(6)) as AgentChatSsePayload;
        } catch {
          continue;
        }
        if (payload.type === 'llm_delta') {
          handlers.onLlmDelta({
            thinkingDelta: payload.thinkingDelta,
            contentDelta: payload.contentDelta,
          });
        } else if (payload.type === 'tool_progress') {
          handlers.onToolProgress?.({
            phase: payload.phase,
            tool: payload.tool,
            message: payload.message,
            ok: payload.ok,
            thinkingDelta: payload.thinkingDelta,
            contentDelta: payload.contentDelta,
          });
        } else if (payload.type === 'result' && 'result' in payload) {
          gotResult = true;
          handlers.onResult(payload.result);
        } else if (payload.type === 'error' && payload.error) {
          handlers.onError(payload.error);
          return;
        }
      }
    }
    if (!gotResult) handlers.onError('流式响应未返回结果');
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    handlers.onError(e instanceof Error ? e.message : String(e));
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

export async function postAgentChatStream(
  apiBase: string,
  message: string,
  signal: AbortSignal,
  handlers: {
    onLlmDelta: (d: { thinkingDelta?: string; contentDelta?: string }) => void;
    onToolProgress?: (e: AgentToolProgressEvent) => void;
    onResult: (result: unknown) => void;
    onError: (message: string) => void;
  }
): Promise<void> {
  const res = await fetch(`${apiBase}/agent/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
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
  await consumeAgentChatSseStream(res.body, handlers);
}
