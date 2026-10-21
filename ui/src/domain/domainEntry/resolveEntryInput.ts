/* AI 生成 By Peng.Guo */
/**
 * 单行入口补全：纯端口 → http://localhost:{port}/remoteEntry.js
 * 与 tools/domain-entry/profile-compiler.resolveEntryInput 行为对齐（UI 侧轻量版）
 */

const ENV_ALIASES: Record<string, string> = {
  t: 'test',
  test: 'test',
  pre: 'pre-test',
  'pre-test': 'pre-test',
  i: 'inte',
  inte: 'inte',
  i2: 'inte2',
  inte2: 'inte2',
  p: 'prod',
  prod: 'prod',
  p2: 'prod2',
  prod2: 'prod2',
};

const ENV_PATH_RE = /\/(test|pre-test|inte|inte2|prod|prod2|moni|moni2|hotfix|dev|test2|f\d+)\//i;

function stripQuery(url: string): string {
  return url.split('?')[0] ?? url;
}

function rewriteEnvInUrl(url: string, env: string): string {
  const base = stripQuery(url);
  if (!ENV_PATH_RE.test(base)) return base;
  return base.replace(ENV_PATH_RE, `/${env}/`);
}

/**
 * 失焦 / Enter 时规范化入口输入；无法识别则原样返回（去首尾空白）。
 */
export function completeRemoteEntryInput(raw: string, previousUrl?: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  if (/^\d+$/.test(trimmed)) {
    return `http://localhost:${trimmed}/remoteEntry.js`;
  }

  const alias = ENV_ALIASES[trimmed.toLowerCase()];
  if (alias && previousUrl) {
    return rewriteEnvInUrl(previousUrl, alias);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return stripQuery(trimmed);
  }

  return trimmed;
}
