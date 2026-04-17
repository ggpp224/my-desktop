/* AI 生成 By Peng.Guo */
import { readFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { homedir } from 'os';
import { getProjectPath } from '../config/projects.js';
import { open as browserOpen } from './browser-tool.js';
import { deploy as jenkinsDeploy } from './jenkins-tool.js';
import { run as shellRun } from './shell-tool.js';
import { createTerminalSession } from './terminal-session-service.js';

type Step =
  | { tool: 'shell'; cmd: string; visible?: boolean; taskKey?: string; cwdCode?: string }
  | { tool: 'browser'; url: string; taskKey?: string }
  | { tool: 'jenkins'; jobName: string; taskKey?: string };

type WorkflowDef = { steps: Step[] };
type TerminalStatus = 'running' | 'success' | 'error';

export interface EmbeddedTerminalSnapshot {
  id: string;
  title: string;
  taskKey: string;
  stepIndex: number;
  status: TerminalStatus;
  lines: string[];
  terminalSessionId?: string;
}

interface EmbeddedSession {
  id: string;
  workflowName: string;
  terminals: EmbeddedTerminalSnapshot[];
  createdAt: number;
}

const require = createRequire(import.meta.url);
const sessions = new Map<string, EmbeddedSession>();
const MAX_LINES_PER_TERMINAL = 2000;
const DEFAULT_WORKFLOW = 'start-work';

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

async function readWorkflowDefinition(workflowName: string): Promise<WorkflowDef> {
  const baseName = workflowName.replace(/\.json$/i, '');
  const workflowsDir = getWorkflowsDir();
  let filePath = path.join(workflowsDir, `${baseName}.json`);
  let raw = '';
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    const altName = baseName.replace(/_/g, '-');
    filePath = path.join(workflowsDir, `${altName}.json`);
    raw = await readFile(filePath, 'utf-8');
  }
  const def = JSON.parse(raw) as WorkflowDef;
  if (!Array.isArray(def.steps)) throw new Error('工作流缺少 steps 数组');
  return def;
}

function resolveShellStep(step: Step & { tool: 'shell' }): { command: string; cwd?: string } {
  const code = step.cwdCode?.trim();
  if (!code) return { command: step.cmd };
  const dir = getProjectPath(code);
  if (!dir) return { command: step.cmd };
  return { command: step.cmd, cwd: dir };
}

function pushLine(terminal: EmbeddedTerminalSnapshot, line: string): void {
  if (!line) return;
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  terminal.lines.push(`${timestamp} ${line}`);
  if (terminal.lines.length > MAX_LINES_PER_TERMINAL) {
    terminal.lines.splice(0, terminal.lines.length - MAX_LINES_PER_TERMINAL);
  }
}

function createTerminal(step: Step, stepIndex: number): EmbeddedTerminalSnapshot {
  const taskKey = (step.taskKey || `step-${stepIndex + 1}`).trim();
  return {
    id: `${taskKey}-${stepIndex + 1}`,
    title: taskKey,
    taskKey,
    stepIndex,
    status: 'running',
    lines: [],
  };
}

export async function startEmbeddedWorkflow(workflowName = DEFAULT_WORKFLOW): Promise<{ sessionId: string; terminals: EmbeddedTerminalSnapshot[] }> {
  const def = await readWorkflowDefinition(workflowName);
  const sessionId = randomUUID();
  const session: EmbeddedSession = {
    id: sessionId,
    workflowName,
    terminals: [],
    createdAt: Date.now(),
  };
  sessions.set(sessionId, session);

  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i];
    const terminal = createTerminal(step, i);
    session.terminals.push(terminal);
    try {
      if (step.tool === 'shell') {
        const { command, cwd } = resolveShellStep(step);
        if (step.visible) {
          const ptySession = createTerminalSession({
            title: terminal.title,
            cwd,
            command,
          });
          terminal.terminalSessionId = ptySession.id;
          terminal.status = ptySession.status;
          pushLine(terminal, `已创建可交互终端，会话: ${ptySession.id}`);
        } else {
          const runCommand = cwd ? `cd ${cwd} && ${command}` : command;
          pushLine(terminal, `执行命令: ${runCommand}`);
          const out = await shellRun(runCommand);
          if (out.stdout) out.stdout.split(/\r?\n/).filter(Boolean).forEach((line) => pushLine(terminal, line));
          if (out.stderr) out.stderr.split(/\r?\n/).filter(Boolean).forEach((line) => pushLine(terminal, `[ERR] ${line}`));
          terminal.status = out.code === 0 ? 'success' : 'error';
          pushLine(terminal, out.code === 0 ? '执行完成' : `执行失败，退出码: ${out.code}`);
        }
      } else if (step.tool === 'browser') {
        await browserOpen(step.url);
        terminal.status = 'success';
        pushLine(terminal, `已打开浏览器: ${step.url}`);
      } else if (step.tool === 'jenkins') {
        const out = await jenkinsDeploy(step.jobName);
        terminal.status = out.success ? 'success' : 'error';
        pushLine(terminal, out.message || `Jenkins: ${step.jobName}`);
      } else {
        terminal.status = 'error';
        pushLine(terminal, '未知步骤类型');
      }
    } catch (err) {
      terminal.status = 'error';
      pushLine(terminal, `执行异常: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    sessionId,
    terminals: session.terminals,
  };
}

export function getEmbeddedWorkflowSession(sessionId: string): EmbeddedSession | null {
  return sessions.get(sessionId) ?? null;
}

export function addManualTerminalToSession(sessionId: string): EmbeddedTerminalSnapshot | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const existingManualCount = session.terminals.filter((item) => item.taskKey === 'manual').length;
  const title = `terminal-${existingManualCount + 1}`;
  const ptySession = createTerminalSession({ title, cwd: homedir() });
  const terminal: EmbeddedTerminalSnapshot = {
    id: `manual-${Date.now()}`,
    title,
    taskKey: 'manual',
    stepIndex: session.terminals.length,
    status: ptySession.status,
    lines: [`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} 已创建手动终端`],
    terminalSessionId: ptySession.id,
  };
  session.terminals.push(terminal);
  return terminal;
}
