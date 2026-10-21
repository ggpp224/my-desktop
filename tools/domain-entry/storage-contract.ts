/* AI 生成 By Peng.Guo */
import type {
  IDomainEntryPageConfig,
  IContextDomainEntryProfile,
  IDomainEntryOverride,
  IDomainEntryProfile,
  IDomainMfSource,
} from './declare.js';
import { getMfDomainBindings } from '../../config/mf-domain-bindings.js';
import {
  buildCdnRemoteEntryUrl,
  compileContextProfile,
  DEFAULT_API_PROXY_PORT,
  DEFAULT_CJET_PROXY_IP,
} from './profile-compiler.js';
import { assertSafeRemoteEntryUrl, stripRemoteEntryQuery } from './url-utils.js';

/** 页面 domainEntry.js 读取的 localStorage key（历史命名，非插件依赖） */
export const DOMAIN_ENTRY_STORAGE_KEY = 'domain-debug-helper-ccweb';
export { assertSafeRemoteEntryUrl } from './url-utils.js';

const CDN_ENV_IN_PATH_RE =
  /\/(test|pre-test|inte|inte2|prod|prod2|moni|moni2|hotfix|dev|test2|f\d+)\//i;

/**
 * 历史误写的 MF 8888 路径（曾把 local remoteEntry 改成代理 URL）；回显时仍识别为 local 端口。
 * 本地 node（API 代理）本身不改写 domainEntry。
 */
const LEGACY_MF_8888_URL_RE = /^https?:\/\/([^/:]+):8888\/(\d+)\//i;

function isLocalhostRemoteEntry(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url);
}

export function hasDebugFlags(
  profile:
    | Pick<IContextDomainEntryProfile, 'logEnable' | 'isCjetProxy' | 'installCCWebHelper'>
    | IDomainEntryPageConfig
    | undefined
): boolean {
  if (!profile) return false;
  return (
    Boolean(profile.logEnable) ||
    Boolean(profile.isCjetProxy) ||
    Boolean(profile.installCCWebHelper)
  );
}

export function normalizeProxyIp(raw: string | undefined): string {
  const ip = String(raw || '').trim();
  return ip || DEFAULT_CJET_PROXY_IP;
}

export function normalizeProxyPort(raw: number | string | undefined): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw || '').trim());
  if (Number.isFinite(n) && n > 0 && n < 65536) return Math.floor(n);
  return DEFAULT_API_PROXY_PORT;
}

/** bridgeEnable 缺省为 true（未写字段视为开启） */
export function normalizeBridgeEnable(raw: boolean | undefined): boolean {
  return raw !== false;
}

function pickDebugFlags(profile: IContextDomainEntryProfile): Pick<
  IDomainEntryPageConfig,
  'logEnable' | 'bridgeEnable' | 'installCCWebHelper' | 'isCjetProxy' | 'proxyIp' | 'proxyPort'
> {
  const isCjetProxy = Boolean(profile.isCjetProxy);
  return {
    logEnable: Boolean(profile.logEnable),
    bridgeEnable: normalizeBridgeEnable(profile.bridgeEnable),
    installCCWebHelper: Boolean(profile.installCCWebHelper),
    isCjetProxy,
    // 仅代理开启时写出目标地址，避免未启用时 fingerprint 与页面 echo 无端误判 diff
    proxyIp: isCjetProxy ? normalizeProxyIp(profile.proxyIp) : undefined,
    proxyPort: isCjetProxy ? normalizeProxyPort(profile.proxyPort) : undefined,
  };
}

/** 页面 domainEntry 表 → 桌面 sources（用于页面回显） */
export function pageConfigDomainEntryToSources(
  domainEntry: Record<string, string> | undefined
): Record<string, IDomainMfSource> {
  const sources: Record<string, IDomainMfSource> = {};
  for (const [domain, raw] of Object.entries(domainEntry || {})) {
    const url = stripRemoteEntryQuery(String(raw || ''));
    if (!domain || !url) continue;
    // 兼容历史误写的 MF→8888 URL
    const legacy8888 = url.match(LEGACY_MF_8888_URL_RE);
    if (legacy8888) {
      sources[domain] = { kind: 'local', value: legacy8888[2] };
      continue;
    }
    const portMatch = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)\//i);
    if (portMatch) {
      sources[domain] = { kind: 'local', value: portMatch[1] };
      continue;
    }
    const envMatch = url.match(CDN_ENV_IN_PATH_RE);
    if (envMatch) {
      sources[domain] = { kind: 'cdn', value: envMatch[1] };
      continue;
    }
    sources[domain] = { kind: 'url', value: url };
  }
  return sources;
}

/**
 * 页面 localStorage 契约 → 某业务环境 profile（仅回显/导入，不自动落盘）
 * current=local 且含 localhost 时，桌面 MF 应高亮 local
 */
export function pageConfigToContextProfile(
  contextEnv: string,
  config: IDomainEntryPageConfig
): IContextDomainEntryProfile {
  const env = String(contextEnv || config.current || 'inte').trim();
  const safeEnv = env === 'local' ? 'inte' : env;
  return {
    contextEnv: safeEnv,
    enable: Boolean(config.enable),
    sources: pageConfigDomainEntryToSources(config.domainEntry),
    logEnable: Boolean(config.logEnable),
    bridgeEnable: normalizeBridgeEnable(config.bridgeEnable),
    installCCWebHelper: Boolean(config.installCCWebHelper),
    isCjetProxy: Boolean(config.isCjetProxy),
    proxyIp: normalizeProxyIp(config.proxyIp),
    proxyPort: normalizeProxyPort(config.proxyPort),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 供页面 domainEntry.js / 桌面回显：
 * - domainEntry 里只要有 localhost（或历史 8888 误写）→ current=local
 * - 否则 current=业务环境
 */
export function resolvePageConfigCurrent(
  contextEnv: string,
  domainEntry: Record<string, string>
): string {
  const env = String(contextEnv || '').trim() || 'inte';
  if (
    Object.values(domainEntry).some(
      (u) => isLocalhostRemoteEntry(String(u || '')) || LEGACY_MF_8888_URL_RE.test(String(u || ''))
    )
  ) {
    return 'local';
  }
  return env === 'local' ? 'inte' : env;
}

/** 是否存在非 follow 覆盖（修改即覆盖，不依赖手动 enable） */
export function hasOverrideSources(sources: Record<string, IDomainMfSource> | undefined): boolean {
  return Object.values(sources || {}).some((s) => Boolean(s?.kind && s.kind !== 'follow'));
}

/**
 * 业务环境 profile → 页面 Domain Entry 契约。
 * 有覆盖时写出完整 domain 表（未覆盖域补本境 CDN）。
 * 始终带上 logEnable / bridgeEnable / installCCWebHelper / isCjetProxy / proxyIp / proxyPort。
 * 仅无覆盖且无调试开关时可 syncClear。
 */
export function contextProfileToPageConfig(profile: IContextDomainEntryProfile): IDomainEntryPageConfig {
  const overrides = compileContextProfile(profile);
  const domainEntry: Record<string, string> = {};
  for (const o of overrides) {
    domainEntry[o.domain] = stripRemoteEntryQuery(o.remoteEntryUrl);
  }
  const enable = hasOverrideSources(profile.sources) || overrides.length > 0;
  const flags = pickDebugFlags(profile);
  const contextEnv = String(profile.contextEnv || 'inte');

  if (!enable) {
    return {
      enable: false,
      current: resolvePageConfigCurrent(contextEnv, {}),
      domainEntry: {},
      ...flags,
      syncClear: !hasDebugFlags(flags),
    };
  }

  const cdnEnv = contextEnv === 'local' ? 'inte' : contextEnv;
  for (const b of getMfDomainBindings()) {
    if (domainEntry[b.mfDomain]) continue;
    domainEntry[b.mfDomain] = stripRemoteEntryQuery(buildCdnRemoteEntryUrl(b, cdnEnv));
  }

  return {
    enable: true,
    current: resolvePageConfigCurrent(contextEnv, domainEntry),
    domainEntry,
    ...flags,
    syncClear: false,
  };
}

/** @deprecated 旧单 profile 转换 */
export function toPageConfigStorage(profile: IDomainEntryProfile): IDomainEntryPageConfig {
  const domainEntry: Record<string, string> = {};
  for (const o of profile.overrides || []) {
    if (!o.domain || !o.remoteEntryUrl) continue;
    domainEntry[o.domain] = stripRemoteEntryQuery(o.remoteEntryUrl);
  }
  return {
    enable: Boolean(profile.enable),
    current: String(profile.env || 'local'),
    domainEntry,
  };
}

export function fromPageConfigStorage(
  config: IDomainEntryPageConfig,
  options?: { id?: string; name?: string }
): IDomainEntryProfile {
  const overrides: IDomainEntryOverride[] = Object.entries(config.domainEntry || {}).map(
    ([domain, remoteEntryUrl]) => ({
      domain,
      remoteEntryUrl: stripRemoteEntryQuery(String(remoteEntryUrl || '')),
      source: 'url' as const,
    })
  );
  return {
    id: options?.id ?? 'imported',
    name: options?.name ?? `imported-${config.current || 'unknown'}`,
    env: (config.current || 'local') as IDomainEntryProfile['env'],
    enable: Boolean(config.enable),
    overrides,
    updatedAt: new Date().toISOString(),
  };
}

export function profileOverridesToMap(overrides: IDomainEntryOverride[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const o of overrides) {
    map[o.domain] = stripRemoteEntryQuery(o.remoteEntryUrl);
  }
  return map;
}
