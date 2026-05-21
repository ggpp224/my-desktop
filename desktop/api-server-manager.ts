/* AI 生成 By Peng.Guo */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/default.js';
import { registerProtectedProcess, releaseApiPort, unregisterProtectedProcess } from '../server/port-utils.js';
import {
  getTerminalBrokerUrl,
  isTerminalBrokerRunning,
  startTerminalBroker,
  stopTerminalBroker,
} from './terminal-broker-manager.js';
import { buildSubprocessEnv, resolveSubprocessNode } from './subprocess-node.js';
import { sanitizeShellEnv } from '../server/sanitize-shell-env.js';

let apiChild: ChildProcess | null = null;
let shuttingDown = false;
let startApiInFlight: Promise<number> | null = null;
let lastBoot: { projectRoot: string; isDev: boolean } | null = null;
let onApiRestarted: ((port: number) => void) | null = null;
let onApiChildExited: ((payload: { code: number | null; signal: string | null }) => void) | null = null;

export function setApiChildExitedListener(
  listener: ((payload: { code: number | null; signal: string | null }) => void) | null
): void {
  onApiChildExited = listener;
}
export function setApiRestartListener(listener: ((port: number) => void) | null): void {
  onApiRestarted = listener;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApiHealth(port: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; service?: string };
      if (data?.ok && data.service === 'ai-dev-control-center') return;
      if (data?.ok && data.service !== 'ai-dev-control-center') {
        throw new Error(
          `端口 ${port} 已被其它服务占用（health.service=${String(data.service)}）。` +
            ' cc-web cjet dev 会读取 process.env.PORT。请用 .env 的 API_PORT（勿设 PORT），并重启 yarn dev。'
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('已被其它服务占用')) throw err;
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`API 在 ${timeoutMs}ms 内未就绪（端口 ${port}）`);
}

function pipeChildLogs(child: ChildProcess, label: string): void {
  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trimEnd();
    if (text) console.log(`[${label}] ${text}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trimEnd();
    if (text) console.error(`[${label}] ${text}`);
  });
}

/**
 * 以子进程启动 API（与 Electron 主进程隔离，避免 better-sqlite3 等原生模块导致主进程 SIGKILL/崩溃）。
 */
export type StartManagedApiOptions = {
  /** 子进程异常退出后的热重启：不 releaseApiPort，避免误杀新进程 */
  softRestart?: boolean;
};

export async function startManagedApiServer(
  projectRoot: string,
  isDev: boolean,
  options?: StartManagedApiOptions
): Promise<number> {
  if (startApiInFlight) return startApiInFlight;
  startApiInFlight = startManagedApiServerInner(projectRoot, isDev, options).finally(() => {
    startApiInFlight = null;
  });
  return startApiInFlight;
}

async function startManagedApiServerInner(
  projectRoot: string,
  isDev: boolean,
  options?: StartManagedApiOptions
): Promise<number> {
  const port = config.server.port;
  const softRestart = options?.softRestart === true;
  lastBoot = { projectRoot, isDev };
  console.log(`[api-server] starting (softRestart=${softRestart})`);
  await stopManagedApiServer(port, { skipSigKill: softRestart, stopBroker: !softRestart });
  if (!softRestart) {
    await releaseApiPort(port);
  }
  shuttingDown = false;

  let brokerPort = config.server.terminalBrokerPort;
  if (!softRestart || !isTerminalBrokerRunning()) {
    brokerPort = await startTerminalBroker(projectRoot, isDev);
  }
  const brokerUrl = getTerminalBrokerUrl(brokerPort);

  const subprocessNode = resolveSubprocessNode(isDev);
  const env = buildSubprocessEnv(
    sanitizeShellEnv(process.env),
    {
      PORT: String(port),
      API_PORT: String(port),
      API_STRICT_PORT: '1',
      TERMINAL_BROKER_URL: brokerUrl,
      NODE_ENV: isDev ? 'development' : 'production',
    },
    subprocessNode
  );

  const distEntry = path.join(projectRoot, 'dist', 'server', 'api.js');
  const useCompiledInDev = isDev && existsSync(distEntry);

  if (useCompiledInDev || !isDev) {
    const entry = useCompiledInDev ? distEntry : path.join(projectRoot, 'dist', 'server', 'api.js');
    apiChild = spawn(subprocessNode.executable, [entry], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(
      `[api-server] spawn ${entry} via ${subprocessNode.useElectronAsNode ? 'Electron-as-Node' : 'node'} (${subprocessNode.executable})`
    );
  } else {
    const tsxBin = path.join(
      projectRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
    );
    const entry = path.join(projectRoot, 'server', 'api.ts');
    apiChild = spawn(tsxBin, [entry], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(`[api-server] spawn tsx ${entry}`);
  }

  const child = apiChild;
  if (!child) throw new Error('API 子进程启动失败');
  registerProtectedProcess(child.pid ?? undefined);
  child.on('error', (err) => {
    console.error('[api-server] spawn error:', err);
  });
  child.on('exit', (code, signal) => {
    unregisterProtectedProcess(child.pid ?? undefined);
    if (apiChild === child) apiChild = null;
    const sig = signal ?? '';
    console.error(
      `[api-server] exited code=${code ?? 'null'} signal=${sig || 'none'} shuttingDown=${shuttingDown}`
    );
    onApiChildExited?.({ code, signal: signal ?? null });
    if (shuttingDown) return;
    if (code === 137 || sig === 'SIGKILL') {
      console.error(
        '[api-server] 被 SIGKILL 终止。常见原因：.env 里误用 PORT=（cc-web cjet dev 会抢同一端口）。',
        '请改为 API_PORT=41738 并删除 PORT，Cmd+Q 后重新 yarn dev。'
      );
      return;
    }
    console.error(
      '[api-server] 已停止自动重启。请查看上方 exited 原因，Cmd+Q 退出后重新 yarn dev，再点「开始工作」。'
    );
  });
  pipeChildLogs(child, 'api-server');

  await waitForApiHealth(port);
  console.log(`API subprocess ready on port ${port}`);
  return port;
}

export async function stopManagedApiServer(
  port: number = config.server.port,
  options?: { skipSigKill?: boolean; stopBroker?: boolean }
): Promise<void> {
  shuttingDown = true;
  const child = apiChild;
  apiChild = null;
  if (child) {
    const pid = child.pid;
    if (!child.killed) {
      console.log(`[api-server] stopManagedApiServer: SIGTERM pid=${pid ?? '?'}`);
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      await sleep(600);
      if (!options?.skipSigKill && !child.killed) {
        console.log(`[api-server] stopManagedApiServer: SIGKILL pid=${pid ?? '?'}`);
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }
    unregisterProtectedProcess(pid ?? undefined);
  }
  if (options?.stopBroker !== false) {
    await stopTerminalBroker(config.server.terminalBrokerPort, { soft: options?.skipSigKill });
  }
}
