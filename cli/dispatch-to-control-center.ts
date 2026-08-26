/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';

export type DispatchResult =
  | {
      ok: true;
      code: 'dispatched' | 'queued';
      id: string;
      subscriberCount: number;
      apiBase: string;
    }
  | {
      ok: false;
      code: 'dev_center_offline' | 'bad_request';
      error: string;
      apiBase: string;
    };

function resolveApiBase(): string {
  const fromEnv = (process.env.API_BASE_URL ?? '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  return `http://127.0.0.1:${config.server.port}`;
}

export async function dispatchToControlCenter(message: string): Promise<DispatchResult> {
  const apiBase = resolveApiBase();
  const text = message.trim();
  if (!text) {
    return { ok: false, code: 'bad_request', error: '缺少口令', apiBase };
  }

  try {
    const health = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(2000) });
    if (!health.ok) {
      return {
        ok: false,
        code: 'dev_center_offline',
        error: `中控 API 未就绪（HTTP ${health.status}）。请先启动 Dev Center 或 /start-dev-center。`,
        apiBase,
      };
    }
  } catch {
    return {
      ok: false,
      code: 'dev_center_offline',
      error: `无法连接中控 API ${apiBase}。请先启动 Dev Center 或 /start-dev-center。`,
      apiBase,
    };
  }

  try {
    const res = await fetch(`${apiBase}/agent/remote-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as {
      ok?: boolean;
      id?: string;
      subscriberCount?: number;
      queued?: boolean;
      error?: string;
    };
    if (!res.ok || !body.ok || !body.id) {
      return {
        ok: false,
        code: 'bad_request',
        error: body.error ?? `中控拒绝口令（HTTP ${res.status}）`,
        apiBase,
      };
    }
    return {
      ok: true,
      code: body.queued ? 'queued' : 'dispatched',
      id: body.id,
      subscriberCount: body.subscriberCount ?? 0,
      apiBase,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'dev_center_offline',
      error: err instanceof Error ? err.message : String(err),
      apiBase,
    };
  }
}
