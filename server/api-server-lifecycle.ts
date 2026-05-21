/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';
import { releaseApiPort } from './port-utils.js';
import { startServer, stopServer } from './api.js';

/**
 * 同进程重启 API（仅用于 `tsx server/api.ts` / dev:server 独立调试，Electron 请用 desktop/api-server-manager）。
 */
export async function restartApiServerForApp(): Promise<number> {
  const port = config.server.port;
  await stopServer();
  await releaseApiPort(port);
  return startServer({ allowPortFallback: false, preferredPort: port });
}
