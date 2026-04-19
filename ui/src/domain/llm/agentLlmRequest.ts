/* AI 生成 By Peng.Guo */
/** 与后端 POST /agent/chat/stream 的 body.llm 对齐，供基础设施层序列化 */

export type LlmRuntimeMode = 'local' | 'external';

export type AgentChatLlmBody =
  | { mode: 'local' }
  /** apiKey 可选：未传时由服务端使用 GEMINI_API_KEY / GOOGLE_API_KEY */
  | { mode: 'external'; provider: 'gemini'; apiKey?: string; model: string; baseUrl?: string };

export type GeminiUserSettings = {
  apiKey: string;
  model: string;
  /** 空字符串表示使用官方默认根地址 */
  baseUrl: string;
};

export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

export function buildAgentChatLlmBody(mode: LlmRuntimeMode, gemini: GeminiUserSettings): AgentChatLlmBody | undefined {
  if (mode === 'local') return undefined;
  const model = gemini.model.trim() || DEFAULT_GEMINI_MODEL;
  const baseUrl = gemini.baseUrl.trim();
  const apiKey = gemini.apiKey.trim();
  return {
    mode: 'external',
    provider: 'gemini',
    ...(apiKey ? { apiKey } : {}),
    model,
    ...(baseUrl ? { baseUrl } : {}),
  };
}
