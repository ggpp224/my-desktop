/* AI 生成 By Peng.Guo */
import {
  isCloudEnvOpenIntent,
  resolveFixedCommandToolNames,
  TERMINAL_TOOL_NAME,
} from '../config/fixed-command-tools.js';
import { toolsSchema } from './tools-schema.js';

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
  /** 供日志/debug：fixed-exact | cloud-env-no-terminal | full */
  mode: 'fixed-exact' | 'cloud-env-no-terminal' | 'full';
};

/**
 * 根据用户输入收窄首轮可见工具，减少「打开测试环境」误选 open_terminal。
 * 仍由 LLM 在候选集内选择并发起 tool_calls，不绕过模型执行。
 */
export function resolveAgentToolScope(userMessage: string): AgentToolScope {
  const fixedNames = resolveFixedCommandToolNames(userMessage);
  if (fixedNames && fixedNames.length > 0) {
    return { tools: filterToolsByNames(fixedNames), mode: 'fixed-exact' };
  }
  if (isCloudEnvOpenIntent(userMessage)) {
    return {
      tools: toolsSchema.filter((t) => t.function.name !== TERMINAL_TOOL_NAME),
      mode: 'cloud-env-no-terminal',
    };
  }
  return { tools: [...toolsSchema], mode: 'full' };
}
