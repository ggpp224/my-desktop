/* AI 生成 By Peng.Guo */
import { exec, spawn } from 'child_process';
import { platform } from 'os';
import { config } from '../config/default.js';

const DANGEROUS_PATTERNS = [/rm\s+-rf\s+\//, /sudo\s+rm/, /:\(\)\s*\{\s*:\s*\|:\s*\}/]; // 高危命令示例

function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some((re) => re.test(command));
}

/**
 * 在系统终端（Terminal.app）中执行命令（会打开终端窗口或新页签，不是打开网页）：
 * - 若当前没有打开的 Terminal 窗口，则新建一个窗口并执行命令；
 * - 若已有 Terminal 窗口，则先激活终端，再模拟 Command+T 新建一个页签，然后在新页签中执行命令。
 * macOS 需在 系统设置 → 隐私与安全性 → 自动化 中允许本应用控制 Terminal 与 System Events。
 */
export function runInTerminal(command: string): Promise<void> {
  const plat = platform();
  return new Promise((resolve, reject) => {
    if (plat === 'darwin') {
      const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = [
        'tell application "Terminal" to activate',
        'set windowCount to (count windows) of application "Terminal"',
        'if windowCount is 0 then',
        `  tell application "Terminal" to do script "${escaped}"`,
        'else',
        '  tell application "System Events" to tell process "Terminal" to keystroke "t" using command down',
        '  delay 0.5',
        `  tell application "Terminal" to do script "${escaped}" in front window`,
        'end if',
      ].join('\n');
      const child = spawn('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
      const stderrChunks: Buffer[] = [];
      child.stderr?.on('data', (chunk) => stderrChunks.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve();
        const msg = Buffer.concat(stderrChunks).toString('utf-8').trim() || `osascript exit ${code}`;
        reject(new Error(`打开终端失败: ${msg}. 若在 macOS 上，请到 系统设置 → 隐私与安全性 → 自动化 中允许本应用控制 Terminal。`));
      });
    } else if (plat === 'win32') {
      exec(`start cmd /k "${command.replace(/"/g, '\\"')}"`, (err) => (err ? reject(err) : resolve()));
    } else {
      exec(`xterm -e "${command.replace(/"/g, '\\"')}"`, (err) => (err ? reject(err) : resolve()));
    }
  });
}

export function run(command: string, options?: { requireConfirmation?: boolean }): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const cwd = config.shell.allowedCwd;
  if (options?.requireConfirmation && isDangerous(command)) {
    return Promise.reject(new Error('该命令被判定为高危，需要用户确认后再执行。'));
  }
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.code !== undefined) {
        resolve({ stdout, stderr, code: err.code });
        return;
      }
      if (err) {
        reject(err);
        return;
      }
      resolve({ stdout, stderr, code: 0 });
    });
  });
}
