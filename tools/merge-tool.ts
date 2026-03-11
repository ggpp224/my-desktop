/* AI 生成 By Peng.Guo */
import { execSync, spawn } from 'child_process';
import { getProjectByCode } from '../config/projects.js';

/** 按行缓冲并回调，用于流式输出 */
function flushLines(buffer: { out: string }, chunk: string, add: (line: string) => void) {
  buffer.out += chunk;
  const lines = buffer.out.split(/\r?\n/);
  buffer.out = lines.pop() ?? '';
  lines.forEach((line) => {
    const t = line.trim();
    if (t) add(t);
  });
}

function run(cmd: string, cwd: string): { stdout: string; stderr: string; code: number } {
  try {
    const r = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout: (r as string).trim(), stderr: '', code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout as string)?.trim() ?? '',
      stderr: (e.stderr as string)?.trim() ?? '',
      code: e.status ?? 1,
    };
  }
}

/** 流式执行命令，每行 stdout/stderr 实时回调 add，返回退出码 */
function runStream(command: string, cwd: string, add: (msg: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, [], { cwd, shell: true });
    const bufOut = { out: '' };
    const bufErr = { out: '' };
    child.stdout?.on('data', (chunk: Buffer) => flushLines(bufOut, chunk.toString(), add));
    child.stderr?.on('data', (chunk: Buffer) => flushLines(bufErr, chunk.toString(), add));
    child.on('close', (code, signal) => {
      if (bufOut.out.trim()) add(bufOut.out.trim());
      if (bufErr.out.trim()) add(bufErr.out.trim());
      resolve(code ?? (signal ? 1 : 0));
    });
    child.on('error', () => resolve(1));
  });
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MergeResult {
  success: boolean;
  steps: string[];
  error?: string;
}

export interface MergeOptions {
  onStep?: (msg: string) => void;
}

export interface MergeConfig {
  projectPath: string;
  targetBranch: string;
  runRelease: boolean;
}

/**
 * 通用合并流程：记当前分支 → 切目标分支 → 拉取最新 → 合并原分支 → 冲突则中止 → 无冲突则 push →（可选）pnpm run release + 延时 30 秒 → 切回原分支
 */
async function mergeMerge(
  config: MergeConfig,
  options?: MergeOptions
): Promise<MergeResult> {
  const { projectPath: cwd, targetBranch, runRelease } = config;
  const steps: string[] = [];
  const onStep = options?.onStep;

  const add = (msg: string) => {
    steps.push(msg);
    onStep?.(msg);
  };

  const addOutput = (stdout: string, stderr: string) => {
    if (stdout) {
      stdout.split(/\r?\n/).forEach((line) => {
        const t = line.trim();
        if (t) add(`[输出] ${t}`);
      });
    }
    if (stderr) {
      stderr.split(/\r?\n/).forEach((line) => {
        const t = line.trim();
        if (t) add(`[stderr] ${t}`);
      });
    }
  };

  const branchOut = run('git branch --show-current', cwd);
  if (branchOut.code !== 0) {
    add('获取当前分支失败');
    addOutput(branchOut.stdout, branchOut.stderr);
    return { success: false, steps, error: branchOut.stderr || '无法获取当前分支' };
  }
  const currentBranch = branchOut.stdout || 'unknown';
  add(`当前分支: ${currentBranch}`);
  addOutput(branchOut.stdout, branchOut.stderr);

  const coTarget = run(`git checkout ${targetBranch}`, cwd);
  if (coTarget.code !== 0) {
    add(`切换到 ${targetBranch} 分支失败`);
    addOutput(coTarget.stdout, coTarget.stderr);
    return { success: false, steps, error: coTarget.stderr || `git checkout ${targetBranch} 失败` };
  }
  add(`已切换到 ${targetBranch} 分支`);
  addOutput(coTarget.stdout, coTarget.stderr);

  const pull = run('git pull', cwd);
  if (pull.code !== 0) {
    add(`拉取 ${targetBranch} 最新代码失败，请检查网络或权限`);
    addOutput(pull.stdout, pull.stderr);
    run(`git checkout ${currentBranch}`, cwd);
    add(`已切回分支: ${currentBranch}`);
    return { success: false, steps, error: pull.stderr || 'git pull 失败' };
  }
  add(`已更新 ${targetBranch} 最新代码`);
  addOutput(pull.stdout, pull.stderr);

  const merge = run(`git merge ${currentBranch}`, cwd);
  if (merge.code !== 0) {
    add('合并时发生冲突，已取消合并');
    addOutput(merge.stdout, merge.stderr);
    run(`git merge --abort`, cwd);
    run(`git checkout ${currentBranch}`, cwd);
    add(`已切回分支: ${currentBranch}`);
    return { success: false, steps, error: '代码有冲突，需手工合并' };
  }
  add(`已将 ${currentBranch} 合并到 ${targetBranch}`);
  addOutput(merge.stdout, merge.stderr);

  add(`正在 push ${targetBranch} 分支…`);
  const pushResult = run('git push', cwd);
  if (pushResult.stdout) {
    pushResult.stdout.split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (t) add(t);
    });
  }
  if (pushResult.stderr) {
    pushResult.stderr.split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (t) add(`[stderr] ${t}`);
    });
  }
  if (pushResult.code !== 0) {
    add('git push 失败');
    run(`git checkout ${currentBranch}`, cwd);
    add(`已切回分支: ${currentBranch}`);
    return { success: false, steps, error: pushResult.stderr || 'git push 失败' };
  }
  add('git push 完成');

  if (runRelease) {
    add('正在执行 pnpm run release…');
    const releaseCode = await runStream('pnpm run release', cwd, add);
    if (releaseCode !== 0) {
      add('pnpm run release 执行失败');
      run(`git checkout ${currentBranch}`, cwd);
      add(`已切回分支: ${currentBranch}`);
      return { success: false, steps, error: `release 退出码: ${releaseCode}` };
    }
    add('pnpm run release 执行完毕');
    add('等待 30 秒后切回原分支…');
    await delayMs(30 * 1000);
    add('开始切回原分支');
  }

  const coBack = run(`git checkout ${currentBranch}`, cwd);
  if (coBack.code !== 0) {
    add(`切回 ${currentBranch} 失败`);
    addOutput(coBack.stdout, coBack.stderr);
    return { success: false, steps, error: coBack.stderr || '切回原分支失败' };
  }
  add(`已切回分支: ${currentBranch}`);
  addOutput(coBack.stdout, coBack.stderr);

  return { success: true, steps };
}

/**
 * 按项目代号执行合并，配置来自 config/projects（需有 merge 配置）。
 */
export async function mergeByCode(code: string, options?: MergeOptions): Promise<MergeResult> {
  const entry = getProjectByCode(code);
  if (!entry) {
    return { success: false, steps: [], error: `未找到项目代号: ${code}` };
  }
  if (!entry.merge) {
    return { success: false, steps: [], error: `项目 ${entry.codes[0]} 未配置 merge` };
  }
  return mergeMerge(
    {
      projectPath: entry.path,
      targetBranch: entry.merge.targetBranch,
      runRelease: entry.merge.runRelease,
    },
    options
  );
}

export async function mergeNova(options?: MergeOptions): Promise<MergeResult> {
  return mergeByCode('nova', options);
}

export async function mergeBizSolution(options?: MergeOptions): Promise<MergeResult> {
  return mergeByCode('biz-solution', options);
}

export async function mergeScm(options?: MergeOptions): Promise<MergeResult> {
  return mergeByCode('scm', options);
}
