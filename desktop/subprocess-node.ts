/* AI 生成 By Peng.Guo */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export type SubprocessNodeResolution = {
  /** 子进程可执行文件（系统 node 或 Electron） */
  executable: string;
  /** 为 true 时 spawn env 需设 ELECTRON_RUN_AS_NODE=1 */
  useElectronAsNode: boolean;
};

/**
 * 开发态用系统 node 启动 API / Terminal Broker，避免再拉起两份 Electron（~200MB+）被 macOS Jetsam SIGKILL。
 * 打包态用 Electron + ELECTRON_RUN_AS_NODE，与分发二进制 ABI 一致。
 */
export function resolveSubprocessNode(isDev: boolean): SubprocessNodeResolution {
  const fromEnv = process.env.SUBPROCESS_NODE?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    const useElectronAsNode = fromEnv === process.execPath;
    return { executable: fromEnv, useElectronAsNode };
  }

  if (!isDev) {
    return { executable: process.execPath, useElectronAsNode: true };
  }

  const npmNode = process.env.npm_node_execpath?.trim();
  if (npmNode && existsSync(npmNode)) {
    return { executable: npmNode, useElectronAsNode: false };
  }

  try {
    const found = execSync('command -v node', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (found && existsSync(found)) {
      return { executable: found, useElectronAsNode: false };
    }
  } catch {
    /* fallback */
  }

  return { executable: 'node', useElectronAsNode: false };
}

export function buildSubprocessEnv(
  base: NodeJS.ProcessEnv,
  extra: Record<string, string>,
  node: SubprocessNodeResolution
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, ...extra };
  if (node.useElectronAsNode) {
    env.ELECTRON_RUN_AS_NODE = '1';
  } else {
    delete env.ELECTRON_RUN_AS_NODE;
  }
  return env;
}
