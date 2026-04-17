/* AI 生成 By Peng.Guo */
import { platform } from 'os';
import { randomUUID } from 'crypto';
import { accessSync, chmodSync, constants, existsSync, statSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import pty from 'node-pty';

type TerminalStatus = 'running' | 'success' | 'error';

interface TerminalEvent {
  seq: number;
  data: string;
}

interface TerminalSession {
  id: string;
  title: string;
  status: TerminalStatus;
  cwdAbs: string;
  createdAt: number;
  seq: number;
  events: TerminalEvent[];
  processKind: 'pty' | 'pipe';
  writer: (data: string) => void;
  resizer: (cols: number, rows: number) => void;
  killer: () => void;
}

const MAX_EVENT_BACKLOG = 4000;
const sessions = new Map<string, TerminalSession>();

function getDefaultShell(): string {
  if (platform() === 'win32') return 'powershell.exe';
  const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh']
    .map((item) => (item ?? '').trim())
    .filter(Boolean);
  for (const shell of candidates) {
    try {
      if (!existsSync(shell)) continue;
      if (!statSync(shell).isFile()) continue;
      accessSync(shell, constants.X_OK);
      return shell;
    } catch {
      // try next candidate
    }
  }
  return '/bin/sh';
}

function resolveCwd(cwd?: string): string {
  const value = (cwd ?? '').trim();
  if (!value) return process.cwd();
  try {
    if (existsSync(value) && statSync(value).isDirectory()) return value;
  } catch {
    // fallback below
  }
  return process.cwd();
}

function ensureSpawnHelperExecutable(): void {
  if (platform() !== 'darwin') return;
  const helperPath = path.resolve(process.cwd(), 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper');
  try {
    if (!existsSync(helperPath)) return;
    accessSync(helperPath, constants.X_OK);
  } catch {
    try {
      chmodSync(helperPath, 0o755);
    } catch {
      // ignore; fallback path will still handle failures.
    }
  }
}

export function createTerminalSession(params: { title: string; cwd?: string; command?: string }): {
  id: string;
  title: string;
  status: TerminalStatus;
  cwdAbs: string;
  createdAt: number;
} {
  ensureSpawnHelperExecutable();
  const id = randomUUID();
  const spawnOptions = {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: resolveCwd(params.cwd),
    env: process.env as Record<string, string>,
  };
  const appendEvent = (session: TerminalSession, data: string) => {
    if (!data) return;
    session.seq += 1;
    session.events.push({ seq: session.seq, data });
    if (session.events.length > MAX_EVENT_BACKLOG) {
      session.events.splice(0, session.events.length - MAX_EVENT_BACKLOG);
    }
  };

  const baseSession: Omit<TerminalSession, 'processKind' | 'writer' | 'resizer'> = {
    id,
    title: params.title,
    status: 'running',
    cwdAbs: spawnOptions.cwd,
    createdAt: Date.now(),
    seq: 0,
    events: [],
    killer: () => {},
  };

  try {
    const ptyProcess = pty.spawn(getDefaultShell(), [], spawnOptions);
    const session: TerminalSession = {
      ...baseSession,
      processKind: 'pty',
      writer: (data: string) => ptyProcess.write(data),
      resizer: (cols: number, rows: number) => ptyProcess.resize(cols, rows),
      killer: () => ptyProcess.kill(),
    };
    ptyProcess.onData((data) => appendEvent(session, data));
    ptyProcess.onExit(({ exitCode }) => {
      session.status = exitCode === 0 ? 'success' : 'error';
      appendEvent(session, `\r\n[process exited with code ${exitCode}]\r\n`);
    });
    if (params.command?.trim()) {
      ptyProcess.write(`${params.command}\r`);
    }
    sessions.set(id, session);
    return { id, title: session.title, status: session.status, cwdAbs: session.cwdAbs, createdAt: session.createdAt };
  } catch (firstErr) {
    try {
      const shell = getDefaultShell();
      const child = spawn(shell, ['-i'], {
        cwd: spawnOptions.cwd,
        env: spawnOptions.env,
        stdio: 'pipe',
      });
      const session: TerminalSession = {
        ...baseSession,
        processKind: 'pipe',
        writer: (data: string) => child.stdin.write(data),
        resizer: () => {},
        killer: () => child.kill(),
      };
      child.stdout.on('data', (chunk: Buffer) => appendEvent(session, chunk.toString('utf-8')));
      child.stderr.on('data', (chunk: Buffer) => appendEvent(session, chunk.toString('utf-8')));
      child.on('close', (code) => {
        session.status = code === 0 ? 'success' : 'error';
        appendEvent(session, `\n[process exited with code ${code ?? 'unknown'}]\n`);
      });
      child.on('error', (err) => {
        session.status = 'error';
        appendEvent(session, `\n[process error: ${err.message}]\n`);
      });
      appendEvent(
        session,
        `\n[warning] 当前环境不支持 PTY，已自动切换兼容终端模式（部分全屏交互程序可能受限）。\n`
      );
      if (params.command?.trim()) {
        child.stdin.write(`${params.command}\n`);
      }
      sessions.set(id, session);
      return { id, title: session.title, status: session.status, cwdAbs: session.cwdAbs, createdAt: session.createdAt };
    } catch (secondErr) {
      const first = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const second = secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(`终端启动失败: ${first}; fallback 失败: ${second}`);
    }
  }
}

export function getTerminalSessionOutput(sessionId: string, sinceSeq = 0): {
  id: string;
  title: string;
  status: TerminalStatus;
  cwdAbs: string;
  seq: number;
  chunks: string[];
} | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const chunks = session.events.filter((item) => item.seq > sinceSeq).map((item) => item.data);
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    cwdAbs: session.cwdAbs,
    seq: session.seq,
    chunks,
  };
}

export function writeTerminalSessionInput(sessionId: string, data: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.writer(data);
  return true;
}

export function resizeTerminalSession(sessionId: string, cols: number, rows: number): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  const safeCols = Number.isFinite(cols) ? Math.max(20, Math.floor(cols)) : 80;
  const safeRows = Number.isFinite(rows) ? Math.max(10, Math.floor(rows)) : 24;
  session.resizer(safeCols, safeRows);
  return true;
}

export function closeTerminalSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  try {
    session.killer();
  } catch {
    // ignore kill errors
  }
  sessions.delete(sessionId);
  return true;
}
