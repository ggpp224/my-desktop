/* AI 生成 By Peng.Guo */

import { shell } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';

/**
 * 在系统默认浏览器之外，优先使用 Google Chrome 打开 URL（macOS / Windows / Linux 尽力而为，失败则回退 shell.openExternal）。
 */
export function openExternalUrlPreferChrome(url: string): void {
  const fallback = (): void => {
    void shell.openExternal(url);
  };

  if (process.platform === 'darwin') {
    execFile('open', ['-a', 'Google Chrome', url], (err) => {
      if (err) fallback();
    });
    return;
  }

  if (process.platform === 'win32') {
    const dirs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA];
    const candidates = dirs
      .filter(Boolean)
      .map((d) => `${d}\\Google\\Chrome\\Application\\chrome.exe`)
      .filter((p) => fs.existsSync(p));
    const chromePath = candidates[0];
    if (chromePath) {
      execFile(chromePath, [url], { windowsHide: true }, (err) => {
        if (err) fallback();
      });
      return;
    }
    fallback();
    return;
  }

  execFile('google-chrome', [url], (err) => {
    if (err) {
      execFile('chromium', [url], (e2) => {
        if (e2) execFile('chromium-browser', [url], (e3) => {
          if (e3) fallback();
        });
      });
    }
  });
}
