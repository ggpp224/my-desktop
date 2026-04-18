/* AI 生成 By Peng.Guo */
/** 与后端 Agent Ollama 模型相关的 HTTP 封装，供 Chat 等 View 使用 */

export async function fetchAgentCurrentModel(apiBase: string): Promise<string | null> {
  const r = await fetch(`${apiBase}/agent/model`);
  if (!r.ok) return null;
  const data = (await r.json()) as { model?: string };
  return typeof data.model === 'string' ? data.model : null;
}

export async function fetchAgentOllamaInstalledModels(apiBase: string): Promise<string[]> {
  const r = await fetch(`${apiBase}/agent/ollama/models`);
  if (!r.ok) return [];
  const data = (await r.json()) as { models?: string[] };
  return Array.isArray(data.models) ? data.models : [];
}

export type SwitchAgentModelResult = { success: boolean; model?: string; error?: string };

export async function postSwitchAgentModel(apiBase: string, model: string): Promise<SwitchAgentModelResult> {
  const r = await fetch(`${apiBase}/agent/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  let data: { success?: boolean; error?: string; model?: string } = {};
  try {
    data = (await r.json()) as typeof data;
  } catch {
    return { success: false, error: `HTTP ${r.status}` };
  }
  if (!r.ok) return { success: false, error: data.error || `HTTP ${r.status}` };
  return { success: !!data.success, model: data.model, error: data.error };
}
