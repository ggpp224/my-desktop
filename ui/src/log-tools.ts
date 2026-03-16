/* AI 生成 By Peng.Guo */
type ShellLikeResult = {
  step?: number;
  tool?: string;
  cmd?: string;
  stdout?: string;
  stderr?: string;
  code?: number | null;
  visible?: boolean;
  error?: string;
};

type ToolResultEntry = {
  tool?: string;
  error?: string;
  result?: {
    success?: boolean;
    error?: string;
    stdout?: string;
    stderr?: string;
    code?: number | null;
    cmd?: string;
    results?: ShellLikeResult[];
  };
};

function appendLines(addLog: (line: string) => void, prefix: string, text?: string) {
  const value = (text ?? '').trim();
  if (!value) return;
  value.split(/\r?\n/).forEach((line) => {
    if (line.trim()) addLog(`${prefix}${line}`);
  });
}

function logShellResult(addLog: (line: string) => void, prefix: string, item: ShellLikeResult) {
  if (item.cmd) addLog(`${prefix}命令: ${item.cmd}`);
  if (item.visible) addLog(`${prefix}已在系统终端执行`);
  if (item.code != null) addLog(`${prefix}退出码: ${item.code}`);
  appendLines(addLog, `${prefix}stdout: `, item.stdout);
  appendLines(addLog, `${prefix}stderr: `, item.stderr);
  if (item.error) addLog(`${prefix}错误: ${item.error}`);
}

/** 将 Agent/tool 的 shell 输出展开到 Logs 面板，便于查看每步执行详情 */
export function appendToolResultsToLogs(toolResults: unknown[] | undefined, addLog: (line: string) => void) {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return;
  toolResults.forEach((entry, toolIndex) => {
    const item = entry as ToolResultEntry;
    const toolName = item.tool ?? `tool-${toolIndex}`;
    const prefix = `[${toolName}] `;
    if (item.error) addLog(`${prefix}错误: ${item.error}`);
    if (!item.result) return;
    if (Array.isArray(item.result.results)) {
      item.result.results.forEach((stepResult, stepIndex) => {
        const stepPrefix = `${prefix}[step ${stepResult.step ?? stepIndex}] `;
        logShellResult(addLog, stepPrefix, stepResult);
      });
      if (item.result.error) addLog(`${prefix}错误: ${item.result.error}`);
      return;
    }
    logShellResult(addLog, prefix, item.result);
    if (item.result.success != null) addLog(`${prefix}${item.result.success ? '执行成功' : '执行失败'}`);
    if (item.result.error) addLog(`${prefix}错误: ${item.result.error}`);
  });
}
