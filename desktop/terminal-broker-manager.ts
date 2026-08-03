/* AI 生成 By Peng.Guo */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/default.js';
import { registerProtectedProcess, releaseApiPort, unregisterProtectedProcess } from '../server/port-utils.js';
import { buildSubprocessEnv, resolveSubprocessNode } from './subprocess-node.js';
import { isChildProcessAlive, stopChildProcess } from './stop-child-process.js';
import { sanitizeShellEnv } from '../server/sanitize-shell-env.js';

let brokerChild: ChildProcess | null = null;
let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBrokerHealth(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(300);
  }
  throw new Error(`Terminal broker 在 ${timeoutMs}ms 内未就绪（端口 ${port}）`);
}

export async function startTerminalBroker(projectRoot: string, isDev: boolean): Promise<number> {
  const port = config.server.terminalBrokerPort;
  await stopTerminalBroker(port, { soft: false });
  await releaseApiPort(port);
  shuttingDown = false;

  const subprocessNode = resolveSubprocessNode(isDev);
  const env = buildSubprocessEnv(
    sanitizeShellEnv(process.env),
    {
      TERMINAL_BROKER_PORT: String(port),
      NODE_ENV: isDev ? 'development' : 'production',
    },
    subprocessNode
  );

  const distEntry = path.join(projectRoot, 'dist', 'server', 'terminal-broker.js');
  const useCompiledInDev = isDev && existsSync(distEntry);

  if (useCompiledInDev || !isDev) {
    const entry = useCompiledInDev ? distEntry : path.join(projectRoot, 'dist', 'server', 'terminal-broker.js');
    brokerChild = spawn(subprocessNode.executable, [entry], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(
      `[terminal-broker] spawn via ${subprocessNode.useElectronAsNode ? 'Electron-as-Node' : 'node'} (${subprocessNode.executable})`
    );
  } else {
    const tsxBin = path.join(
      projectRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
    );
    const entry = path.join(projectRoot, 'server', 'terminal-broker.ts');
    brokerChild = spawn(tsxBin, [entry], { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  }

  const child = brokerChild;
  if (!child) throw new Error('Terminal broker 子进程启动失败');
  registerProtectedProcess(child.pid ?? undefined);
  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trimEnd();
    if (text) console.log(`[terminal-broker] ${text}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trimEnd();
    if (text) console.error(`[terminal-broker] ${text}`);
  });
  child.on('exit', (code, signal) => {
    unregisterProtectedProcess(child.pid ?? undefined);
    if (brokerChild === child) brokerChild = null;
    if (code !== 0 && code !== null) {
      console.error(`[terminal-broker] exited code=${code} signal=${signal ?? ''}`);
    }
  });

  await waitForBrokerHealth(port);
  console.log(`Terminal broker ready on port ${port}`);
  return port;
}

export async function stopTerminalBroker(
  port: number = config.server.terminalBrokerPort,
  options?: { soft?: boolean }
): Promise<void> {
  shuttingDown = true;
  const child = brokerChild;
  brokerChild = null;
  if (child) {
    unregisterProtectedProcess(child.pid ?? undefined);
    await stopChildProcess(child, {
      label: 'terminal-broker',
      soft: options?.soft === true,
      termWaitMs: 400,
    });
  }
  if (!options?.soft) {
    await releaseApiPort(port);
  }
}

export function getTerminalBrokerUrl(port: number = config.server.terminalBrokerPort): string {
  return `http://127.0.0.1:${port}`;
}

export function isTerminalBrokerRunning(): boolean {
  return brokerChild != null && isChildProcessAlive(brokerChild);
}
