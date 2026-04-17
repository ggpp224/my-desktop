/* AI 生成 By Peng.Guo */
import { readFile } from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { run as shellRun, runInTerminal } from './shell-tool.js';
import { open as browserOpen } from './browser-tool.js';
import { deploy as jenkinsDeploy } from './jenkins-tool.js';
import { getProjectPath } from '../config/projects.js';

const require = createRequire(import.meta.url);

/** 安装后 .app 内 cwd 不是应用目录，需用 Electron 应用路径 */
function getWorkflowsDir(): string {
  if (typeof process !== 'undefined' && process.versions?.electron) {
    try {
      const { app } = require('electron');
      return path.join(app.getAppPath(), 'workflows');
    } catch {
      return path.join(process.cwd(), 'workflows');
    }
  }
  return path.join(process.cwd(), 'workflows');
}

/** shell 步骤可指定 cwdCode：按项目代号解析工作目录，再执行 cmd */
export type Step =
  | { tool: 'shell'; cmd: string; visible?: boolean; taskKey?: string; cwdCode?: string }
  | { tool: 'browser'; url: string; taskKey?: string }
  | { tool: 'jenkins'; jobName: string; taskKey?: string };

export type WorkflowDef = { steps: Step[] };

/** 若步骤带 cwdCode，则按代号解析路径并拼成 cd path && cmd */
function resolveShellCmd(step: Step & { tool: 'shell'; cmd: string; cwdCode?: string }): string {
  const code = step.cwdCode?.trim();
  if (!code) return step.cmd;
  const dir = getProjectPath(code);
  if (!dir) return step.cmd;
  return `cd ${dir} && ${step.cmd}`;
}

/** 执行工作流中的单步，支持 stepIndex 或 taskKey。用于「启动 cpxy」等指令单独执行某一任务。 */
export async function runWorkflowStep(
  name: string,
  options: { stepIndex?: number; taskKey?: string }
): Promise<{ success: boolean; results: unknown[]; error?: string }> {
  const baseName = name.replace(/\.json$/i, '');
  const workflowsDir = getWorkflowsDir();
  let filePath = path.join(workflowsDir, `${baseName}.json`);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    const altName = baseName.replace(/_/g, '-');
    if (altName !== baseName) {
      filePath = path.join(workflowsDir, `${altName}.json`);
      try {
        raw = await readFile(filePath, 'utf-8');
      } catch {
        return { success: false, results: [], error: `工作流文件不存在: ${name}` };
      }
    } else {
      return { success: false, results: [], error: `工作流文件不存在: ${name}` };
    }
  }
  let def: WorkflowDef;
  try {
    def = JSON.parse(raw) as WorkflowDef;
  } catch {
    return { success: false, results: [], error: '工作流 JSON 格式错误' };
  }
  const steps = def.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return { success: false, results: [], error: '工作流缺少 steps 数组' };
  }
  let index: number;
  if (options.stepIndex != null && options.stepIndex >= 0 && options.stepIndex < steps.length) {
    index = options.stepIndex;
  } else if (options.taskKey != null && options.taskKey !== '') {
    const i = steps.findIndex((s) => (s as Step & { taskKey?: string }).taskKey === options.taskKey);
    if (i < 0) {
      return { success: false, results: [], error: `未找到 taskKey: ${options.taskKey}` };
    }
    index = i;
  } else {
    return { success: false, results: [], error: '请提供 stepIndex 或 taskKey' };
  }
  const step = steps[index];
  const results: unknown[] = [];
  try {
    if (step.tool === 'shell' && 'cmd' in step) {
      const cmd = resolveShellCmd(step);
      if (step.visible) {
        await runInTerminal(cmd);
        results.push({ step: index, tool: 'shell', visible: true, cmd });
      } else {
        const out = await shellRun(cmd);
        results.push({ step: index, tool: 'shell', ...out });
      }
    } else if (step.tool === 'browser' && 'url' in step) {
      await browserOpen(step.url);
      results.push({ step: index, tool: 'browser', url: step.url });
    } else if (step.tool === 'jenkins' && 'jobName' in step) {
      const out = await jenkinsDeploy(step.jobName);
      results.push({ step: index, tool: 'jenkins', ...out });
      if (!out.success) {
        return { success: false, results, error: out.message };
      }
    } else {
      results.push({ step: index, error: '未知步骤类型' });
      return { success: false, results, error: '未知步骤类型' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ step: index, error: message });
    return { success: false, results, error: message };
  }
  return { success: true, results };
}

export async function runWorkflow(name: string): Promise<{ success: boolean; results: unknown[]; error?: string }> {
  const normalized = (name ?? '').trim() || 'start-work';
  const baseName = normalized.replace(/\.json$/i, '');
  const workflowsDir = getWorkflowsDir();
  // 先按原名查找，再尝试将下划线转为连字符（AI 可能输出 start_work，实际文件为 start-work.json）
  let filePath = path.join(workflowsDir, `${baseName}.json`);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    const altName = baseName.replace(/_/g, '-');
    if (altName !== baseName) {
      filePath = path.join(workflowsDir, `${altName}.json`);
      try {
        raw = await readFile(filePath, 'utf-8');
      } catch {
        return { success: false, results: [], error: `工作流文件不存在: ${normalized}` };
      }
    } else {
      return { success: false, results: [], error: `工作流文件不存在: ${normalized}` };
    }
  }
  let def: WorkflowDef;
  try {
    def = JSON.parse(raw) as WorkflowDef;
  } catch {
    return { success: false, results: [], error: '工作流 JSON 格式错误' };
  }
  const steps = def.steps;
  if (!Array.isArray(steps)) {
    return { success: false, results: [], error: '工作流缺少 steps 数组' };
  }
  const results: unknown[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      if (step.tool === 'shell' && 'cmd' in step) {
        const cmd = resolveShellCmd(step);
        if (step.visible) {
          await runInTerminal(cmd);
          results.push({ step: i, tool: 'shell', visible: true, cmd });
        } else {
          const out = await shellRun(cmd);
          results.push({ step: i, tool: 'shell', ...out });
        }
      } else if (step.tool === 'browser' && 'url' in step) {
        await browserOpen(step.url);
        results.push({ step: i, tool: 'browser', url: step.url });
      } else if (step.tool === 'jenkins' && 'jobName' in step) {
        const out = await jenkinsDeploy(step.jobName);
        results.push({ step: i, tool: 'jenkins', ...out });
        if (!out.success) {
          return { success: false, results, error: out.message };
        }
      } else {
        results.push({ step: i, error: '未知步骤类型' });
        return { success: false, results, error: '未知步骤类型' };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ step: i, error: message });
      return { success: false, results, error: message };
    }
  }
  return { success: true, results };
}
