/* AI 生成 By Peng.Guo */
import { readFile } from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { run as shellRun, runInTerminal } from './shell-tool.js';
import { open as browserOpen } from './browser-tool.js';
import { deploy as jenkinsDeploy } from './jenkins-tool.js';

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

export type Step =
  | { tool: 'shell'; cmd: string; visible?: boolean }
  | { tool: 'browser'; url: string }
  | { tool: 'jenkins'; jobName: string };

export type WorkflowDef = { steps: Step[] };

export async function runWorkflow(name: string): Promise<{ success: boolean; results: unknown[]; error?: string }> {
  const filePath = path.join(getWorkflowsDir(), `${name.replace(/\.json$/i, '')}.json`);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    return { success: false, results: [], error: `工作流文件不存在: ${name}` };
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
        if (step.visible) {
          await runInTerminal(step.cmd);
          results.push({ step: i, tool: 'shell', visible: true, cmd: step.cmd });
        } else {
          const out = await shellRun(step.cmd);
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
