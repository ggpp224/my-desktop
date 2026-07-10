/* AI 生成 By Peng.Guo */
import { existsSync, statSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { config } from '../config/default.js';
import { runInTerminal } from './shell-tool.js';

const require = createRequire(import.meta.url);

function getDesktopRoot(): string {
  if (typeof process !== 'undefined' && process.versions?.electron) {
    try {
      const { app } = require('electron');
      return app.getAppPath();
    } catch {
      return process.cwd();
    }
  }
  return process.cwd();
}

function resolveMacostunmodeDir(): string {
  const configured = config.macostunmode.dir.trim();
  if (configured) return configured;
  return path.join(getDesktopRoot(), 'macostunmode');
}

function shellEscapeSingleQuoted(value: string): string {
  return value.replace(/'/g, "'\\''");
}

export function buildMacostunmodeStartCommand(dir: string, sudoPassword: string): string {
  const escapedDir = dir.replace(/"/g, '\\"');
  const runScript = 'exec sudo env MACOSTUNMODE_AUTO_GATEKEEPER=1 ./macostunmode.sh';
  if (sudoPassword.length > 0) {
    const escapedPwd = shellEscapeSingleQuoted(sudoPassword);
    // 密码只喂给 sudo -v；勿 pipe 到脚本本身，否则 read 会读到空输入并死循环
    return `cd "${escapedDir}" && { printf '%s\\n' '${escapedPwd}' | sudo -S -v; } && ${runScript}`;
  }
  return `cd "${escapedDir}" && ${runScript}`;
}

function buildStartCommand(dir: string): string {
  return buildMacostunmodeStartCommand(dir, config.macostunmode.sudoPassword);
}

/** 在系统终端中启动 macostunmode（sing-box TUN 管理脚本） */
export async function startMacostunmode(): Promise<{
  success: boolean;
  cmd?: string;
  dir?: string;
  error?: string;
}> {
  const dir = resolveMacostunmodeDir();
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { success: false, error: `macostunmode 目录不存在: ${dir}` };
  }
  const script = path.join(dir, 'macostunmode.sh');
  if (!existsSync(script)) {
    return { success: false, error: `未找到脚本: ${script}` };
  }
  const cmd = buildStartCommand(dir);
  try {
    await runInTerminal(cmd);
    return { success: true, cmd, dir };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
