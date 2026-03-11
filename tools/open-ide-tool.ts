/* AI 生成 By Peng.Guo */
/**
 * 使用指定 IDE/编辑器（如 WebStorm、Cursor）打开项目目录。
 * 项目代号与路径来自 config/projects，支持：ws打开base、cursor打开scm 等指令。
 */
import { exec } from 'child_process';
import { platform } from 'os';
import { getProjectPath } from '../config/projects.js';

/** 支持的 App 别名 -> macOS 应用名（open -a 用） */
const APP_ALIASES: Record<string, string> = {
  ws: 'WebStorm',
  webstorm: 'WebStorm',
  cursor: 'Cursor',
  vscode: 'Visual Studio Code',
  code: 'Visual Studio Code',
};

export type OpenInIdeResult = { success: boolean; message: string; app?: string; path?: string; code?: string };

/**
 * 用指定应用打开项目目录。
 * @param app 应用别名：ws / webstorm、cursor、vscode / code
 * @param code 项目代号（如 base、nova、scm），与 config/projects 一致
 */
export function openInIde(appKey: string, code: string): Promise<OpenInIdeResult> {
  const codeTrim = (code ?? '').trim();
  const appTrim = (appKey ?? '').trim().toLowerCase();
  if (!codeTrim) {
    return Promise.resolve({ success: false, message: '缺少项目代号', code: codeTrim });
  }
  const path = getProjectPath(codeTrim);
  if (!path) {
    return Promise.resolve({ success: false, message: `未找到项目代号: ${codeTrim}`, code: codeTrim });
  }
  const appName = APP_ALIASES[appTrim] ?? appTrim;
  if (!appName) {
    return Promise.resolve({ success: false, message: '缺少应用名（支持: ws/webstorm、cursor、vscode/code）', app: appKey });
  }

  const plat = platform();
  if (plat !== 'darwin') {
    return Promise.resolve({
      success: false,
      message: `当前仅支持 macOS 用应用打开项目，当前系统: ${plat}`,
      app: appName,
      path,
      code: codeTrim,
    });
  }

  return new Promise((resolve) => {
    const safePath = path.replace(/"/g, '\\"');
    const safeApp = appName.replace(/"/g, '\\"');
    const cmd = `open -a "${safeApp}" "${safePath}"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        resolve({
          success: false,
          message: `打开失败: ${err.message}`,
          app: appName,
          path,
          code: codeTrim,
        });
        return;
      }
      if (stderr?.trim()) {
        resolve({
          success: true,
          message: `已用 ${appName} 打开项目 ${codeTrim}`,
          app: appName,
          path,
          code: codeTrim,
        });
        return;
      }
      resolve({
        success: true,
        message: `已用 ${appName} 打开项目 ${codeTrim}`,
        app: appName,
        path,
        code: codeTrim,
      });
    });
  });
}

/** 返回支持的应用别名列表，供 schema 描述用 */
export function getSupportedAppAliases(): string[] {
  return Object.keys(APP_ALIASES);
}
