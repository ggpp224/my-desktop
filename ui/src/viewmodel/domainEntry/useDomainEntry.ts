/* AI 生成 By Peng.Guo */
/**
 * 交互约定：
 * - 界面任何修改 → 防抖持久化到桌面 store → 桥接写入业务页 localStorage（Domain Entry）
 * - 「本地」勾选 → 立刻改为 localhost
 * - MF local → 带端口域批量 localhost
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  IContextDomainEntryProfile,
  IDomainEntryOverride,
  IDomainMfSource,
  IMfLocalBinding,
  MfEnvId,
} from '../../domain/domainEntry/models';
import { inferMfHighlight, isLocalhostMfSource, isOverrideMfSource } from '../../domain/domainEntry/mfEcho';
import { completeRemoteEntryInput } from '../../domain/domainEntry/resolveEntryInput';
import {
  bridgeInstallUrl,
  fetchBridgeStatus,
  fetchDomainEntryBindings,
  fetchDomainEntryProfile,
  fetchDomainEntryStore,
  refreshRemoteEntry,
  saveDomainEntryProfile,
} from '../../infrastructure/domainEntry/domainEntryApi';

export type DomainEntryFeedback = { ok: boolean; message: string };

const DEFAULT_CONTEXT_ENVS: MfEnvId[] = [
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

const DEFAULT_MF_SHORTCUTS: MfEnvId[] = ['local', ...DEFAULT_CONTEXT_ENVS];
const MF_CDN_HOST = 'https://cloud.static.chanjet.com';
const AUTO_SAVE_MS = 280;

function normalizeContextEnvs(list: MfEnvId[] | undefined): MfEnvId[] {
  const filtered = (list || []).filter((e) => e && e !== 'local');
  return filtered.length ? filtered : DEFAULT_CONTEXT_ENVS;
}

function emptyProfile(contextEnv: MfEnvId): IContextDomainEntryProfile {
  return {
    contextEnv,
    enable: false,
    sources: {},
    logEnable: false,
    bridgeEnable: true,
    installCCWebHelper: false,
    isCjetProxy: false,
    proxyIp: '127.0.0.1',
    proxyPort: 7001,
    updatedAt: '',
  };
}

function buildLocalUrl(port: number): string {
  return `http://localhost:${port}/remoteEntry.js`;
}

function buildContextCdnUrl(binding: IMfLocalBinding, contextEnv: MfEnvId): string {
  const env = contextEnv === 'local' ? 'inte' : contextEnv;
  const path = binding.cdnTemplate.replace(/\$env/g, env).replace(/^\/+|\/+$/g, '');
  return `${MF_CDN_HOST}/${path}/remoteEntry.js`;
}

function hasAnyOverride(sources: Record<string, IDomainMfSource> | undefined): boolean {
  return Object.values(sources || {}).some(isOverrideMfSource);
}

function urlToSource(raw: string, binding: IMfLocalBinding | undefined): IDomainMfSource {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'follow' };
  const completed = completeRemoteEntryInput(
    trimmed || (binding?.defaultPort ? String(binding.defaultPort) : trimmed)
  );
  const portMatch = completed.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)\//i);
  if (portMatch) return { kind: 'local', value: portMatch[1] };
  const cjetMatch = completed.match(/^https?:\/\/[^/:]+:8888\/(\d+)\//i);
  if (cjetMatch) return { kind: 'local', value: cjetMatch[1] };
  const envMatch = completed.match(
    /\/(test|pre-test|inte|inte2|prod|prod2|moni|moni2|hotfix|dev|test2|f\d+)\//i
  );
  if (envMatch && binding) return { kind: 'cdn', value: envMatch[1] };
  return { kind: 'url', value: completed };
}

export function useDomainEntry(apiBase: string, addLog: (line: string) => void) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<DomainEntryFeedback | null>(null);
  const [contextEnvs, setContextEnvs] = useState<MfEnvId[]>(DEFAULT_CONTEXT_ENVS);
  const [mfShortcuts, setMfShortcuts] = useState<MfEnvId[]>(DEFAULT_MF_SHORTCUTS);
  const [enabledContexts, setEnabledContexts] = useState<string[]>([]);
  const [bindings, setBindings] = useState<IMfLocalBinding[]>([]);
  const [contextEnv, setContextEnv] = useState<MfEnvId>('inte');
  const [draft, setDraft] = useState<IContextDomainEntryProfile>(() => emptyProfile('inte'));
  const [overrides, setOverrides] = useState<IDomainEntryOverride[]>([]);
  const [persisting, setPersisting] = useState(false);
  const [bridgeHint, setBridgeHint] = useState('检查桥接中…');
  const [bridgeConnected, setBridgeConnected] = useState(false);

  const draftRef = useRef(draft);
  const contextEnvRef = useRef(contextEnv);
  const skipAutoSaveRef = useRef(false);
  draftRef.current = draft;
  contextEnvRef.current = contextEnv;

  const mfHighlight = useMemo(
    () => inferMfHighlight(draft.sources, contextEnv),
    [draft.sources, contextEnv]
  );

  const bindingByDomain = useMemo(() => {
    const map = new Map<string, IMfLocalBinding>();
    for (const b of bindings) map.set(b.mfDomain, b);
    return map;
  }, [bindings]);

  const applyProfile = useCallback(
    (profile: IContextDomainEntryProfile, nextOverrides?: IDomainEntryOverride[]) => {
      skipAutoSaveRef.current = true;
      setDraft(profile);
      if (nextOverrides) setOverrides(nextOverrides);
    },
    []
  );

  const persistDraft = useCallback(
    async (profile: IContextDomainEntryProfile, opts?: { quiet?: boolean }) => {
      if (!apiBase) return null;
      const enable = hasAnyOverride(profile.sources);
      setPersisting(true);
      try {
        const result = await saveDomainEntryProfile(apiBase, {
          contextEnv: profile.contextEnv,
          enable,
          sources: profile.sources,
          logEnable: Boolean(profile.logEnable),
          bridgeEnable: profile.bridgeEnable !== false,
          installCCWebHelper: Boolean(profile.installCCWebHelper),
          isCjetProxy: Boolean(profile.isCjetProxy),
          proxyIp: profile.proxyIp || '127.0.0.1',
          proxyPort: Number(profile.proxyPort) > 0 ? Number(profile.proxyPort) : 7001,
        });
        if (!result.success || !result.profile) {
          throw new Error(result.error || '持久化失败');
        }
        applyProfile(result.profile, result.overrides || []);
        const storeRes = await fetchDomainEntryStore(apiBase);
        if (storeRes.success) setEnabledContexts(storeRes.enabledContexts || []);
        if (!opts?.quiet) {
          setFeedback({
            ok: true,
            message: `已持久化「${result.profile.contextEnv}」→ 桥接将写入业务页 localStorage`,
          });
        }
        return result;
      } finally {
        setPersisting(false);
      }
    },
    [apiBase, applyProfile]
  );

  const loadContext = useCallback(
    async (ctx: MfEnvId) => {
      if (!apiBase) return;
      setLoading(true);
      setLoadError('');
      try {
        const [profileRes, storeRes, bindingsRes] = await Promise.all([
          fetchDomainEntryProfile(apiBase, ctx),
          fetchDomainEntryStore(apiBase),
          fetchDomainEntryBindings(apiBase),
        ]);
        if (!profileRes.success || !profileRes.profile) {
          throw new Error(profileRes.error || '读取 profile 失败');
        }
        if (!bindingsRes.success) {
          throw new Error(bindingsRes.error || '读取 bindings 失败');
        }
        setContextEnv(ctx === 'local' ? 'inte' : ctx);
        applyProfile(profileRes.profile, profileRes.overrides || []);
        const nextContexts = normalizeContextEnvs(
          profileRes.envs?.length ? profileRes.envs : bindingsRes.envs
        );
        setContextEnvs(nextContexts);
        setMfShortcuts(['local', ...nextContexts]);
        setBindings(bindingsRes.bindings || []);
        if (storeRes.success) setEnabledContexts(storeRes.enabledContexts || []);
        setFeedback({
          ok: true,
          message: profileRes.fromPage
            ? `已加载「${ctx}」（含页面回传）`
            : `已加载「${ctx}」桌面方案`,
        });
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [apiBase, applyProfile]
  );

  useEffect(() => {
    void loadContext(contextEnv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  // 桌面侧轮询桥接心跳（不是业务页轮询）：用于提示未安装/未启用
  useEffect(() => {
    if (!apiBase) return;
    let cancelled = false;
    const check = async () => {
      const st = await fetchBridgeStatus(apiBase, contextEnvRef.current || contextEnv);
      if (cancelled) return;
      setBridgeConnected(Boolean(st.connected));
      setBridgeHint(st.hint || st.error || (st.connected ? '桥接已连接' : '桥接未连接'));
    };
    void check();
    const id = window.setInterval(() => void check(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [apiBase, contextEnv]);

  // 任何草稿变更 → 防抖持久化（save 唤醒桥接 wait-sync 写入业务页 localStorage）
  useEffect(() => {
    if (!apiBase || loading) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    if (!draft.contextEnv) return;
    const timer = window.setTimeout(() => {
      void persistDraft(draft, { quiet: true }).catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        setFeedback({ ok: false, message });
        addLog(`[domain-entry] 自动持久化失败: ${message}`);
      });
    }, AUTO_SAVE_MS);
    return () => window.clearTimeout(timer);
  }, [apiBase, draft, loading, persistDraft, addLog]);

  const openBridgeInstall = useCallback(() => {
    if (!apiBase) return;
    window.open(bridgeInstallUrl(apiBase), '_blank');
  }, [apiBase]);

  const selectContext = useCallback(
    async (ctx: MfEnvId) => {
      if (ctx === contextEnv) return;
      setBusy(true);
      setFeedback(null);
      try {
        await persistDraft(draftRef.current, { quiet: true });
        await loadContext(ctx);
      } catch (e) {
        setFeedback({ ok: false, message: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusy(false);
      }
    },
    [contextEnv, loadContext, persistDraft]
  );

  /** 「本地」勾选 → 立刻 localhost */
  const setLocalChecked = useCallback(
    (domain: string, checked: boolean) => {
      const binding = bindingByDomain.get(domain);
      setDraft((prev) => {
        const next = { ...prev.sources };
        if (!checked) {
          next[domain] = { kind: 'follow' };
        } else {
          const port = binding?.defaultPort || 0;
          if (port > 0) {
            next[domain] = { kind: 'local', value: String(port) };
          } else {
            next[domain] = { kind: 'url', value: 'http://localhost:8080/remoteEntry.js' };
          }
        }
        return { ...prev, sources: next, enable: hasAnyOverride(next) };
      });
    },
    [bindingByDomain]
  );

  const getDisplayUrl = useCallback(
    (domain: string): string => {
      const binding = bindingByDomain.get(domain);
      const source = draft.sources[domain];
      if (source?.kind === 'local') {
        const port = Number(source.value) || binding?.defaultPort || 0;
        return port > 0 ? buildLocalUrl(port) : '';
      }
      if (source?.kind === 'url' && source.value) return source.value;
      if (source?.kind === 'cdn' && binding) {
        return buildContextCdnUrl(binding, source.value || contextEnv);
      }
      if (binding) return buildContextCdnUrl(binding, contextEnv);
      return '';
    },
    [bindingByDomain, draft.sources, contextEnv]
  );

  const updateDisplayUrl = useCallback((domain: string, raw: string) => {
    setDraft((prev) => {
      const sources = {
        ...prev.sources,
        [domain]: { kind: 'url' as const, value: raw },
      };
      return { ...prev, sources, enable: hasAnyOverride(sources) };
    });
  }, []);

  const commitDisplayUrl = useCallback(
    (domain: string, raw: string) => {
      const binding = bindingByDomain.get(domain);
      setDraft((prev) => {
        const sources = {
          ...prev.sources,
          [domain]: urlToSource(raw, binding),
        };
        return { ...prev, sources, enable: hasAnyOverride(sources) };
      });
    },
    [bindingByDomain]
  );

  const applyMfShortcut = useCallback(
    (mf: string) => {
      if (mf === 'local') {
        setDraft((prev) => {
          const sources: Record<string, IDomainMfSource> = { ...prev.sources };
          for (const b of bindings) {
            if (b.defaultPort > 0) {
              sources[b.mfDomain] = { kind: 'local', value: String(b.defaultPort) };
            }
          }
          return { ...prev, sources, enable: hasAnyOverride(sources) };
        });
        setFeedback({ ok: true, message: '已批量：带端口域 → localhost（自动持久化中）' });
        return;
      }
      if (mf !== contextEnv) {
        void selectContext(mf as MfEnvId);
        return;
      }
      setDraft((prev) => {
        const sources: Record<string, IDomainMfSource> = {};
        for (const b of bindings) {
          sources[b.mfDomain] = { kind: 'follow' };
        }
        return { ...prev, sources, enable: false };
      });
      setFeedback({ ok: true, message: '已取消覆盖，跟本境 CDN（自动持久化中）' });
    },
    [bindings, contextEnv, selectContext]
  );

  const refreshRemoteEntryNow = useCallback(async () => {
    if (!apiBase) return;
    setBusy(true);
    setFeedback(null);
    try {
      const st = await fetchBridgeStatus(apiBase, contextEnv);
      setBridgeConnected(Boolean(st.connected));
      setBridgeHint(st.hint || st.error || '');
      if (!st.connected) {
        setFeedback({
          ok: false,
          message: `桥接未连接，无法刷新业务页 RemoteEntry。请安装桥接 v1.8.10+ 并硬刷业务页`,
        });
        return;
      }
      const result = await refreshRemoteEntry(apiBase, contextEnv);
      if (!result.success) throw new Error(result.error || '刷新失败');
      setFeedback({
        ok: true,
        message: `已通知桥接刷新 RemoteEntry「${contextEnv}」：业务页将自动 reload（打散 ?timestamp 缓存）`,
      });
      addLog(`[domain-entry] refresh RemoteEntry context=${contextEnv}`);
    } catch (e) {
      setFeedback({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [apiBase, contextEnv, addLog]);

  const setLogEnable = useCallback((checked: boolean) => {
    setDraft((prev) => ({ ...prev, logEnable: checked }));
  }, []);

  const setBridgeEnable = useCallback((checked: boolean) => {
    setDraft((prev) => ({ ...prev, bridgeEnable: checked }));
  }, []);

  const setInstallCCWebHelper = useCallback((checked: boolean) => {
    setDraft((prev) => ({ ...prev, installCCWebHelper: checked }));
  }, []);

  const setIsCjetProxy = useCallback((checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      isCjetProxy: checked,
      proxyIp: prev.proxyIp || '127.0.0.1',
      proxyPort: Number(prev.proxyPort) > 0 ? Number(prev.proxyPort) : 7001,
    }));
  }, []);

  const setProxyIp = useCallback((raw: string) => {
    setDraft((prev) => ({ ...prev, proxyIp: raw.trim() || '127.0.0.1' }));
  }, []);

  const setProxyPort = useCallback((raw: string) => {
    const n = Number(String(raw || '').trim());
    setDraft((prev) => ({
      ...prev,
      proxyPort: Number.isFinite(n) && n > 0 && n < 65536 ? Math.floor(n) : 7001,
    }));
  }, []);

  const isDomainLocal = useCallback(
    (domain: string) => isLocalhostMfSource(draft.sources[domain]),
    [draft.sources]
  );

  const getDomainLabel = useCallback((domain: string): string => domain, []);

  const isDomainUrlEditable = useCallback((_domain: string) => true, []);

  return {
    loading,
    busy: busy || persisting,
    loadError,
    feedback,
    envs: contextEnvs,
    contextEnvs,
    mfShortcuts,
    enabledContexts,
    bindings,
    contextEnv,
    draft,
    overrides,
    mfHighlight,
    selectContext,
    setLocalChecked,
    setLogEnable,
    setBridgeEnable,
    setInstallCCWebHelper,
    setIsCjetProxy,
    setProxyIp,
    setProxyPort,
    isDomainLocal,
    getDomainLabel,
    isDomainUrlEditable,
    getDisplayUrl,
    updateDisplayUrl,
    commitDisplayUrl,
    applyMfShortcut,
    openBridgeInstall,
    bridgeConnected,
    bridgeHint,
    refreshRemoteEntryNow,
  };
}
