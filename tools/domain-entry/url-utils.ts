/* AI 生成 By Peng.Guo */

function stripQuery(url: string): string {
  return url.split('?')[0] ?? url;
}

/** 校验 remoteEntry URL：仅 http(s) */
export function assertSafeRemoteEntryUrl(url: string): string {
  const trimmed = stripQuery(url.trim());
  if (!trimmed) throw new Error('remoteEntry URL 不能为空');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`非法 remoteEntry URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`remoteEntry 仅允许 http(s): ${url}`);
  }
  return trimmed;
}

export function stripRemoteEntryQuery(url: string): string {
  return stripQuery(url);
}
