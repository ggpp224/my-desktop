/* AI 生成 By Peng.Guo */
import type { ProjectCapabilityInput } from '../../config/command-hints.js';
import {
  isCloudEnvOpenIntent,
  resolveExactCommand,
  resolveExactToolCall,
} from '../../config/command-catalog.js';
import type { ToolCall } from '../ollama-client.js';
import { shouldRouteToKnowledgeBase } from './knowledge-guard.js';
import { normalizeCommandText, normalizeIntentMessage } from './normalize.js';
import {
  parseCompositeNovaMergeAndDeployIntent,
  parseDeployIntent,
  parseMergeIntent,
  parseStartProjectIntent,
  parseUpgradeNovaWorkflowIntent,
} from './parsers/index.js';
import { extractExplicitProjectCode } from './tool-call-normalize.js';
import type { IntentResolveContext, IntentSource, ResolvedIntent } from './types.js';

function directIntent(toolCall: ToolCall, source: IntentSource): ResolvedIntent {
  return {
    kind: 'direct',
    source,
    toolCall,
    tool: toolCall.name,
    skipLlm: true,
  };
}

function resolvePatternToolCall(ctx: IntentResolveContext): { call: ToolCall; source: IntentSource } | null {
  const { normalizedMessage, explicitProjectCode } = ctx;
  const deploy = parseDeployIntent(normalizedMessage, explicitProjectCode);
  if (deploy) return { call: deploy, source: 'pattern-deploy' };

  const composite = parseCompositeNovaMergeAndDeployIntent(normalizedMessage);
  if (composite) return { call: composite, source: 'pattern-composite' };

  const upgrade = parseUpgradeNovaWorkflowIntent(normalizedMessage);
  if (upgrade) return { call: upgrade, source: 'pattern-workflow' };

  const merge = parseMergeIntent(normalizedMessage);
  if (merge) return { call: merge, source: 'pattern-merge' };

  const start = parseStartProjectIntent(normalizedMessage);
  if (start) return { call: start, source: 'pattern-start' };

  return null;
}

export function buildIntentResolveContext(
  userMessage: string,
  _projects: ProjectCapabilityInput[]
): IntentResolveContext {
  const normalizedMessage = normalizeIntentMessage(userMessage);
  return {
    userMessage,
    normalizedMessage,
    explicitProjectCode: extractExplicitProjectCode(normalizedMessage),
  };
}

export function resolveIntent(
  userMessage: string,
  options: { projects: ProjectCapabilityInput[] }
): ResolvedIntent {
  const ctx = buildIntentResolveContext(userMessage, options.projects);
  const { normalizedMessage } = ctx;

  const exact = resolveExactCommand(normalizedMessage);
  if (exact) {
    const resolved = resolveExactToolCall(normalizedMessage);
    if (resolved) {
      return directIntent(
        { name: resolved.tool, arguments: resolved.arguments },
        'fixed-exact'
      );
    }
  }

  const pattern = resolvePatternToolCall(ctx);
  if (pattern) return directIntent(pattern.call, pattern.source);

  if (shouldRouteToKnowledgeBase(normalizedMessage, options.projects)) {
    return {
      kind: 'knowledge',
      source: 'knowledge-qa',
      toolCall: {
        name: 'query_knowledge_base',
        arguments: { question: normalizedMessage },
      },
      tool: 'query_knowledge_base',
      skipLlm: true,
    };
  }

  if (isCloudEnvOpenIntent(normalizedMessage)) {
    return {
      kind: 'llm',
      source: 'llm-no-terminal',
      llmPolicy: 'no-terminal',
      skipLlm: false,
    };
  }

  return {
    kind: 'llm',
    source: 'llm-full',
    llmPolicy: 'full',
    skipLlm: false,
  };
}

/** pattern 层二次解析（LLM 未返回合法 tool_calls 时） */
export function resolvePatternFallbackIntent(
  userMessage: string,
  options: { projects: ProjectCapabilityInput[] }
): ResolvedIntent | null {
  const ctx = buildIntentResolveContext(userMessage, options.projects);
  const pattern = resolvePatternToolCall(ctx);
  if (!pattern) return null;
  return directIntent(pattern.call, pattern.source);
}

export function formatIntentLogLine(intent: ResolvedIntent): string {
  if (intent.kind === 'direct') {
    return `[intent] kind=direct source=${intent.source} tool=${intent.tool} skip_llm=true`;
  }
  if (intent.kind === 'knowledge') {
    return `[intent] kind=knowledge source=knowledge-qa tool=query_knowledge_base skip_llm=true`;
  }
  const allowed =
    intent.allowedTools && intent.allowedTools.length > 0
      ? ` allowedTools=${intent.allowedTools.join(',')}`
      : '';
  return `[intent] kind=llm source=${intent.source} policy=${intent.llmPolicy}${allowed}`;
}
