/* AI 生成 By Peng.Guo */
import type { ToolCall } from '../ollama-client.js';

export type IntentSource =
  | 'fixed-exact'
  | 'pattern-deploy'
  | 'pattern-merge'
  | 'pattern-start'
  | 'pattern-workflow'
  | 'pattern-composite'
  | 'knowledge-qa'
  | 'llm-full'
  | 'llm-scoped'
  | 'llm-no-terminal';

export type LlmPolicy = 'full' | 'scoped' | 'no-terminal';

export type ResolvedIntent =
  | {
      kind: 'direct';
      source: IntentSource;
      toolCall: ToolCall;
      tool: string;
      skipLlm: true;
    }
  | {
      kind: 'knowledge';
      source: 'knowledge-qa';
      toolCall: ToolCall;
      tool: 'query_knowledge_base';
      skipLlm: true;
    }
  | {
      kind: 'llm';
      source: IntentSource;
      llmPolicy: LlmPolicy;
      allowedTools?: readonly string[];
      skipLlm: false;
    };

export type IntentResolveContext = {
  userMessage: string;
  normalizedMessage: string;
  explicitProjectCode: string | null;
};
