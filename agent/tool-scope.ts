/* AI 生成 By Peng.Guo */
import {
  isCloudEnvOpenIntent,
  resolveExactCommand,
  TERMINAL_TOOL_NAME,
} from '../config/command-catalog.js';
import { toolsSchema } from './tools-schema.js';
import type { ResolvedIntent } from './intent/types.js';

export type AgentToolDefinition = (typeof toolsSchema)[number];

function filterToolsByNames(names: readonly string[]): AgentToolDefinition[] {
  const allow = new Set(names);
  const picked = toolsSchema.filter((t) => allow.has(t.function.name));
  if (picked.length !== names.length) {
    const missing = names.filter((n) => !picked.some((t) => t.function.name === n));
    throw new Error(`toolsSchema 缺少固定口令映射的工具: ${missing.join(', ')}`);
  }
  return picked;
}

export type AgentToolScope = {
  tools: AgentToolDefinition[];
  /** 供日志/debug */
  mode: 'direct' | 'knowledge' | 'llm-full' | 'llm-scoped' | 'llm-no-terminal';
};

export function resolveToolsFromIntent(intent: ResolvedIntent, userMessage: string): AgentToolScope {
  if (intent.kind === 'direct') {
    return { tools: [], mode: 'direct' };
  }
  if (intent.kind === 'knowledge') {
    return { tools: [], mode: 'knowledge' };
  }
  if (intent.llmPolicy === 'no-terminal' || isCloudEnvOpenIntent(userMessage)) {
    return {
      tools: toolsSchema.filter((t) => t.function.name !== TERMINAL_TOOL_NAME),
      mode: 'llm-no-terminal',
    };
  }
  if (intent.llmPolicy === 'scoped' && intent.allowedTools?.length) {
    return {
      tools: filterToolsByNames(intent.allowedTools),
      mode: 'llm-scoped',
    };
  }
  return { tools: [...toolsSchema], mode: 'llm-full' };
}

/** @deprecated 使用 resolveIntent + resolveToolsFromIntent */
export function resolveAgentToolScope(userMessage: string): AgentToolScope {
  const exact = resolveExactCommand(userMessage);
  if (exact) {
    return {
      tools: filterToolsByNames([exact.tool]),
      mode: 'llm-scoped',
    };
  }
  if (isCloudEnvOpenIntent(userMessage)) {
    return {
      tools: toolsSchema.filter((t) => t.function.name !== TERMINAL_TOOL_NAME),
      mode: 'llm-no-terminal',
    };
  }
  return { tools: [...toolsSchema], mode: 'llm-full' };
}
