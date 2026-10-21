/* AI 生成 By Peng.Guo */
import type { AppThemeTokens } from '../domain/theme/appTheme';
import { useDomainEntry } from '../viewmodel/domainEntry/useDomainEntry';
import { Button } from './Button';
import { IconButton } from './IconButton';

const HELP_TIP =
  '修改自动持久化；须油猴桥接 v1.8.10。「启用桥接」默认开，关掉后不再改页面 LS，可只用 cc-helper。「安装助手」写 ccweb-helper-enable。硬刷后生效。';

interface DomainEntryPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
  themeTokens: AppThemeTokens;
}

function TipIcon(props: {
  themeTokens: AppThemeTokens;
  title: string;
  ariaLabel: string;
  color?: string;
  onClick?: () => void;
  children: string;
}) {
  return (
    <IconButton
      themeTokens={props.themeTokens}
      size="icon"
      variant="ghost"
      title={props.title}
      ariaLabel={props.ariaLabel}
      onClick={props.onClick}
      style={{ width: 22, height: 22, minWidth: 22, borderRadius: 4 }}
      icon={
        <span style={{ fontSize: 12, lineHeight: 1, color: props.color || undefined, fontWeight: 600 }}>
          {props.children}
        </span>
      }
    />
  );
}

export function DomainEntryPanel({ apiBase, addLog, themeTokens }: DomainEntryPanelProps) {
  const {
    loading,
    busy,
    loadError,
    feedback,
    contextEnvs,
    mfShortcuts,
    enabledContexts,
    bindings,
    contextEnv,
    draft,
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
  } = useDomainEntry(apiBase, addLog);

  const chipStyle = (active: boolean) =>
    ({
      border: `1px solid ${active ? themeTokens.tabActiveBorder : themeTokens.tabInactiveBorder}`,
      background: active ? themeTokens.tabActiveBackground : themeTokens.tabInactiveBackground,
      color: active ? themeTokens.tabActiveText : themeTokens.textPrimary,
      borderRadius: 6,
      padding: '4px 10px',
      cursor: busy ? 'not-allowed' : 'pointer',
      fontSize: 12,
    }) as const;

  const statusTip = loadError
    ? loadError
    : loading
      ? '加载中…'
      : feedback
        ? feedback.message
        : '';

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: themeTokens.appBackground,
        color: themeTokens.textPrimary,
        padding: '8px 12px',
        boxSizing: 'border-box',
        gap: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'nowrap',
          height: 22,
          minHeight: 22,
        }}
      >
        <TipIcon themeTokens={themeTokens} title="MF 联调 / Domain Entry" ariaLabel="MF 联调 / Domain Entry">
          MF
        </TipIcon>
        <TipIcon themeTokens={themeTokens} title={HELP_TIP} ariaLabel="使用说明">
          ?
        </TipIcon>
        <TipIcon
          themeTokens={themeTokens}
          title={bridgeHint || (bridgeConnected ? '桥接已连接' : '桥接未连接')}
          ariaLabel={bridgeConnected ? '桥接已连接' : '桥接未连接'}
          color={bridgeConnected ? themeTokens.statusSuccess : themeTokens.statusError}
          onClick={
            bridgeConnected
              ? undefined
              : () => window.open(`${apiBase.replace(/\/$/, '')}/domain-entry/bridge-help`, '_blank')
          }
        >
          {bridgeConnected ? '●' : '○'}
        </TipIcon>
        {!bridgeConnected ? (
          <TipIcon
            themeTokens={themeTokens}
            title="安装/更新桥接 v1.8.10"
            ariaLabel="安装/更新桥接"
            color={themeTokens.tabActiveText}
            onClick={() => openBridgeInstall()}
          >
            ↓
          </TipIcon>
        ) : null}
        {statusTip ? (
          <TipIcon
            themeTokens={themeTokens}
            title={statusTip}
            ariaLabel={statusTip}
            color={
              loadError || (feedback && !feedback.ok)
                ? themeTokens.statusError
                : feedback?.ok
                  ? themeTokens.statusSuccess
                  : themeTokens.textSecondary
            }
          >
            {loadError || (feedback && !feedback.ok) ? '!' : loading ? '…' : '✓'}
          </TipIcon>
        ) : null}
        <div style={{ flex: 1, minWidth: 8 }} />
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: themeTokens.textPrimary,
            whiteSpace: 'nowrap',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
          title="写入页面 logEnable；需刷新业务页后 console 才生效"
        >
          <input
            type="checkbox"
            checked={Boolean(draft.logEnable)}
            disabled={busy}
            onChange={(e) => setLogEnable(e.target.checked)}
          />
          打印日志
        </label>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: themeTokens.textPrimary,
            whiteSpace: 'nowrap',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
          title="默认开启。关闭后桥接仍连接，但不写入 domain-debug-helper / 本地 node 等，可只用 cc-helper"
        >
          <input
            type="checkbox"
            checked={draft.bridgeEnable !== false}
            disabled={busy}
            onChange={(e) => setBridgeEnable(e.target.checked)}
          />
          启用桥接
        </label>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: themeTokens.textPrimary,
            whiteSpace: 'nowrap',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
          title="外部开关：写入 ccweb-helper-enable=true/false。无此键则仍按原逻辑（domain-debug-helper / 钉钉企微）。需硬刷"
        >
          <input
            type="checkbox"
            checked={Boolean(draft.installCCWebHelper)}
            disabled={busy}
            onChange={(e) => setInstallCCWebHelper(e.target.checked)}
          />
          安装助手
        </label>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: themeTokens.textPrimary,
            whiteSpace: 'nowrap',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
          title="SW→https://{ip}:8888→cpxy→localhost:{port}；勾选后自动把 cpxy 切到 local:{port}"
        >
          <input
            type="checkbox"
            checked={Boolean(draft.isCjetProxy)}
            disabled={busy}
            onChange={(e) => setIsCjetProxy(e.target.checked)}
          />
          本地node
        </label>
        {draft.isCjetProxy ? (
          <>
            <input
              value={draft.proxyIp || '127.0.0.1'}
              disabled={busy}
              title="cjet-proxy IP"
              onChange={(e) => setProxyIp(e.target.value)}
              onBlur={(e) => setProxyIp(e.target.value)}
              style={{
                width: 100,
                height: 20,
                boxSizing: 'border-box',
                border: `1px solid ${themeTokens.panelBorder}`,
                borderRadius: 4,
                padding: '0 6px',
                background: themeTokens.appBackground,
                color: themeTokens.textPrimary,
                fontSize: 11,
              }}
            />
            <span style={{ fontSize: 11, color: themeTokens.textSecondary }} title="SW 入口固定 8888">
              :8888→node:
            </span>
            <input
              value={String(draft.proxyPort || 7001)}
              disabled={busy}
              title="本地 node 端口（cpxy 目标 local:{port}，默认 7001）"
              onChange={(e) => setProxyPort(e.target.value)}
              onBlur={(e) => setProxyPort(e.target.value)}
              style={{
                width: 56,
                height: 20,
                boxSizing: 'border-box',
                border: `1px solid ${themeTokens.panelBorder}`,
                borderRadius: 4,
                padding: '0 6px',
                background: themeTokens.appBackground,
                color: themeTokens.textPrimary,
                fontSize: 11,
              }}
            />
          </>
        ) : null}
        <Button
          themeTokens={themeTokens}
          size="sm"
          disabled={busy}
          onClick={() => void refreshRemoteEntryNow()}
          style={{ height: 22, padding: '0 8px', fontSize: 11, borderRadius: 4 }}
        >
          刷新 RemoteEntry
        </Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: themeTokens.textSecondary, width: 40 }}>环境</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          {contextEnvs.map((env) => (
            <button
              key={env}
              type="button"
              disabled={busy}
              onClick={() => selectContext(env)}
              style={chipStyle(contextEnv === env)}
              title={enabledContexts.includes(env) ? '该环境有覆盖' : '该环境无覆盖（跟 CDN）'}
            >
              {env}
              {enabledContexts.includes(env) ? ' ●' : ''}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: themeTokens.textSecondary, width: 40 }}>MF</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          {mfShortcuts.map((mf) => (
            <button
              key={`mf-${mf}`}
              type="button"
              disabled={busy}
              onClick={() => applyMfShortcut(mf)}
              style={chipStyle(mfHighlight === mf)}
              title={
                mf === 'local'
                  ? '批量：带端口域 → localhost'
                  : mf === contextEnv
                    ? '取消全部覆盖，跟本境 CDN'
                    : `切换到「${mf}」环境方案`
              }
            >
              {mf}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: `1px solid ${themeTokens.panelBorder}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: themeTokens.headerBackground, textAlign: 'left' }}>
              <th
                style={{
                  padding: '6px 6px',
                  borderBottom: `1px solid ${themeTokens.panelBorder}`,
                  width: 110,
                  maxWidth: 110,
                  fontWeight: 700,
                }}
              >
                domain
              </th>
              <th style={{ padding: '8px 10px', borderBottom: `1px solid ${themeTokens.panelBorder}` }}>url</th>
              <th
                style={{
                  padding: '8px 10px',
                  borderBottom: `1px solid ${themeTokens.panelBorder}`,
                  width: 72,
                  textAlign: 'center',
                }}
              >
                本地
              </th>
            </tr>
          </thead>
          <tbody>
            {bindings.map((binding) => {
              const local = isDomainLocal(binding.mfDomain);
              const editable = !busy && isDomainUrlEditable(binding.mfDomain);
              const domainLabel = getDomainLabel(binding.mfDomain);
              const url = getDisplayUrl(binding.mfDomain);
              return (
                <tr key={binding.mfDomain}>
                  <td
                    title={domainLabel}
                    style={{
                      padding: '6px 6px',
                      borderBottom: `1px solid ${themeTokens.panelBorder}`,
                      width: 110,
                      maxWidth: 110,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: themeTokens.tabActiveBorder,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {domainLabel}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: `1px solid ${themeTokens.panelBorder}` }}>
                    <input
                      value={url}
                      disabled={!editable}
                      readOnly={!editable}
                      title="可编辑；端口→localhost，CDN 路径保留环境；改完自动持久化"
                      onChange={(e) => updateDisplayUrl(binding.mfDomain, e.target.value)}
                      onBlur={(e) => {
                        if (editable) commitDisplayUrl(binding.mfDomain, e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (!editable || e.key !== 'Enter') return;
                        e.preventDefault();
                        commitDisplayUrl(binding.mfDomain, (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).blur();
                      }}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        border: `1px solid ${themeTokens.panelBorder}`,
                        borderRadius: 4,
                        padding: '4px 6px',
                        background: themeTokens.appBackground,
                        color: themeTokens.textPrimary,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 11,
                      }}
                    />
                  </td>
                  <td
                    style={{
                      padding: '6px 10px',
                      borderBottom: `1px solid ${themeTokens.panelBorder}`,
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={local}
                      disabled={busy}
                      title={
                        binding.defaultPort > 0
                          ? `勾选→ http://localhost:${binding.defaultPort}/remoteEntry.js；不勾→本境 CDN`
                          : '勾选→ localhost（可改端口）；不勾→本境 CDN'
                      }
                      onChange={(e) => setLocalChecked(binding.mfDomain, e.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
            {!loading && bindings.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 16, color: themeTokens.textSecondary }}>
                  无 bindings
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
