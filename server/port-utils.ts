/* AI 生成 By Peng.Guo */
import { execSync } from 'node:child_process';
import { config } from '../config/default.js';

const PORT_RELEASE_WAIT_MS = 400;

/** Electron 托管的 API / Terminal Broker 子进程 PID，releaseApiPort 不得误杀 */
const protectedPids = new Set<number>();

export function registerProtectedProcess(pid: number | undefined): void {
  if (typeof pid === 'number' && pid > 0) protectedPids.add(pid);
}

export function unregisterProtectedProcess(pid: number | undefined): void {
  if (typeof pid === 'number' && pid > 0) protectedPids.delete(pid);
}

function listListenerPidsOnPort(port: number): number[] {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set<number>();
      for (const line of out.split('\n')) {
        if (!/LISTENING/i.test(line)) continue;
        const m = line.trim().match(/\s+(\d+)\s*$/);
        if (m) pids.add(Number(m[1]));
      }
      return [...pids].filter((pid) => pid > 0 && pid !== process.pid && !protectedPids.has(pid));
    } catch {
      return [];
    }
  }
  try {
    const raw = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' }).trim();
    if (!raw) return [];
    return raw
      .split('\n')
      .map((pidStr) => Number(pidStr))
      .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid && !protectedPids.has(pid));
  } catch {
    return [];
  }
}

/** 检测本机端口是否已有进程监听 */
export function isPortInUse(port: number): boolean {
  return listListenerPidsOnPort(port).length > 0;
}

function describeProcess(pid: number): string {
  try {
    return execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8' }).trim();
  } catch {
    return '(unknown)';
  }
}

/** 终止占用指定 TCP 端口的监听进程（不杀连接方客户端，避免误杀正在请求 API 的 Electron） */
export function killListenersOnPort(port: number): number[] {
  const pids = listListenerPidsOnPort(port);
  for (const pid of pids) {
    try {
      console.log(`[port-utils] SIGTERM listener on :${port} pid=${pid} cmd=${describeProcess(pid)}`);
      process.kill(pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
  }
  return pids;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 清理端口占用（不依赖 Express 进程内 stopServer，供 Electron 子进程模式使用） */
export async function releaseApiPort(port: number = config.server.port): Promise<void> {
  let pids = killListenersOnPort(port);
  if (pids.length > 0) {
    console.log(`[port-utils] releasing :${port}, SIGTERM -> ${pids.join(', ')}`);
  }
  await sleep(PORT_RELEASE_WAIT_MS);
  if (!isPortInUse(port)) return;
  pids = listListenerPidsOnPort(port);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
      console.log(`[port-utils] SIGKILL listener on :${port} pid=${pid} cmd=${describeProcess(pid)}`);
    } catch {
      /* ignore */
    }
  }
  await sleep(PORT_RELEASE_WAIT_MS);
}
