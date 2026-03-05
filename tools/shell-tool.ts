/* AI 生成 By Peng.Guo */
import { exec } from 'child_process';
import { config } from '../config/default.js';

const DANGEROUS_PATTERNS = [/rm\s+-rf\s+\//, /sudo\s+rm/, /:\(\)\s*\{\s*:\s*\|:\s*\}/]; // 高危命令示例

function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some((re) => re.test(command));
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
