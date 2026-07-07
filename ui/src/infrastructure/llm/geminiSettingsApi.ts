/* AI 生成 By Peng.Guo */

export type GeminiEnvSettingsSnapshot = {
  hasApiKey: boolean;
  apiKeySuffix: string;
  model: string;
};

export async function fetchGeminiEnvSettings(apiBase: string): Promise<GeminiEnvSettingsSnapshot> {
  const res = await fetch(`${apiBase}/agent/gemini/settings`);
  if (!res.ok) {
    throw new Error(`读取 Gemini 设置失败(${res.status})`);
  }
  return (await res.json()) as GeminiEnvSettingsSnapshot;
}

export async function saveGeminiEnvSettings(
  apiBase: string,
  body: { apiKey?: string; model?: string }
): Promise<GeminiEnvSettingsSnapshot> {
  const res = await fetch(`${apiBase}/agent/gemini/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as GeminiEnvSettingsSnapshot & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `保存 Gemini 设置失败(${res.status})`);
  }
  return data;
}
