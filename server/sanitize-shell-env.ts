/* AI 生成 By Peng.Guo */

const KEYS_TO_STRIP = [
  'PORT',
  'API_PORT',
  'API_STRICT_PORT',
  'TERMINAL_BROKER_URL',
  'TERMINAL_BROKER_PORT',
  'WDS_SOCKET_PORT',
  'WDS_SOCKET_HOST',
] as const;

/**
 * cc-web `cjet dev` 与 webpack-dev-server 会读 `process.env.PORT`。
 * 内嵌 PTY / shell 子进程不得继承本应用 API 端口，否则与 Express 抢端口导致 API 被 SIGKILL。
 */
export function sanitizeShellEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env = { ...source } as Record<string, string>;
  for (const key of KEYS_TO_STRIP) {
    delete env[key];
  }
  return env;
}

/** Electron 主进程加载 config 后调用，避免 PORT 泄漏到 Terminal Broker / 后续 spawn */
export function stripApiPortFromProcessEnv(): void {
  for (const key of KEYS_TO_STRIP) {
    delete process.env[key];
  }
}
