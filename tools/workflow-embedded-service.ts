/* AI 生成 By Peng.Guo */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { homedir } from 'os';
import { getProjectPath } from '../config/projects.js';
import { open as browserOpen } from './browser-tool.js';
import { deploy as jenkinsDeploy } from './jenkins-tool.js';
import { run as shellRun } from './shell-tool.js';
import { closeTerminalSession, createTerminalSession } from './terminal-proxy.js';

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
  cwdAbs: string;
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
const SESSIONS_FILE = path.resolve(process.cwd(), 'runtime', 'embedded-workflow-sessions.json');
const MAX_LINES_PER_TERMINAL = 2000;
const DEFAULT_WORKFLOW = 'start-work';
/** 连续创建多个 PTY 时的间隔，降低 API 子进程被系统 OOM(Signal 9) 杀死的概率 */
const PTY_STAGGER_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureRuntimeDir(): void {
  const dir = path.dirname(SESSIONS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** API 子进程重启后从磁盘恢复「开始工作」会话元数据（PTY 在 terminal-broker 子进程，通常仍可连） */
function loadSessionsFromDisk(): void {
  ensureRuntimeDir();
  try {
    if (!existsSync(SESSIONS_FILE)) return;
    const raw = readFileSync(SESSIONS_FILE, 'utf-8');
    const data = JSON.parse(raw) as Record<string, EmbeddedSession>;
    for (const [id, session] of Object.entries(data)) {
      if (session?.id === id && Array.isArray(session.terminals)) {
        sessions.set(id, session);
      }
    }
  } catch {
    /* 损坏的缓存忽略 */
  }
}

function persistSessionsToDisk(): void {
  try {
    ensureRuntimeDir();
    writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions)), 'utf-8');
  } catch {
    /* 磁盘写入失败不阻断工作流 */
  }
}

loadSessionsFromDisk();

async function runPtyJobsSequential(jobs: Array<() => Promise<void>>): Promise<void> {
  for (const job of jobs) {
    try {
      await job();
    } catch {
      /* 单页签失败不阻断其余终端 */
    }
  }
}

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
    cwdAbs: process.cwd(),
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
  persistSessionsToDisk();
  const ptyJobs: Array<() => Promise<void>> = [];

  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i];
    const terminal = createTerminal(step, i);
    session.terminals.push(terminal);
    try {
      if (step.tool === 'shell') {
        const { command, cwd } = resolveShellStep(step);
        if (step.visible) {
          pushLine(terminal, '正在创建可交互终端…');
          const priorVisibleShells = def.steps.slice(0, i).filter((s) => s.tool === 'shell' && s.visible).length;
          ptyJobs.push(async () => {
            if (priorVisibleShells > 0) await sleep(PTY_STAGGER_MS);
            try {
              const ptySession = await createTerminalSession({
                title: terminal.title,
                cwd,
                command,
              });
              terminal.terminalSessionId = ptySession.id;
              terminal.status = ptySession.status;
              terminal.cwdAbs = ptySession.cwdAbs;
              pushLine(terminal, `已创建可交互终端，会话: ${ptySession.id}`);
            } catch (err) {
              terminal.status = 'error';
              pushLine(terminal, `终端创建失败: ${err instanceof Error ? err.message : String(err)}`);
            }
            persistSessionsToDisk();
          });
        } else {
          const runCommand = cwd ? `cd ${cwd} && ${command}` : command;
          terminal.cwdAbs = cwd || process.cwd();
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

  if (ptyJobs.length > 0) {
    void runPtyJobsSequential(ptyJobs);
  }

  return {
    sessionId,
    terminals: session.terminals,
  };
}

export function getEmbeddedWorkflowSession(sessionId: string): EmbeddedSession | null {
  return sessions.get(sessionId) ?? null;
}

/** 在已有会话中新建手动终端页签；cwd 默认用户主目录 */
export async function addManualTerminalToSession(
  sessionId: string,
  opts?: { cwd?: string; tabTitle?: string }
): Promise<EmbeddedTerminalSnapshot | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const existingManualCount = session.terminals.filter((item) => item.taskKey === 'manual').length;
  const cwdInput = (opts?.cwd ?? '').trim();
  const cwdResolved = cwdInput || homedir();
  const title = (opts?.tabTitle ?? '').trim() || `terminal-${existingManualCount + 1}`;
  const ptySession = await createTerminalSession({ title, cwd: cwdResolved });
  const terminal: EmbeddedTerminalSnapshot = {
    id: `manual-${Date.now()}`,
    title,
    taskKey: 'manual',
    stepIndex: session.terminals.length,
    status: ptySession.status,
    lines: [
      `${new Date().toLocaleTimeString('zh-CN', { hour12: false })} 已创建手动终端${
        cwdInput ? `，目录: ${ptySession.cwdAbs}` : ''
      }`,
    ],
    cwdAbs: ptySession.cwdAbs,
    terminalSessionId: ptySession.id,
  };
  session.terminals.push(terminal);
  persistSessionsToDisk();
  return terminal;
}

/** 打开仅含手动终端的内嵌工作区；可指定初始 cwd 与页签标题（如项目代号） */
export async function openEmbeddedTerminalWorkspace(opts?: {
  cwd?: string;
  tabTitle?: string;
}): Promise<{ sessionId: string; terminals: EmbeddedTerminalSnapshot[] }> {
  const sessionId = randomUUID();
  const session: EmbeddedSession = {
    id: sessionId,
    workflowName: 'open-terminal',
    terminals: [],
    createdAt: Date.now(),
  };
  sessions.set(sessionId, session);
  persistSessionsToDisk();
  const terminal = await addManualTerminalToSession(sessionId, opts);
  return { sessionId, terminals: terminal ? [terminal] : [] };
}

export function removeTerminalFromSession(sessionId: string, terminalId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  const index = session.terminals.findIndex((item) => item.id === terminalId);
  if (index < 0) return false;
  const terminal = session.terminals[index];
  if (terminal.terminalSessionId) {
    void closeTerminalSession(terminal.terminalSessionId);
  }
  session.terminals.splice(index, 1);
  persistSessionsToDisk();
  return true;
}

export function closeEmbeddedWorkflowSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.terminals.forEach((terminal) => {
    if (terminal.terminalSessionId) {
      void closeTerminalSession(terminal.terminalSessionId);
    }
  });
  sessions.delete(sessionId);
  persistSessionsToDisk();
  return true;
}
