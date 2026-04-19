/* AI 生成 By Peng.Guo */

export type GeminiTestResponse = { ok: true; message: string } | { ok: false; error: string };

export async function postGeminiTest(
  apiBase: string,
  body: { apiKey?: string; model?: string; baseUrl?: string },
): Promise<GeminiTestResponse> {
  const url = `${apiBase.replace(/\/$/, '')}/agent/gemini/test`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: `服务器返回非 JSON（HTTP ${res.status}）` };
  }
  const parsed = data as Partial<GeminiTestResponse>;
  if (parsed && typeof parsed === 'object' && parsed.ok === true && typeof parsed.message === 'string') {
    return { ok: true, message: parsed.message };
  }
  if (parsed && typeof parsed === 'object' && parsed.ok === false && typeof parsed.error === 'string') {
    return { ok: false, error: parsed.error };
  }
  return { ok: false, error: res.statusText || `HTTP ${res.status}` };
}
