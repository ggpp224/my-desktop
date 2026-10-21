/* AI 生成 By Peng.Guo */
import type {
  IContextDomainEntryProfile,
  IDomainEntryApplyResponse,
  IDomainEntryBindingsResponse,
  IDomainEntryExportResponse,
  IDomainEntryProfileResponse,
  IDomainEntryStoreResponse,
  MfEnvId,
} from '../../domain/domainEntry/models';

export async function fetchDomainEntryStore(apiBase: string): Promise<IDomainEntryStoreResponse> {
  const res = await fetch(`${apiBase}/domain-entry/store`);
  const data = (await res.json().catch(() => null)) as IDomainEntryStoreResponse | null;
  if (data && typeof data.success === 'boolean') return data;
  return { success: false, error: `读取 store 失败: ${res.status}` };
}

export async function fetchDomainEntryProfile(
  apiBase: string,
  contextEnv: MfEnvId
): Promise<IDomainEntryProfileResponse> {
  const res = await fetch(`${apiBase}/domain-entry/profile?context=${encodeURIComponent(contextEnv)}`);
  const data = (await res.json().catch(() => null)) as IDomainEntryProfileResponse | null;
  if (data && typeof data.success === 'boolean') return data;
  return { success: false, error: `读取 profile 失败: ${res.status}` };
}

export async function fetchDomainEntryBindings(apiBase: string): Promise<IDomainEntryBindingsResponse> {
  const res = await fetch(`${apiBase}/domain-entry/bindings`);
  const data = (await res.json().catch(() => null)) as IDomainEntryBindingsResponse | null;
  if (data && typeof data.success === 'boolean') return data;
  return { success: false, error: `读取 bindings 失败: ${res.status}` };
}

export async function saveDomainEntryProfile(
  apiBase: string,
  profile: Pick<
    IContextDomainEntryProfile,
    | 'contextEnv'
    | 'enable'
    | 'sources'
    | 'logEnable'
    | 'bridgeEnable'
    | 'installCCWebHelper'
    | 'isCjetProxy'
    | 'proxyIp'
    | 'proxyPort'
  >
): Promise<IDomainEntryProfileResponse> {
  const res = await fetch(`${apiBase}/domain-entry/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  const data = (await res.json().catch(() => null)) as IDomainEntryProfileResponse | null;
  if (data && typeof data.success === 'boolean') return data;
  return { success: false, error: `保存失败: ${res.status}` };
}

export async function applyShellLocal(
  apiBase: string,
  contextEnv: MfEnvId
): Promise<IDomainEntryApplyResponse> {
  const res = await fetch(`${apiBase}/domain-entry/apply-shell-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextEnv }),
  });
  const data = (await res.json().catch(() => null)) as IDomainEntryApplyResponse | null;
  if (data && typeof data.success === 'boolean') return data;
  return { success: false, error: `应用失败: ${res.status}` };
}

export async function resetDomainEntry(
  apiBase: string,
  contextEnv: MfEnvId
): Promise<IDomainEntryApplyResponse> {
  const res = await fetch(`${apiBase}/domain-entry/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextEnv }),
  });
  const data = (await res.json().catch(() => null)) as IDomainEntryApplyResponse | null;
  if (data && typeof data.success === 'boolean') return data;
  return { success: false, error: `重置失败: ${res.status}` };
}

export async function exportPageConfig(
  apiBase: string,
  contextEnv: MfEnvId
): Promise<IDomainEntryExportResponse> {
  const res = await fetch(
    `${apiBase}/domain-entry/export/page-config?context=${encodeURIComponent(contextEnv)}`
  );
  const data = (await res.json().catch(() => null)) as IDomainEntryExportResponse | null;
  if (data && typeof data.success === 'boolean') return data;
  return { success: false, error: `导出失败: ${res.status}` };
}

export async function fetchDomainEntrySync(
  apiBase: string,
  contextEnv: MfEnvId
): Promise<{
  success: boolean;
  pushToPage?: boolean;
  pageEcho?: {
    contextEnv: string;
    profile: IContextDomainEntryProfile;
    updatedAt: string;
    config?: unknown;
  } | null;
  storeUpdatedAt?: string;
  pageUpdatedAt?: string;
  error?: string;
}> {
  const res = await fetch(`${apiBase}/domain-entry/sync?context=${encodeURIComponent(contextEnv)}`);
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    pushToPage?: boolean;
    pageEcho?: {
      contextEnv: string;
      profile: IContextDomainEntryProfile;
      updatedAt: string;
      config?: unknown;
    } | null;
    storeUpdatedAt?: string;
    pageUpdatedAt?: string;
    error?: string;
  } | null;
  if (data && typeof data.success === 'boolean') return data as {
    success: boolean;
    pushToPage?: boolean;
    pageEcho?: {
      contextEnv: string;
      profile: IContextDomainEntryProfile;
      updatedAt: string;
      config?: unknown;
    } | null;
    storeUpdatedAt?: string;
    pageUpdatedAt?: string;
    error?: string;
  };
  return { success: false, error: `同步查询失败: ${res.status}` };
}

export async function fetchBridgeStatus(
  apiBase: string,
  contextEnv: MfEnvId
): Promise<{
  success: boolean;
  connected?: boolean;
  staleMs?: number;
  lastSeenAt?: string;
  pageHost?: string;
  bridgeVersion?: string;
  hint?: string;
  error?: string;
}> {
  const res = await fetch(
    `${apiBase}/domain-entry/bridge-status?context=${encodeURIComponent(contextEnv)}`
  );
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    connected?: boolean;
    staleMs?: number;
    lastSeenAt?: string;
    pageHost?: string;
    bridgeVersion?: string;
    hint?: string;
    error?: string;
  } | null;
  if (data && typeof data.success === 'boolean') return data;
  return { success: false, error: `桥接状态失败: ${res.status}` };
}

export function bridgeInstallUrl(apiBase: string): string {
  return `${apiBase.replace(/\/$/, '')}/domain-entry/bridge.user.js`;
}

/** 桌面「刷新 RemoteEntry」：唤醒桥接，业务页 reload 打散缓存 */
export async function refreshRemoteEntry(
  apiBase: string,
  contextEnv: MfEnvId
): Promise<{ success: boolean; requestedAt?: string; error?: string }> {
  const res = await fetch(`${apiBase}/domain-entry/refresh-remote-entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextEnv }),
  });
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    requestedAt?: string;
    error?: string;
  } | null;
  if (data && typeof data.success === 'boolean') {
    return { success: data.success, requestedAt: data.requestedAt, error: data.error };
  }
  return { success: false, error: `刷新 RemoteEntry 失败: ${res.status}` };
}

/** 手动导入页面 Domain Entry JSON → page-echo（桥接未通时的兜底） */
export async function importPageEchoFromPageConfigJson(
  apiBase: string,
  contextEnv: MfEnvId,
  config: unknown,
  pageHost?: string
): Promise<{ success: boolean; echo?: unknown; error?: string }> {
  const res = await fetch(`${apiBase}/domain-entry/page-echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextEnv, config, pageHost }),
  });
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    echo?: unknown;
    error?: string;
  } | null;
  if (data && data.success) return { success: true, echo: data.echo };
  return { success: false, error: (data && data.error) || `导入失败: ${res.status}` };
}
