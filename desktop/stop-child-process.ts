/* AI 生成 By Peng.Guo */
import type { ChildProcess } from 'node:child_process';

export type StopChildProcessOptions = {
  label?: string;
  /** 仅发 SIGTERM，不升级 SIGKILL（热重启等） */
  soft?: boolean;
  termWaitMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 子进程是否仍在运行（勿用 child.killed：kill() 调用后即为 true，不代表已退出） */
export function isChildProcessAlive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

/**
 * SIGTERM → 等待 → 仍存活则 SIGKILL。
 * 修复误用 child.killed 导致永远无法升级 SIGKILL、关终端/退出时卡死的问题。
 */
export async function stopChildProcess(
  child: ChildProcess,
  options?: StopChildProcessOptions
): Promise<void> {
  const label = options?.label ?? 'child';
  const termWaitMs = options?.termWaitMs ?? 600;
  if (!isChildProcessAlive(child)) return;

  try {
    console.log(`[${label}] stop: SIGTERM pid=${child.pid ?? '?'}`);
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }

  await sleep(termWaitMs);
  if (!isChildProcessAlive(child) || options?.soft) return;

  try {
    console.log(`[${label}] stop: SIGKILL pid=${child.pid ?? '?'}`);
    child.kill('SIGKILL');
  } catch {
    /* ignore */
  }
}
