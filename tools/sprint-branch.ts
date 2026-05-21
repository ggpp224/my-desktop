/* AI 生成 By Peng.Guo */
/**
 * 与 workflows/upgrade-react18-nova.json 一致：从 git 远程分支解析最大 sprint 编号。
 * 匹配 origin/sprint-<数字>，取数字最大值，返回 sprint-<num>。
 */

export function parseMaxSprintNumFromRemoteBranchLines(lines: string): string | null {
  const nums: number[] = [];
  for (const line of lines.split(/\r?\n/)) {
    const m = line.trim().match(/^origin\/sprint-(\d+)$/);
    if (m) nums.push(parseInt(m[1], 10));
  }
  if (nums.length === 0) return null;
  return String(Math.max(...nums));
}

export interface ResolveMaxSprintBranchResult {
  sprintNum: string;
  branch: string;
}

export interface ResolveMaxSprintBranchOptions {
  /** 解析前是否 git fetch，默认 true */
  fetch?: boolean;
  onStep?: (msg: string) => void;
  runGit: (cmd: string, cwd: string) => { stdout: string; stderr: string; code: number };
}

/**
 * 在指定仓库目录解析最大 sprint 分支名（如 sprint-260423）。
 */
export function resolveMaxSprintBranch(
  projectPath: string,
  options: ResolveMaxSprintBranchOptions
): { ok: true; result: ResolveMaxSprintBranchResult } | { ok: false; error: string } {
  const add = options.onStep ?? (() => {});
  const { runGit } = options;

  if (options.fetch !== false) {
    add(`正在 fetch 远程分支: ${projectPath}`);
    const fetchOut = runGit('git fetch', projectPath);
    if (fetchOut.code !== 0) {
      return { ok: false, error: fetchOut.stderr || 'git fetch 失败' };
    }
  }

  const branches = runGit('git branch -r', projectPath);
  if (branches.code !== 0) {
    return { ok: false, error: branches.stderr || 'git branch -r 失败' };
  }

  const sprintNum = parseMaxSprintNumFromRemoteBranchLines(branches.stdout);
  if (!sprintNum) {
    return { ok: false, error: '未找到远程 sprint 分支' };
  }

  const branch = `sprint-${sprintNum}`;
  add(`解析到最大 sprint 分支: ${branch}`);
  return { ok: true, result: { sprintNum, branch } };
}
