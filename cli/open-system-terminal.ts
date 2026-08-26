/* AI 生成 By Peng.Guo */
/**
 * 在 macOS Terminal.app 执行命令：
 * - 没有窗口 → 新窗口（do script）
 * - 已有窗口 → Command+T 新页签，再把命令粘贴进该页签并回车
 */
import { execFileSync } from 'node:child_process';

function escapeOsa(command: string): string {
  return command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runAppleScript(source: string): string {
  return execFileSync('osascript', ['-e', source], { encoding: 'utf8' }).trim();
}

function main(): void {
  const command = process.argv.slice(2).join(' ').trim();
  if (!command) {
    process.stderr.write('用法: tsx cli/open-system-terminal.ts "<shell 命令>"\n');
    process.exit(1);
  }
  if (process.platform !== 'darwin') {
    process.stderr.write('仅支持 macOS Terminal.app\n');
    process.exit(1);
  }

  const escaped = escapeOsa(command);
  const source = `
tell application "Terminal"
  activate
  delay 0.3
  set windowCount to (count of windows)
  if windowCount is 0 then
    do script "${escaped}"
    return "new-window"
  end if
  set tabCountBefore to (count of tabs of front window)
end tell

tell application "System Events" to tell process "Terminal"
  set frontmost to true
  keystroke "t" using command down
end tell
delay 1.0

tell application "Terminal"
  set tabCountAfter to (count of tabs of front window)
end tell

set the clipboard to "${escaped}"
tell application "System Events" to tell process "Terminal"
  keystroke "v" using command down
  delay 0.25
  keystroke return
end tell

if tabCountAfter is less than or equal to tabCountBefore then
  return "current-tab"
end if
return "new-tab"
`;

  try {
    const result = runAppleScript(source);
    process.stdout.write(`${result}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(2);
  }
}

main();
