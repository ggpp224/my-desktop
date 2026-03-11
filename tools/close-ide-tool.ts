/* AI 生成 By Peng.Guo */
/**
 * 关闭指定 IDE 中已打开的某项目窗口。
 * 支持：关闭ws的nova、关闭cursor的base，项目代号与 config/projects 一致。
 */
import { execFile } from 'child_process';
import { platform } from 'os';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getProjectPath } from '../config/projects.js';

/** 与 open-ide-tool 一致：应用别名 -> macOS 应用名 */
const APP_ALIASES: Record<string, string> = {
  ws: 'WebStorm',
  webstorm: 'WebStorm',
  cursor: 'Cursor',
  vscode: 'Visual Studio Code',
  code: 'Visual Studio Code',
};

export type CloseIdeResult = { success: boolean; message: string; app?: string; path?: string; code?: string };

/**
 * 用 AppleScript 关闭指定应用中「窗口标题包含项目目录名」的窗口。
 * - WebStorm/ JetBrains：无 Cmd+W 关项目，需点菜单 File → Close Project（官方文档）。
 * - Cursor/VS Code：用 Cmd+W 关闭当前窗口。
 * 脚本写临时文件，通过 argv 传入 app 名与目录名。
 */
function runCloseWindowAppleScript(appName: string, folderName: string): Promise<{ ok: boolean; error?: string }> {
  const scriptBody = `on run argv
  set appName to item 1 of argv
  set folderName to item 2 of argv
  set useMenuClose to false
  if appName contains "WebStorm" or appName contains "IntelliJ" or appName contains "Storm" or appName contains "PyCharm" or appName contains "RubyMine" or appName contains "GoLand" or appName contains "CLion" then
    set useMenuClose to true
  end if
  try
    tell application appName to activate
    delay 0.4
    tell application "System Events"
      tell process appName
        set winList to every window
        set matchIndex to 0
        repeat with i from 1 to count of winList
          set w to item i of winList
          try
            set winTitle to value of attribute "AXTitle" of w
            if winTitle contains folderName then
              set matchIndex to i
              exit repeat
            end if
          end try
        end repeat
        if matchIndex > 0 then
          try
            perform action "AXRaise" of window matchIndex
          end try
          delay 0.6
          if useMenuClose then
            try
              click menu item "Close Project" of menu "File" of menu bar 1
            on error
              try
                click menu item "关闭项目" of menu "文件" of menu bar 1
              end try
            end try
          else
            keystroke "w" using command down
          end if
          return true
        else
          return "ERROR: 未找到标题包含 " & folderName & " 的窗口"
        end if
      end tell
    end tell
  on error errMsg
    return "ERROR: " & errMsg
  end try
end run
`;

  const tmpDir = mkdtempSync(join(tmpdir(), 'close-ide-'));
  const scriptPath = join(tmpDir, 'close_window.applescript');

  return new Promise((resolve) => {
    try {
      writeFileSync(scriptPath, scriptBody, 'utf8');
    } catch (e) {
      resolve({ ok: false, error: (e as Error).message });
      return;
    }
    execFile('osascript', [scriptPath, appName, folderName], (err, stdout) => {
      try {
        unlinkSync(scriptPath);
      } catch {
        // ignore
      }
      const out = (stdout ?? '').trim();
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }
      if (out.startsWith('ERROR:')) {
        resolve({ ok: false, error: out });
        return;
      }
      resolve({ ok: true });
    });
  });
}

/**
 * 关闭指定应用中已打开的某项目窗口。
 * @param appKey 应用别名：ws / webstorm、cursor、vscode / code
 * @param code 项目代号（与 config/projects 一致）
 */
export function closeIdeProject(appKey: string, code: string): Promise<CloseIdeResult> {
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
    return Promise.resolve({
      success: false,
      message: '缺少应用名（支持: ws/webstorm、cursor、vscode/code）',
      app: appKey,
      code: codeTrim,
    });
  }

  const plat = platform();
  if (plat !== 'darwin') {
    return Promise.resolve({
      success: false,
      message: `当前仅支持 macOS 关闭 IDE 项目窗口，当前系统: ${plat}`,
      app: appName,
      path,
      code: codeTrim,
    });
  }

  const folderName = path.split('/').filter(Boolean).pop() ?? path;
  return runCloseWindowAppleScript(appName, folderName).then(({ ok, error }) => ({
    success: ok,
    message: ok ? `已关闭 ${appName} 中的项目 ${codeTrim}` : (error ?? '关闭失败'),
    app: appName,
    path,
    code: codeTrim,
  }));
}
