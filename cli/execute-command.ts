/* AI 生成 By Peng.Guo */
import type { ToolCall } from '../agent/ollama-client.js';
import { resolveIntent } from '../agent/intent/intent-resolver.js';
import { routeAndExecute } from '../agent/tool-router.js';
import type { ProjectCapabilityInput } from '../config/command-hints.js';
import {
  DEPLOY_PRETEST_HINTS,
  FIXED_COMMAND_HINTS,
  MERGE_PRETEST_HINTS,
} from '../config/command-hints.js';
import { getAllProjects, type ProjectEntry } from '../config/projects.js';
import { getWorkflowCatalog } from '../config/workflow-catalog.js';
import { isDesktopOnlyTool } from './desktop-only.js';

const EMBEDDED_START_WORK_NAMES = new Set(['start-work', 'start-work']);
const EXTERNAL_START_WORK_NAME = 'start-work-external-terminal';

export type ExecuteCommandDeps = {
  resolveProjects?: () => ProjectCapabilityInput[];
  executeTool?: (call: ToolCall) => Promise<unknown>;
};

export type ExecuteCommandResult =
  | {
      ok: true;
      code: 'executed';
      intentKind: 'direct' | 'knowledge';
      source: string;
      toolCall: ToolCall;
      rewritten: boolean;
      rewriteNote?: string;
      result: unknown;
    }
  | {
      ok: false;
      code: 'desktop_only';
      tool: string;
      message: string;
      toolCall: ToolCall;
    }
  | {
      ok: false;
      code: 'unresolved';
      message: string;
      intentKind: 'llm';
      source: string;
    };

export function toCapabilityProjects(projects: ProjectEntry[]): ProjectCapabilityInput[] {
  return projects.map((p) => {
    const item: ProjectCapabilityInput = { codes: p.codes };
    if (p.jenkins) {
      item.jenkins = {
        jobName: p.jenkins.jobName,
        defaultBranch: p.jenkins.defaultBranch,
      };
    }
    if (p.merge) {
      item.merge = {
        targetBranch: p.merge.targetBranch,
        runRelease: p.merge.runRelease,
      };
    }
    return item;
  });
}

export function applyCursorWorkflowPolicy(call: ToolCall): {
  call: ToolCall;
  rewritten: boolean;
  rewriteNote?: string;
} {
  if (call.name !== 'run_workflow') {
    return { call, rewritten: false };
  }
  const workflowName = String(call.arguments?.name ?? '');
  if (!EMBEDDED_START_WORK_NAMES.has(workflowName)) {
    return { call, rewritten: false };
  }
  return {
    call: {
      name: call.name,
      arguments: { ...call.arguments, name: EXTERNAL_START_WORK_NAME },
    },
    rewritten: true,
    rewriteNote: 'Cursor 看不到桌面端内嵌终端，已改走 start-work-external-terminal',
  };
}

export function listCommands(): {
  exact: readonly string[];
  workflows: { name: string; label: string; desc: string }[];
  patterns: string[];
} {
  return {
    exact: [...FIXED_COMMAND_HINTS],
    workflows: getWorkflowCatalog().map((w) => ({ name: w.name, label: w.label, desc: w.desc })),
    patterns: [
      '部署 <项目代号>，可选「分支是 xxx」',
      ...DEPLOY_PRETEST_HINTS,
      '合并 <项目代号>',
      ...Object.values(MERGE_PRETEST_HINTS).flat(),
      '启动 <项目代号>',
      '执行工作流 <name>',
    ],
  };
}

export async function executeCommand(
  message: string,
  deps: ExecuteCommandDeps = {}
): Promise<ExecuteCommandResult> {
  const text = (message ?? '').trim();
  const projects = deps.resolveProjects?.() ?? toCapabilityProjects(getAllProjects());
  const executeTool = deps.executeTool ?? ((call: ToolCall) => routeAndExecute(call));
  const intent = resolveIntent(text, { projects });

  if (intent.kind === 'llm') {
    return {
      ok: false,
      code: 'unresolved',
      intentKind: 'llm',
      source: intent.source,
      message:
        '口令未命中固定或模式规则。请改用斜杠命令（如 /部署 nova、/开始工作）或 `npm run adc -- <口令>`，或换用桌面端。',
    };
  }

  const planned = applyCursorWorkflowPolicy(intent.toolCall);
  if (isDesktopOnlyTool(planned.call.name)) {
    return {
      ok: false,
      code: 'desktop_only',
      tool: planned.call.name,
      toolCall: planned.call,
      message: `「${text}」依赖 AI Dev Control Center 窗口（工具 ${planned.call.name}），请在桌面端使用。`,
    };
  }

  const result = await executeTool(planned.call);
  return {
    ok: true,
    code: 'executed',
    intentKind: intent.kind,
    source: intent.source,
    toolCall: planned.call,
    rewritten: planned.rewritten,
    rewriteNote: planned.rewriteNote,
    result,
  };
}
