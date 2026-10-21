/* AI 生成 By Peng.Guo */
import {
  getMfDomainBindings,
  MF_CDN_HOST,
  type IMfLocalBinding,
} from '../../config/mf-domain-bindings.js';
import type {
  ICompileDomainEntryParams,
  IContextDomainEntryProfile,
  IDomainEntryOverride,
  IDomainMfSource,
  IResolveEntryInputParams,
  MfEnvId,
  MfSourceKind,
} from './declare.js';
import { assertSafeRemoteEntryUrl } from './url-utils.js';

const ENV_PATH_RE = /\/(test|pre-test|inte|inte2|prod|prod2|moni|moni2|hotfix|dev|test2|f\d+)\//i;

const ENV_ALIASES: Record<string, MfEnvId> = {
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
  local: 'local',
  dev: 'dev',
  moni: 'moni',
  moni2: 'moni2',
  hotfix: 'hotfix',
  test2: 'test2',
};

/**
 * 业务运行环境（面板「环境」行）——不含 local。
 * local 只作为 MF 入口快捷来源，不是业务环境 profile。
 */
export const MF_CONTEXT_ENVS: readonly MfEnvId[] = [
  'dev',
  'pre-test',
  'test',
  'test2',
  'inte',
  'inte2',
  'moni',
  'moni2',
  'hotfix',
  'prod',
  'prod2',
];

/** 面板「MF」行快捷（含 local + 各 CDN 环境名；点非 local = 取消本地回本境） */
export const MF_SOURCE_SHORTCUTS: readonly MfEnvId[] = ['local', ...MF_CONTEXT_ENVS];

/** CDN 入口来源可选环境 */
export const MF_CDN_SOURCE_ENVS: readonly MfEnvId[] = MF_CONTEXT_ENVS;

/** @deprecated 兼容旧名：业务环境列表 */
export const MF_ENV_BUTTONS = MF_CONTEXT_ENVS;

function stripQuery(url: string): string {
  return url.split('?')[0] ?? url;
}

export function rewriteEnvInUrl(url: string, env: string): string {
  const base = stripQuery(url);
  if (!ENV_PATH_RE.test(base)) return base;
  return base.replace(ENV_PATH_RE, `/${env}/`);
}

export function buildCdnRemoteEntryUrl(
  binding: IMfLocalBinding,
  env: string,
  cdnHost: string = MF_CDN_HOST
): string {
  const path = binding.cdnTemplate.replace(/\$env/g, env).replace(/^\/+|\/+$/g, '');
  return `${cdnHost.replace(/\/$/, '')}/${path}/remoteEntry.js`;
}

export function buildLocalRemoteEntryUrl(port: number): string {
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`非法本地端口: ${port}`);
  }
  return `http://localhost:${port}/remoteEntry.js`;
}

export function resolveEntryInput(params: IResolveEntryInputParams): string {
  const raw = params.raw.trim();
  if (!raw) throw new Error('入口不能为空');

  if (/^\d+$/.test(raw)) {
    return assertSafeRemoteEntryUrl(buildLocalRemoteEntryUrl(Number(raw)));
  }

  const alias = ENV_ALIASES[raw.toLowerCase()];
  if (alias && alias !== 'local' && params.baseUrl) {
    return assertSafeRemoteEntryUrl(rewriteEnvInUrl(params.baseUrl, alias));
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return assertSafeRemoteEntryUrl(raw);
  }

  throw new Error(`无法解析入口「${raw}」：请输入完整 URL、端口号或环境别名(t/pre/i/p)`);
}

function isLocalhostEntry(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url);
}

function compileOne(
  binding: IMfLocalBinding,
  env: MfEnvId,
  baseEntries: Record<string, string>,
  cdnHost: string
): IDomainEntryOverride {
  const domain = binding.mfDomain;
  const base = baseEntries[domain] ? stripQuery(baseEntries[domain]) : '';

  if (env === 'local') {
    if (binding.defaultPort > 0) {
      return {
        domain,
        remoteEntryUrl: buildLocalRemoteEntryUrl(binding.defaultPort),
        source: 'local',
      };
    }
    const url = base && !isLocalhostEntry(base) ? base : buildCdnRemoteEntryUrl(binding, 'inte', cdnHost);
    return { domain, remoteEntryUrl: stripQuery(url), source: 'cdn' };
  }

  if (base && !isLocalhostEntry(base)) {
    return {
      domain,
      remoteEntryUrl: rewriteEnvInUrl(base, env),
      source: 'cdn',
    };
  }

  return {
    domain,
    remoteEntryUrl: buildCdnRemoteEntryUrl(binding, env, cdnHost),
    source: 'cdn',
  };
}

/** 旧版：整表切到某一入口环境（兼容单测 / apply shell-local 快捷） */
export function compileDomainEntryProfile(
  params: ICompileDomainEntryParams,
  bindings: readonly IMfLocalBinding[] = getMfDomainBindings()
): IDomainEntryOverride[] {
  const env = (params.env || '').trim() as MfEnvId;
  if (!env) throw new Error('env 不能为空');

  const baseEntries: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.baseEntries || {})) {
    baseEntries[k] = stripQuery(String(v || ''));
  }
  const cdnHost = (params.cdnHost || MF_CDN_HOST).replace(/\/$/, '');

  const overrides = bindings.map((b) => compileOne(b, env, baseEntries, cdnHost));
  for (const o of overrides) {
    assertSafeRemoteEntryUrl(o.remoteEntryUrl);
  }
  return overrides;
}

/**
 * 将单域来源解析为 URL；follow 返回 null（表示不写入覆盖）
 */
export function resolveDomainSourceUrl(
  domain: string,
  source: IDomainMfSource | undefined,
  contextEnv: MfEnvId,
  binding: IMfLocalBinding | undefined,
  cdnHost: string = MF_CDN_HOST
): string | null {
  const kind: MfSourceKind = source?.kind || 'follow';
  if (kind === 'follow') return null;

  if (kind === 'local') {
    const port = Number(source?.value) || binding?.defaultPort || 0;
    if (!binding && !port) throw new Error(`${domain}: local 需要端口`);
    return assertSafeRemoteEntryUrl(buildLocalRemoteEntryUrl(port));
  }

  if (kind === 'cdn') {
    if (!binding) throw new Error(`${domain}: 缺少 binding，无法生成 CDN URL`);
    const env = (source?.value || contextEnv || '').trim();
    if (!env || env === 'local') {
      throw new Error(`${domain}: CDN 来源需指定非 local 环境`);
    }
    return assertSafeRemoteEntryUrl(buildCdnRemoteEntryUrl(binding, env, cdnHost));
  }

  if (kind === 'url') {
    return assertSafeRemoteEntryUrl(String(source?.value || ''));
  }

  return null;
}

/**
 * 业务环境 profile → 仅非 follow 的 overrides（供写入 localStorage）
 */
export function compileContextProfile(
  profile: IContextDomainEntryProfile,
  bindings: readonly IMfLocalBinding[] = getMfDomainBindings(),
  cdnHost: string = MF_CDN_HOST
): IDomainEntryOverride[] {
  const host = cdnHost.replace(/\/$/, '');
  const bindingMap = new Map(bindings.map((b) => [b.mfDomain, b]));
  const overrides: IDomainEntryOverride[] = [];

  const domains = new Set([...Object.keys(profile.sources || {}), ...bindings.map((b) => b.mfDomain)]);
  for (const domain of domains) {
    const source = profile.sources?.[domain];
    if (!source || source.kind === 'follow') continue;
    const url = resolveDomainSourceUrl(domain, source, profile.contextEnv, bindingMap.get(domain), host);
    if (!url) continue;
    overrides.push({ domain, remoteEntryUrl: url, source: source.kind });
  }
  return overrides;
}

/** 快捷：壳内/有端口的域切到 local，其余 follow */
export function buildShellLocalSources(
  bindings: readonly IMfLocalBinding[] = getMfDomainBindings()
): Record<string, IDomainMfSource> {
  const sources: Record<string, IDomainMfSource> = {};
  for (const b of bindings) {
    if (b.defaultPort > 0) {
      sources[b.mfDomain] = { kind: 'local', value: String(b.defaultPort) };
    } else {
      sources[b.mfDomain] = { kind: 'follow' };
    }
  }
  return sources;
}

export const DEFAULT_CJET_PROXY_IP = '127.0.0.1';
/**
 * 本地 node 端口（cpxy 目标 env，如 local:7001）。
 * 页面 SW 仍固定转到 https://{ip}:8888，再由 cpxy 转发到本端口。
 */
export const DEFAULT_API_PROXY_PORT = 7001;

export function createEmptyContextProfile(contextEnv: MfEnvId): IContextDomainEntryProfile {
  return {
    contextEnv,
    enable: false,
    sources: {},
    logEnable: false,
    bridgeEnable: true,
    installCCWebHelper: false,
    isCjetProxy: false,
    proxyIp: DEFAULT_CJET_PROXY_IP,
    proxyPort: DEFAULT_API_PROXY_PORT,
    /** 未落盘前为空，避免与 page-echo 比 updatedAt 时误判桌面更新 */
    updatedAt: '',
  };
}
