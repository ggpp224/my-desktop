/* AI 生成 By Peng.Guo */
import type { CommandCapabilityResponse } from '../../domain/capability/models';

export async function fetchCommandCapabilities(apiBase: string): Promise<CommandCapabilityResponse> {
  const res = await fetch(`${apiBase}/commands/capabilities`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<CommandCapabilityResponse>;
}
