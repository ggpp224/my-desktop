/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyShellLocalForContext,
  getDomainEntryBootstrap,
  getContextProfile,
  resetContextProfile,
  resolveContextEcho,
  saveContextProfile,
  savePageEcho,
} from './domain-entry-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.resolve(__dirname, '../runtime/domain-entry/store.json');
const PAGE_ECHO_PATH = path.resolve(__dirname, '../runtime/domain-entry/page-echo.json');
let backup: string | null = null;
let echoBackup: string | null = null;

describe('domain-entry-service multi-context', () => {
  before(async () => {
    try {
      backup = await fs.readFile(STORE_PATH, 'utf8');
    } catch {
      backup = null;
    }
    try {
      echoBackup = await fs.readFile(PAGE_ECHO_PATH, 'utf8');
    } catch {
      echoBackup = null;
    }
  });

  after(async () => {
    if (backup != null) {
      await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
      await fs.writeFile(STORE_PATH, backup, 'utf8');
    } else {
      try {
        await fs.unlink(STORE_PATH);
      } catch {
        /* ignore */
      }
    }
    if (echoBackup != null) {
      await fs.mkdir(path.dirname(PAGE_ECHO_PATH), { recursive: true });
      await fs.writeFile(PAGE_ECHO_PATH, echoBackup, 'utf8');
    } else {
      try {
        await fs.unlink(PAGE_ECHO_PATH);
      } catch {
        /* ignore */
      }
    }
  });

  it('inte 启用壳 local 后，bootstrap?context=inte 有 apphub', async () => {
    await applyShellLocalForContext('inte');
    const boot = await getDomainEntryBootstrap('inte');
    assert.equal(boot.enable, true);
    // 有 localhost 覆盖时 current=local（桌面 MF 高亮 local）
    assert.equal(boot.current, 'local');
    assert.equal(boot.domainEntry.apphub, 'http://localhost:8079/remoteEntry.js');
  });

  it('bootstrap 无 context 或未启用环境 → enable false', async () => {
    await resetContextProfile('test');
    const empty = await getDomainEntryBootstrap('');
    assert.equal(empty.enable, false);
    const testBoot = await getDomainEntryBootstrap('test');
    assert.equal(testBoot.enable, false);
  });

  it('可为 inte 配置部分域用 test CDN', async () => {
    await saveContextProfile({
      contextEnv: 'inte',
      enable: true,
      sources: {
        apphub: { kind: 'local', value: '8079' },
        React18App: { kind: 'cdn', value: 'test' },
        metapage: { kind: 'follow' },
      },
    });
    const boot = await getDomainEntryBootstrap('inte');
    assert.equal(boot.domainEntry.apphub, 'http://localhost:8079/remoteEntry.js');
    assert.match(boot.domainEntry.React18App || '', /\/test\//);
    // follow 域会补本境 CDN，保证 helper 全表写入
    assert.match(boot.domainEntry.metapage || '', /\/inte\//);
    const profile = await getContextProfile('inte');
    assert.equal(profile.sources.React18App?.kind, 'cdn');
  });

  it('页面 echo 含 localhost 时，inte 回显优先页面且 MF sources 为 local', async () => {
    await resetContextProfile('inte');
    await savePageEcho({
      contextEnv: 'inte',
      config: {
        enable: true,
        current: 'local',
        domainEntry: {
          apphub: 'http://localhost:8079/remoteEntry.js',
          ydzee: 'https://cloud.static.chanjet.com/saas-cc-web-ydzee/test2/remoteEntry.js',
        },
      },
    });
    const resolved = await resolveContextEcho('inte');
    assert.equal(resolved.fromPage, true);
    assert.equal(resolved.profile.contextEnv, 'inte');
    assert.equal(resolved.profile.sources.apphub?.kind, 'local');
    assert.equal(resolved.profile.sources.ydzee?.kind, 'cdn');
    assert.equal(resolved.profile.sources.ydzee?.value, 'test2');
  });

  it('resolveLiveSync：桌面未保存时不 pushToPage', async () => {
    const { resolveLiveSync } = await import('./domain-entry-service.js');
    await resetContextProfile('inte');
    await savePageEcho({
      contextEnv: 'inte',
      config: {
        enable: true,
        current: 'local',
        domainEntry: { apphub: 'http://localhost:8079/remoteEntry.js' },
      },
    });
    const sync = await resolveLiveSync('inte');
    assert.equal(sync.pushToPage, false);
    assert.ok(sync.pageEcho);
  });

  it('resolveLiveSync：页面 echo 内容与桌面不一致时仍 pushToPage', async () => {
    const { resolveLiveSync } = await import('./domain-entry-service.js');
    await saveContextProfile({
      contextEnv: 'inte',
      enable: true,
      sources: {
        bizsolutions: { kind: 'local', value: '8200' },
      },
    });
    await savePageEcho({
      contextEnv: 'inte',
      config: {
        enable: true,
        current: 'local',
        domainEntry: {
          bizsolutions: 'https://cloud.static.chanjet.com/biz-solution/test2/remoteEntry.js',
        },
      },
    });
    // 再抬一次 echo 时间戳（模拟旧桥接先 echo）
    await savePageEcho({
      contextEnv: 'inte',
      config: {
        enable: true,
        current: 'local',
        domainEntry: {
          bizsolutions: 'https://cloud.static.chanjet.com/biz-solution/test2/remoteEntry.js',
        },
      },
    });
    const sync = await resolveLiveSync('inte');
    assert.equal(sync.pushToPage, true);
    assert.equal(sync.config.domainEntry.bizsolutions, 'http://localhost:8200/remoteEntry.js');
  });

  it('savePageEcho：相同内容不抬 updatedAt', async () => {
    const cfg = {
      enable: true,
      current: 'local' as const,
      domainEntry: { apphub: 'http://localhost:8079/remoteEntry.js' },
    };
    const first = await savePageEcho({ contextEnv: 'inte', config: cfg });
    const second = await savePageEcho({ contextEnv: 'inte', config: cfg });
    assert.equal(second.updatedAt, first.updatedAt);
  });

  it('waitForLiveSync：无变更时超时返回 timedOut', async () => {
    const { waitForLiveSync } = await import('./domain-entry-service.js');
    const profile = await saveContextProfile({
      contextEnv: 'inte',
      enable: true,
      sources: { apphub: { kind: 'local', value: '8079' } },
    });
    const t0 = Date.now();
    const waited = await waitForLiveSync('inte', profile.updatedAt, 1200);
    const elapsed = Date.now() - t0;
    assert.equal(waited.timedOut, true);
    assert.equal(waited.changed, false);
    assert.ok(elapsed >= 1000, `elapsed=${elapsed}`);
  });

  it('waitForLiveSync：save 后立即唤醒且 changed', async () => {
    const { waitForLiveSync } = await import('./domain-entry-service.js');
    const before = await getContextProfile('inte');
    const since = before.updatedAt || new Date(0).toISOString();
    const pending = waitForLiveSync('inte', since, 8000);
    await new Promise((r) => setTimeout(r, 50));
    await saveContextProfile({
      contextEnv: 'inte',
      enable: true,
      sources: { apphub: { kind: 'local', value: '8079' } },
    });
    const waited = await pending;
    assert.equal(waited.timedOut, false);
    assert.equal(waited.changed, true);
    assert.ok(waited.storeUpdatedAt);
  });

  it('waitForLiveSync：刷新 RemoteEntry 立即唤醒且 reloadPage', async () => {
    const { waitForLiveSync, requestRemoteEntryRefresh } = await import('./domain-entry-service.js');
    const profile = await getContextProfile('inte');
    const since = profile.updatedAt || new Date().toISOString();
    const pending = waitForLiveSync('inte', since, 8000);
    await new Promise((r) => setTimeout(r, 50));
    requestRemoteEntryRefresh('inte');
    const waited = await pending;
    assert.equal(waited.timedOut, false);
    assert.equal(waited.reloadPage, true);
  });

  it('resolveLiveSync：仅开打印日志也 pushToPage 且不清 syncClear', async () => {
    const { resolveLiveSync } = await import('./domain-entry-service.js');
    await resetContextProfile('inte');
    await saveContextProfile({
      contextEnv: 'inte',
      enable: false,
      sources: {},
      logEnable: true,
      isCjetProxy: false,
      proxyIp: '127.0.0.1',
    });
    const sync = await resolveLiveSync('inte');
    assert.equal(sync.pushToPage, true);
    assert.equal(sync.config.logEnable, true);
    assert.equal(sync.config.syncClear, false);
    assert.equal(sync.config.enable, false);
  });
});
