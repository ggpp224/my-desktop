/* AI 生成 By Peng.Guo */
import { exec } from 'child_process';
import { platform } from 'os';

export function open(url: string): Promise<void> {
  const isMac = platform() === 'darwin';
  const isWin = platform() === 'win32';
  const cmd = isMac ? `open "${url}"` : isWin ? `start "${url}"` : `xdg-open "${url}"`;
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
