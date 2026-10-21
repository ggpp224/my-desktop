/* AI 生成 By Peng.Guo */
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMfDomainBindings } from '../config/mf-domain-bindings.js';
import type {
  IDomainEntryPageConfig,
  ICompileDomainEntryParams,
  IContextDomainEntryProfile,
  IDomainEntryStore,
  IDomainMfSource,
  MfEnvId,
} from '../tools/domain-entry/declare.js';
import {
  buildShellLocalSources,
  compileContextProfile,
  compileDomainEntryProfile,
  createEmptyContextProfile,
  DEFAULT_CJET_PROXY_IP,
  MF_CONTEXT_ENVS,
} from '../tools/domain-entry/profile-compiler.js';
import {
  DOMAIN_ENTRY_STORAGE_KEY,
  pageConfigToContextProfile,
  contextProfileToPageConfig,
  hasDebugFlags,
  hasOverrideSources,
  normalizeProxyPort,
} from '../tools/domain-entry/storage-contract.js';

/**
 * 必须用 process.cwd()（项目根），不能用 import.meta 相对 dist/server：
 * Electron 跑的是 dist/server/api.js，相对路径会落到 dist/runtime，和源码 runtime 分裂。
 */
const PROFILE_DIR = path.resolve(process.cwd(), 'runtime', 'domain-entry');
const STORE_PATH = path.join(PROFILE_DIR, 'store.json');
const PAGE_ECHO_PATH = path.join(PROFILE_DIR, 'page-echo.json');
const HEARTBEAT_PATH = path.join(PROFILE_DIR, 'bridge-heartbeat.json');
/** 旧单 profile 路径，启动时迁移 */
const LEGACY_PROFILE_PATH = path.join(PROFILE_DIR, 'current-profile.json');
const DIST_LEGACY_DIR = path.resolve(process.cwd(), 'dist', 'runtime', 'domain-entry');

/**
 * 桥接用长轮询（~25s）保活；超时窗口需大于一轮 wait + 网络抖动。
 * 超过该时间无心跳 → 视为未连接。
 */
export const BRIDGE_STALE_MS = 60_000;

/** 桥接 wait-sync 默认挂起时长 */
export const DEFAULT_WAIT_SYNC_MS = 25_000;
export const MAX_WAIT_SYNC_MS = 30_000;

/** 桌面 save / 刷新 RemoteEntry 后唤醒 wait-sync 等待者（按 contextEnv） */
const domainEntryChangeBus = new EventEmitter();
domainEntryChangeBus.setMaxListeners(100);

/** 待消费的「刷新 RemoteEntry」请求（桥接 wait-sync 取走并 location.reload） */
const pendingRemoteEntryReload = new Map<string, string>();

function notifyDomainEntryChanged(contextEnv: string): void {
  const env = String(contextEnv || '').trim();
  if (!env) return;
  domainEntryChangeBus.emit(`change:${env}`);
}

function hasPendingRemoteEntryReload(contextEnv: string): boolean {
  return pendingRemoteEntryReload.has(String(contextEnv || '').trim());
}

function takeRemoteEntryReload(contextEnv: string): boolean {
  const env = String(contextEnv || '').trim();
  if (!env || !pendingRemoteEntryReload.has(env)) return false;
  pendingRemoteEntryReload.delete(env);
  return true;
}

/**
 * 桌面「刷新 RemoteEntry」：唤醒桥接，业务页 reload 后 domainEntry.js 会带新 ?timestamp。
 */
export function requestRemoteEntryRefresh(contextEnv: string): { contextEnv: string; requestedAt: string } {
  const env = String(contextEnv || '').trim();
  if (!env) throw new Error('缺少 contextEnv');
  const requestedAt = nowIso();
  pendingRemoteEntryReload.set(env, requestedAt);
  notifyDomainEntryChanged(env);
  return { contextEnv: env, requestedAt };
}

export interface IDomainEntryPageEcho {
  contextEnv: string;
  config: IDomainEntryPageConfig;
  profile: IContextDomainEntryProfile;
  pageHost?: string;
  updatedAt: string;
}

export interface IBridgeHeartbeat {
  contextEnv: string;
  pageHost?: string;
  bridgeVersion?: string;
  updatedAt: string;
}

export interface IBridgeStatus {
  connected: boolean;
  staleMs: number;
  lastSeenAt?: string;
  pageHost?: string;
  bridgeVersion?: string;
  hint: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyStore(): IDomainEntryStore {
  return { version: 2, profiles: {} };
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
}

/** 把误写到 dist/runtime 的文件迁到项目 runtime（一次性） */
async function migrateDistRuntimeIfNeeded(): Promise<void> {
  await ensureDir();
  for (const name of ['store.json', 'page-echo.json', 'current-profile.json'] as const) {
    const dest = path.join(PROFILE_DIR, name);
    const src = path.join(DIST_LEGACY_DIR, name);
    try {
      await fs.access(dest);
      continue;
    } catch {
      /* dest missing */
    }
    try {
      await fs.copyFile(src, dest);
    } catch {
      /* src missing */
    }
  }
}

function normalizeContextProfile(
  contextEnv: MfEnvId,
  input: Partial<IContextDomainEntryProfile>
): IContextDomainEntryProfile {
  const sources: Record<string, IDomainMfSource> = {};
  for (const [domain, src] of Object.entries(input.sources || {})) {
    if (!src || typeof src !== 'object') continue;
    const kind = src.kind || 'follow';
    sources[domain] = {
      kind,
      value: src.value != null ? String(src.value) : undefined,
    };
  }
  const proxyIpRaw = input.proxyIp != null ? String(input.proxyIp).trim() : DEFAULT_CJET_PROXY_IP;
  // enable 由是否有覆盖推导：改即覆盖，无需用户勾选
  return {
    contextEnv,
    enable: hasOverrideSources(sources),
    sources,
    logEnable: Boolean(input.logEnable),
    bridgeEnable: input.bridgeEnable !== false,
    installCCWebHelper: Boolean(input.installCCWebHelper),
    isCjetProxy: Boolean(input.isCjetProxy),
    proxyIp: proxyIpRaw || DEFAULT_CJET_PROXY_IP,
    proxyPort: normalizeProxyPort(input.proxyPort),
    updatedAt: nowIso(),
  };
}

async function migrateLegacyIfNeeded(): Promise<IDomainEntryStore | null> {
  try {
    const raw = await fs.readFile(LEGACY_PROFILE_PATH, 'utf8');
    const legacy = JSON.parse(raw) as {
      env?: string;
      enable?: boolean;
      overrides?: Array<{ domain: string; remoteEntryUrl: string; source?: string }>;
    };
    const contextEnv = (legacy.env || 'local') as MfEnvId;
    const sources: Record<string, IDomainMfSource> = {};
    for (const o of legacy.overrides || []) {
      if (!o?.domain || !o.remoteEntryUrl) continue;
      const url = o.remoteEntryUrl;
      const portMatch = url.match(/^https?:\/\/localhost:(\d+)\//i);
      if (portMatch) {
        sources[o.domain] = { kind: 'local', value: portMatch[1] };
      } else {
        sources[o.domain] = { kind: 'url', value: url.split('?')[0] };
      }
    }
    const store: IDomainEntryStore = {
      version: 2,
      profiles: {
        [contextEnv]: {
          contextEnv,
          enable: Boolean(legacy.enable),
          sources,
          updatedAt: nowIso(),
        },
      },
    };
    await ensureDir();
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
    try {
      await fs.rename(LEGACY_PROFILE_PATH, `${LEGACY_PROFILE_PATH}.migrated`);
    } catch {
      /* ignore */
    }
    return store;
  } catch {
    return null;
  }
}

export async function getDomainEntryStore(): Promise<IDomainEntryStore> {
  await migrateDistRuntimeIfNeeded();
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as IDomainEntryStore;
    if (!parsed || parsed.version !== 2 || typeof parsed.profiles !== 'object') {
      return emptyStore();
    }
    return { version: 2, profiles: parsed.profiles || {} };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      const migrated = await migrateLegacyIfNeeded();
      return migrated || emptyStore();
    }
    throw err;
  }
}

async function saveStore(store: IDomainEntryStore): Promise<IDomainEntryStore> {
  await ensureDir();
  const normalized: IDomainEntryStore = { version: 2, profiles: store.profiles || {} };
  await fs.writeFile(STORE_PATH, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

export async function getContextProfile(contextEnv: MfEnvId): Promise<IContextDomainEntryProfile> {
  const store = await getDomainEntryStore();
  return store.profiles[contextEnv] || createEmptyContextProfile(contextEnv);
}

export async function saveContextProfile(
  input: Partial<IContextDomainEntryProfile> & { contextEnv: MfEnvId }
): Promise<IContextDomainEntryProfile> {
  const contextEnv = String(input.contextEnv || '').trim() as MfEnvId;
  if (!contextEnv) throw new Error('缺少 contextEnv');
  const profile = normalizeContextProfile(contextEnv, input);
  // 校验可编译
  compileContextProfile(profile);
  const store = await getDomainEntryStore();
  store.profiles[contextEnv] = profile;
  await saveStore(store);
  notifyDomainEntryChanged(contextEnv);
  return profile;
}

export function listDomainEntryBindings() {
  return getMfDomainBindings().map((b) => ({ ...b }));
}

export function listDomainEntryEnvs(): readonly MfEnvId[] {
  return MF_CONTEXT_ENVS;
}

export function compileDomainEntry(params: ICompileDomainEntryParams) {
  return compileDomainEntryProfile(params);
}

/** 快捷：某业务环境下，有端口的域切到 local 并启用 */
export async function applyShellLocalForContext(
  contextEnv: MfEnvId
): Promise<{ profile: IContextDomainEntryProfile; bootstrap: IDomainEntryPageConfig }> {
  const profile = await saveContextProfile({
    contextEnv,
    enable: true,
    sources: buildShellLocalSources(),
  });
  return { profile, bootstrap: contextProfileToPageConfig(profile) };
}

export async function resetContextProfile(
  contextEnv: MfEnvId
): Promise<{ profile: IContextDomainEntryProfile; bootstrap: IDomainEntryPageConfig }> {
  const profile = await saveContextProfile(createEmptyContextProfile(contextEnv));
  return { profile, bootstrap: contextProfileToPageConfig(profile) };
}

export async function exportPageConfig(contextEnv?: MfEnvId): Promise<{
  key: string;
  contextEnv: string;
  config: IDomainEntryPageConfig;
}> {
  const env = (contextEnv || 'local') as MfEnvId;
  const profile = await getContextProfile(env);
  return {
    key: DOMAIN_ENTRY_STORAGE_KEY,
    contextEnv: env,
    config: contextProfileToPageConfig(profile),
  };
}

/**
 * 桥接用：按页面业务环境取对应 profile。
 * 无覆盖 → enable:false（实时 sync 见 resolveLiveSync）。
 */
export async function getDomainEntryBootstrap(contextEnv?: string): Promise<IDomainEntryPageConfig> {
  const env = String(contextEnv || '').trim();
  if (!env) {
    return { enable: false, current: 'local', domainEntry: {} };
  }
  const profile = await getContextProfile(env as MfEnvId);
  const cfg = contextProfileToPageConfig(profile);
  return { ...cfg, updatedAt: profile.updatedAt };
}

type IPageEchoStore = Record<string, IDomainEntryPageEcho>;

async function readPageEchoStore(): Promise<IPageEchoStore> {
  try {
    const raw = await fs.readFile(PAGE_ECHO_PATH, 'utf8');
    const parsed = JSON.parse(raw) as IPageEchoStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return {};
    throw err;
  }
}

async function writePageEchoStore(store: IPageEchoStore): Promise<void> {
  await ensureDir();
  await fs.writeFile(PAGE_ECHO_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function fingerprintPageConfig(config: IDomainEntryPageConfig): string {
  const isCjetProxy = Boolean(config.isCjetProxy);
  return JSON.stringify({
    enable: Boolean(config.enable),
    current: String(config.current || ''),
    domainEntry: config.domainEntry || {},
    logEnable: Boolean(config.logEnable),
    bridgeEnable: config.bridgeEnable !== false,
    installCCWebHelper: Boolean(config.installCCWebHelper),
    isCjetProxy,
    proxyIp: isCjetProxy ? String(config.proxyIp || '') : '',
    proxyPort: isCjetProxy ? Number(config.proxyPort) || 0 : 0,
  });
}

/** 业务页桥接回传：保存页面真实 localStorage，供桌面回显 */
export async function savePageEcho(input: {
  contextEnv: string;
  config: IDomainEntryPageConfig;
  pageHost?: string;
}): Promise<IDomainEntryPageEcho> {
  const contextEnv = String(input.contextEnv || '').trim();
  if (!contextEnv) throw new Error('缺少 contextEnv');
  const config = input.config || { enable: false, current: 'local', domainEntry: {} };
  const normalized: IDomainEntryPageConfig = {
    enable: Boolean(config.enable),
    current: String(config.current || 'local'),
    domainEntry: { ...(config.domainEntry || {}) },
  };
  const store = await readPageEchoStore();
  const prev = store[contextEnv];
  // 内容未变则不刷新 updatedAt，避免桥接回传把桌面推送判定挤掉
  const same =
    prev && fingerprintPageConfig(prev.config) === fingerprintPageConfig(normalized);
  const profile = pageConfigToContextProfile(contextEnv, normalized);
  const echo: IDomainEntryPageEcho = {
    contextEnv,
    config: normalized,
    profile,
    pageHost: input.pageHost ? String(input.pageHost) : prev?.pageHost,
    updatedAt: same && prev ? prev.updatedAt : nowIso(),
  };
  store[contextEnv] = echo;
  await writePageEchoStore(store);
  return echo;
}

export async function getPageEcho(contextEnv: string): Promise<IDomainEntryPageEcho | null> {
  const env = String(contextEnv || '').trim();
  if (!env) return null;
  const store = await readPageEchoStore();
  return store[env] || null;
}

type IHeartbeatStore = Record<string, IBridgeHeartbeat>;

async function readHeartbeatStore(): Promise<IHeartbeatStore> {
  try {
    const raw = await fs.readFile(HEARTBEAT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as IHeartbeatStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return {};
    throw err;
  }
}

/** 桥接存活心跳（与 page-echo 分离，避免抬时间戳） */
export async function saveBridgeHeartbeat(input: {
  contextEnv: string;
  pageHost?: string;
  bridgeVersion?: string;
}): Promise<IBridgeHeartbeat> {
  const contextEnv = String(input.contextEnv || '').trim();
  if (!contextEnv) throw new Error('缺少 contextEnv');
  await ensureDir();
  const store = await readHeartbeatStore();
  const hb: IBridgeHeartbeat = {
    contextEnv,
    pageHost: input.pageHost ? String(input.pageHost) : undefined,
    bridgeVersion: input.bridgeVersion ? String(input.bridgeVersion) : undefined,
    updatedAt: nowIso(),
  };
  store[contextEnv] = hb;
  await fs.writeFile(HEARTBEAT_PATH, JSON.stringify(store, null, 2), 'utf8');
  return hb;
}

export async function getBridgeStatus(contextEnv: string): Promise<IBridgeStatus> {
  const env = String(contextEnv || '').trim();
  if (!env) {
    return {
      connected: false,
      staleMs: Number.POSITIVE_INFINITY,
      hint: '缺少 context',
    };
  }
  const store = await readHeartbeatStore();
  const hb = store[env];
  if (!hb?.updatedAt) {
    return {
      connected: false,
      staleMs: Number.POSITIVE_INFINITY,
      hint: '桥接未连接：请安装 bridges/ccweb-desktop-bridge.user.js 并硬刷业务页',
    };
  }
  const staleMs = Math.max(0, Date.now() - timeMs(hb.updatedAt));
  const connected = staleMs <= BRIDGE_STALE_MS;
  return {
    connected,
    staleMs,
    lastSeenAt: hb.updatedAt,
    pageHost: hb.pageHost,
    bridgeVersion: hb.bridgeVersion,
    hint: connected
      ? `桥接已连接（${hb.bridgeVersion || 'unknown'} @ ${hb.pageHost || env}）`
      : `桥接超时 ${Math.round(staleMs / 1000)}s：请确认油猴脚本已启用并硬刷业务页`,
  };
}

function timeMs(iso: string | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * 打开/刷新某业务环境时的回显：按 updatedAt 取较新一侧（页面 echo vs 桌面 store）。
 */
export async function resolveContextEcho(contextEnv: MfEnvId): Promise<{
  profile: IContextDomainEntryProfile;
  overrides: ReturnType<typeof compileContextProfile>;
  fromPage: boolean;
  pageUpdatedAt?: string;
}> {
  const stored = await getContextProfile(contextEnv);
  const echo = await getPageEcho(contextEnv);
  const pageNewer = Boolean(echo && timeMs(echo.updatedAt) > timeMs(stored.updatedAt));
  const pageHasOverrides = Boolean(echo && Object.keys(echo.profile?.sources || {}).length > 0);

  if (echo && pageHasOverrides && (pageNewer || !stored.enable || !stored.updatedAt)) {
    return {
      profile: { ...echo.profile, contextEnv },
      overrides: compileContextProfile({ ...echo.profile, contextEnv }),
      fromPage: true,
      pageUpdatedAt: echo.updatedAt,
    };
  }
  return {
    profile: stored,
    overrides: compileContextProfile(stored),
    fromPage: false,
  };
}

export interface IDomainEntryLiveSync {
  /** 桌面比页面新 → 桥接应写入页面 */
  pushToPage: boolean;
  config: IDomainEntryPageConfig;
  pageEcho: IDomainEntryPageEcho | null;
  storeUpdatedAt: string;
  pageUpdatedAt?: string;
}

/**
 * 双向实时同步裁决：
 * - 桌面有 updatedAt 且（比 page-echo 新，或内容与页面不一致）→ pushToPage
 * - 否则仅返回 pageEcho 供桌面回显
 */
export async function resolveLiveSync(contextEnv: string): Promise<IDomainEntryLiveSync> {
  const env = String(contextEnv || '').trim() as MfEnvId;
  if (!env) {
    return {
      pushToPage: false,
      config: { enable: false, current: 'local', domainEntry: {} },
      pageEcho: null,
      storeUpdatedAt: '',
    };
  }
  await migrateDistRuntimeIfNeeded();
  const stored = await getContextProfile(env);
  const echo = await getPageEcho(env);
  const base = contextProfileToPageConfig(stored);
  const hasOverrides = hasOverrideSources(stored.sources) || Boolean(base.enable);
  const debugOn = hasDebugFlags(stored) || hasDebugFlags(base);
  const config: IDomainEntryPageConfig = {
    ...base,
    updatedAt: stored.updatedAt,
    // syncClear 已由 contextProfileToPageConfig 按「无覆盖且无调试开关」算出
  };

  if (!stored.updatedAt) {
    return {
      pushToPage: false,
      config,
      pageEcho: echo,
      storeUpdatedAt: '',
      pageUpdatedAt: echo?.updatedAt,
    };
  }

  if (!echo) {
    return {
      pushToPage: hasOverrides || debugOn || Object.keys(stored.sources || {}).length > 0,
      config,
      pageEcho: null,
      storeUpdatedAt: stored.updatedAt,
    };
  }

  // 严格大于：同毫秒内「先 reset 再 echo」不应误判桌面更新（否则空方案会冲掉页面回传）
  const storeNewer = timeMs(stored.updatedAt) > timeMs(echo.updatedAt);
  const contentDiffers = fingerprintPageConfig(echo.config) !== fingerprintPageConfig(config);
  // 桌面更新过，且时间更新或内容与页面不一致 → 必须推（修复：回传 echo 抬时间戳导致永远不推）
  const pushToPage = storeNewer || ((hasOverrides || debugOn) && contentDiffers);

  return {
    pushToPage,
    config,
    pageEcho: echo,
    storeUpdatedAt: stored.updatedAt,
    pageUpdatedAt: echo.updatedAt,
  };
}

export interface IDomainEntryWaitSync extends IDomainEntryLiveSync {
  /** storeUpdatedAt 相对 since 是否已前进（含首次空 since） */
  changed: boolean;
  /** 等待期内无 save，因超时返回 */
  timedOut: boolean;
  /** 桌面点了「刷新 RemoteEntry」，桥接应 location.reload() */
  reloadPage: boolean;
}

/**
 * 长轮询：since 之后若桌面 profile 有变更则立即返回；否则挂起至超时。
 * 桥接用此接口替代固定间隔轮询「默认不吵，有变更再推」。
 */
export async function waitForLiveSync(
  contextEnv: string,
  sinceIso: string,
  timeoutMs: number = DEFAULT_WAIT_SYNC_MS
): Promise<IDomainEntryWaitSync> {
  const env = String(contextEnv || '').trim();
  const since = timeMs(sinceIso);
  const waitMs = Math.min(
    MAX_WAIT_SYNC_MS,
    Math.max(1_000, Number(timeoutMs) || DEFAULT_WAIT_SYNC_MS)
  );

  const sync0 = await resolveLiveSync(env);
  if (timeMs(sync0.storeUpdatedAt) > since || hasPendingRemoteEntryReload(env)) {
    return {
      ...sync0,
      changed: timeMs(sync0.storeUpdatedAt) > since,
      timedOut: false,
      reloadPage: takeRemoteEntryReload(env),
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      domainEntryChangeBus.off(`change:${env}`, onChange);
      void resolveLiveSync(env).then((sync) => {
        resolve({
          ...sync,
          changed: timeMs(sync.storeUpdatedAt) > since,
          timedOut,
          reloadPage: takeRemoteEntryReload(env),
        });
      });
    };
    const onChange = () => finish(false);
    const timer = setTimeout(() => finish(true), waitMs);
    domainEntryChangeBus.on(`change:${env}`, onChange);
  });
}

/** 预览某 context 编译出的 overrides */
export function previewContextOverrides(profile: IContextDomainEntryProfile) {
  return compileContextProfile(profile);
}
