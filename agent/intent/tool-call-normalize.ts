/* AI 生成 By Peng.Guo */
import { getAllProjects } from '../../config/projects.js';
import { resolveWorkflowForTaskKey } from '../../config/workflow-task-registry.js';
import type { ToolCall } from '../ollama-client.js';

const WORD_BOUNDARY = '[^a-z0-9-]';

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractExplicitProjectCode(userMessage: string): string | null {
  const text = (userMessage ?? '').toLowerCase();
  if (!text.trim()) return null;
  const candidates = new Set<string>();
  const codes = getAllProjects()
    .flatMap((p) => p.codes)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const code of codes) {
    const re = new RegExp(`(^|${WORD_BOUNDARY})${escapeRegExp(code)}(?=$|${WORD_BOUNDARY})`, 'i');
    if (re.test(text)) candidates.add(code);
  }
  if (candidates.size !== 1) return null;
  return [...candidates][0] ?? null;
}

export function normalizeToolCallWithExplicitCode(
  call: ToolCall,
  explicitCode: string | null,
  userMessage: string
): ToolCall {
  const args = (call.arguments ?? {}) as Record<string, unknown>;
  if (explicitCode && call.name === 'open_terminal') {
    const hasCode = String(args.code ?? '').trim();
    if (!hasCode && /终端\s*打开/.test((userMessage ?? '').toLowerCase())) {
      return { ...call, arguments: { ...args, code: explicitCode } };
    }
  }
  if (!explicitCode) return call;
  if (call.name === 'deploy_jenkins' || call.name === 'open_jenkins_job') {
    return { ...call, arguments: { ...args, job: explicitCode } };
  }
  if (call.name === 'open_in_ide' || call.name === 'close_ide_project') {
    return { ...call, arguments: { ...args, code: explicitCode } };
  }
  if (call.name === 'run_workflow_step' && explicitCode) {
    const taskKey = String(args.taskKey ?? explicitCode).trim() || explicitCode;
    const hint = String(args.workflow ?? '').trim() || 'start-work';
    const workflow = resolveWorkflowForTaskKey(taskKey, hint) ?? hint;
    return { ...call, arguments: { workflow, taskKey } };
  }
  return call;
}
