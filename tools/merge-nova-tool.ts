/* AI 生成 By Peng.Guo */
import { execSync, spawn } from 'child_process';

const NOVA_PROJECT_PATH = '/Users/guopeng/disk/cc-web/packages/nova-next';

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

/** 流式执行命令，每行 stdout/stderr 实时回调 add，返回退出码 */
function runStream(
  command: string,
  cwd: string,
  add: (msg: string) => void
): Promise<number> {
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

function run(cmd: string, cwd: string = NOVA_PROJECT_PATH): { stdout: string; stderr: string; code: number } {
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

export interface MergeNovaResult {
  success: boolean;
  steps: string[];
  error?: string;
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MergeNovaOptions {
  /** 每执行一步时实时回调，用于前端流式展示 */
  onStep?: (msg: string) => void;
}

/**
 * 合并 nova 流程：记当前分支 → 切 test → 拉取最新 → 合并原分支 → 有冲突则中止并提示 → 无冲突则 push → pnpm run release → 延时 30 秒 → 切回原分支
 */
export async function mergeNova(options?: MergeNovaOptions): Promise<MergeNovaResult> {
  const steps: string[] = [];
  const cwd = NOVA_PROJECT_PATH;
  const onStep = options?.onStep;

  const add = (msg: string) => {
    steps.push(msg);
    onStep?.(msg);
  };

  // 1. 记住当前分支
  const branchOut = run('git branch --show-current', cwd);
  if (branchOut.code !== 0) {
    add('获取当前分支失败');
    return { success: false, steps, error: branchOut.stderr || '无法获取当前分支' };
  }
  const currentBranch = branchOut.stdout || 'unknown';
  add(`当前分支: ${currentBranch}`);

  // 2. 切到 test
  const coTest = run('git checkout test', cwd);
  if (coTest.code !== 0) {
    add('切换到 test 分支失败');
    return { success: false, steps, error: coTest.stderr || 'git checkout test 失败' };
  }
  add('已切换到 test 分支');

  // 3. 更新 test 最新代码
  const pull = run('git pull', cwd);
  if (pull.code !== 0) {
    add('拉取 test 最新代码失败，请检查网络或权限');
    run(`git checkout ${currentBranch}`, cwd);
    add(`已切回分支: ${currentBranch}`);
    return { success: false, steps, error: pull.stderr || 'git pull 失败' };
  }
  add('已更新 test 最新代码');

  // 4. 将切换前的分支合并到 test
  const merge = run(`git merge ${currentBranch}`, cwd);
  if (merge.code !== 0) {
    add('合并时发生冲突，已取消合并');
    run('git merge --abort', cwd);
    run(`git checkout ${currentBranch}`, cwd);
    add(`已切回分支: ${currentBranch}`);
    return {
      success: false,
      steps,
      error: '代码有冲突，需手工合并',
    };
  }
  add(`已将 ${currentBranch} 合并到 test`);

  // 5. 无冲突，先 push test 分支
  add('正在 push test 分支…');
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
      if (t) add(t);
    });
  }
  if (pushResult.code !== 0) {
    add('git push 失败');
    run(`git checkout ${currentBranch}`, cwd);
    add(`已切回分支: ${currentBranch}`);
    return {
      success: false,
      steps,
      error: pushResult.stderr || 'git push 失败',
    };
  }
  add('git push 完成');

  // 6. 在项目根目录流式执行 pnpm run release，每行输出实时回调
  add('正在执行 pnpm run release…');
  const releaseCode = await runStream('pnpm run release', cwd, add);
  if (releaseCode !== 0) {
    add('pnpm run release 执行失败');
    run(`git checkout ${currentBranch}`, cwd);
    add(`已切回分支: ${currentBranch}`);
    return {
      success: false,
      steps,
      error: `release 退出码: ${releaseCode}`,
    };
  }
  add('pnpm run release 执行完毕');

  // 7. 延时 30 秒后再切回原分支
  add('等待 30 秒后切回原分支…');
  await delayMs(30 * 1000);
  add('开始切回原分支');

  // 8. 切回之前分支
  const coBack = run(`git checkout ${currentBranch}`, cwd);
  if (coBack.code !== 0) {
    add(`切回 ${currentBranch} 失败`);
    return { success: false, steps, error: coBack.stderr || '切回原分支失败' };
  }
  add(`已切回分支: ${currentBranch}`);

  return { success: true, steps };
}
