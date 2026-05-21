/* AI 生成 By Peng.Guo */
import {
  closeTerminalSession as localClose,
  createTerminalSession as localCreate,
  getTerminalSessionOutput as localGetOutput,
  resizeTerminalSession as localResize,
  writeTerminalSessionInput as localWrite,
} from './terminal-session-service.js';

type TerminalStatus = 'running' | 'success' | 'error';

export type TerminalSessionMeta = {
  id: string;
  title: string;
  status: TerminalStatus;
  cwdAbs: string;
  createdAt: number;
};

function brokerBase(): string | null {
  const raw = (process.env.TERMINAL_BROKER_URL ?? '').trim().replace(/\/$/, '');
  return raw || null;
}

async function brokerJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = brokerBase();
  if (!base) throw new Error('TERMINAL_BROKER_URL 未配置');
  const res = await fetch(`${base}${path}`, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const msg = typeof data === 'object' && data && 'error' in data ? String(data.error) : res.statusText;
    throw new Error(msg || `terminal broker HTTP ${res.status}`);
  }
  return data;
}

export async function createTerminalSession(params: {
  title: string;
  cwd?: string;
  command?: string;
}): Promise<TerminalSessionMeta> {
  if (!brokerBase()) return localCreate(params);
  const data = await brokerJson<{ success: boolean } & TerminalSessionMeta>('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return {
    id: data.id,
    title: data.title,
    status: data.status,
    cwdAbs: data.cwdAbs,
    createdAt: data.createdAt,
  };
}

export async function getTerminalSessionOutput(
  sessionId: string,
  sinceSeq = 0
): Promise<{
  id: string;
  title: string;
  status: TerminalStatus;
  cwdAbs: string;
  seq: number;
  chunks: string[];
} | null> {
  if (!brokerBase()) return localGetOutput(sessionId, sinceSeq);
  try {
    const data = await brokerJson<{
      success: boolean;
      id: string;
      title: string;
      status: TerminalStatus;
      cwdAbs: string;
      seq: number;
      chunks: string[];
    }>(`/sessions/${encodeURIComponent(sessionId)}/output?from=${sinceSeq}`);
    if (!data.success) return null;
    return {
      id: data.id,
      title: data.title,
      status: data.status,
      cwdAbs: data.cwdAbs,
      seq: data.seq,
      chunks: data.chunks,
    };
  } catch {
    return null;
  }
}

export async function writeTerminalSessionInput(sessionId: string, data: string): Promise<boolean> {
  if (!brokerBase()) return localWrite(sessionId, data);
  try {
    const out = await brokerJson<{ success: boolean }>(`/sessions/${encodeURIComponent(sessionId)}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    return !!out.success;
  } catch {
    return false;
  }
}

export async function resizeTerminalSession(sessionId: string, cols: number, rows: number): Promise<boolean> {
  if (!brokerBase()) return localResize(sessionId, cols, rows);
  try {
    const out = await brokerJson<{ success: boolean }>(`/sessions/${encodeURIComponent(sessionId)}/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols, rows }),
    });
    return !!out.success;
  } catch {
    return false;
  }
}

export async function closeTerminalSession(sessionId: string): Promise<boolean> {
  if (!brokerBase()) return localClose(sessionId);
  try {
    const out = await brokerJson<{ success: boolean }>(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    return !!out.success;
  } catch {
    return false;
  }
}
