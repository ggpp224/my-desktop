/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IContextDomainEntryProfile } from '../domain-entry/declare.js';
import {
  assertSafeRemoteEntryUrl,
  pageConfigToContextProfile,
  contextProfileToPageConfig,
  fromPageConfigStorage,
  toPageConfigStorage,
} from '../domain-entry/storage-contract.js';

describe('domain-entry storage-contract', () => {
  it('context profile → 页面契约：覆盖域 + 补全其余为本境 CDN', () => {
    const profile: IContextDomainEntryProfile = {
      contextEnv: 'inte',
      enable: true,
      sources: {
        apphub: { kind: 'local', value: '8079' },
        metapage: { kind: 'follow' },
        React18App: { kind: 'local', value: '8100' },
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const storage = contextProfileToPageConfig(profile);
    assert.equal(storage.enable, true);
    // 有 localhost 覆盖时 current 必须为 local（桌面 MF 高亮 local）
    assert.equal(storage.current, 'local');
    assert.equal(storage.domainEntry.apphub, 'http://localhost:8079/remoteEntry.js');
    assert.equal(storage.domainEntry.React18App, 'http://localhost:8100/remoteEntry.js');
    // follow 域补本境 CDN，避免页面仍残留旧境入口
    assert.match(storage.domainEntry.metapage || '', /\/inte\//);
    assert.ok(Object.keys(storage.domainEntry).length > 3);
  });

  it('无本地覆盖时 current=业务环境', () => {
    const storage = contextProfileToPageConfig({
      contextEnv: 'inte',
      enable: true,
      sources: {
        apphub: { kind: 'cdn', value: 'inte' },
      },
      updatedAt: '',
    });
    assert.equal(storage.enable, true);
    assert.equal(storage.current, 'inte');
    assert.match(storage.domainEntry.apphub || '', /\/inte\//);
  });

  it('无覆盖（全 follow）时 domainEntry 为空', () => {
    const storage = contextProfileToPageConfig({
      contextEnv: 'test',
      enable: false,
      sources: { apphub: { kind: 'follow' } },
      updatedAt: '',
    });
    assert.equal(storage.enable, false);
    assert.deepEqual(storage.domainEntry, {});
    assert.equal(storage.current, 'test');
  });

  it('有覆盖时忽略 enable=false，仍写出 domainEntry', () => {
    const storage = contextProfileToPageConfig({
      contextEnv: 'test',
      enable: false,
      sources: { apphub: { kind: 'local', value: '8079' } },
      updatedAt: '',
    });
    assert.equal(storage.enable, true);
    assert.equal(storage.domainEntry.apphub, 'http://localhost:8079/remoteEntry.js');
  });

  it('旧 Profile ↔ 页面契约往返', () => {
    const profile = {
      id: 'current',
      name: 'local',
      env: 'local' as const,
      enable: true,
      overrides: [
        { domain: 'apphub', remoteEntryUrl: 'http://localhost:8079/remoteEntry.js?123', source: 'local' as const },
      ],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const storage = toPageConfigStorage(profile);
    assert.equal(storage.domainEntry.apphub, 'http://localhost:8079/remoteEntry.js');
    const roundTrip = fromPageConfigStorage(storage);
    assert.equal(roundTrip.enable, true);
  });

  it('拒绝非 http(s) URL', () => {
    assert.throws(() => assertSafeRemoteEntryUrl('javascript:alert(1)'), /仅允许 http/);
  });

  it('页面契约 → profile：localhost→local，CDN path→cdn', () => {
    const profile = pageConfigToContextProfile('inte', {
      enable: true,
      current: 'local',
      domainEntry: {
        apphub: 'http://localhost:8079/remoteEntry.js',
        ydzee: 'https://cloud.static.chanjet.com/saas-cc-web-ydzee/test2/remoteEntry.js',
      },
    });
    assert.equal(profile.contextEnv, 'inte');
    assert.equal(profile.enable, true);
    assert.deepEqual(profile.sources.apphub, { kind: 'local', value: '8079' });
    assert.deepEqual(profile.sources.ydzee, { kind: 'cdn', value: 'test2' });
  });

  it('写出 logEnable / isCjetProxy；无覆盖时不清 syncClear', () => {
    const storage = contextProfileToPageConfig({
      contextEnv: 'inte',
      enable: false,
      sources: {},
      logEnable: true,
      isCjetProxy: false,
      proxyIp: '127.0.0.1',
      updatedAt: '',
    });
    assert.equal(storage.enable, false);
    assert.equal(storage.logEnable, true);
    assert.equal(storage.syncClear, false);
    assert.deepEqual(storage.domainEntry, {});
  });

  it('installCCWebHelper：仅写 flag，无覆盖时不清 syncClear', () => {
    const storage = contextProfileToPageConfig({
      contextEnv: 'inte',
      enable: false,
      sources: {},
      installCCWebHelper: true,
      updatedAt: '',
    });
    assert.equal(storage.installCCWebHelper, true);
    assert.equal(storage.syncClear, false);
    assert.deepEqual(storage.domainEntry, {});
  });

  it('bridgeEnable 缺省为 true；显式 false 可关闭', () => {
    const on = contextProfileToPageConfig({
      contextEnv: 'inte',
      enable: false,
      sources: {},
      updatedAt: '',
    });
    assert.equal(on.bridgeEnable, true);
    const off = contextProfileToPageConfig({
      contextEnv: 'inte',
      enable: false,
      sources: {},
      bridgeEnable: false,
      updatedAt: '',
    });
    assert.equal(off.bridgeEnable, false);
  });

  it('isCjetProxy：写出 ip+port，不改写 domainEntry（仍为 localhost）', () => {
    const storage = contextProfileToPageConfig({
      contextEnv: 'inte',
      enable: true,
      sources: {
        apphub: { kind: 'local', value: '8079' },
      },
      logEnable: false,
      isCjetProxy: true,
      proxyIp: '10.0.0.2',
      proxyPort: 7001,
      updatedAt: '',
    });
    assert.equal(storage.enable, true);
    assert.equal(storage.isCjetProxy, true);
    assert.equal(storage.proxyIp, '10.0.0.2');
    assert.equal(storage.proxyPort, 7001);
    assert.equal(storage.domainEntry.apphub, 'http://localhost:8079/remoteEntry.js');
    assert.equal(storage.syncClear, false);
  });

  it('proxyPort 缺省/非法时归一为 7001（本地 node）', () => {
    const storage = contextProfileToPageConfig({
      contextEnv: 'inte',
      enable: false,
      sources: {},
      isCjetProxy: true,
      proxyIp: '127.0.0.1',
      updatedAt: '',
    });
    assert.equal(storage.proxyPort, 7001);
    const profile = pageConfigToContextProfile('inte', {
      enable: false,
      current: 'inte',
      domainEntry: {},
      isCjetProxy: true,
      proxyIp: '127.0.0.1',
      proxyPort: 99999 as number,
    });
    assert.equal(profile.proxyPort, 7001);
  });

  it('页面契约回显：历史误写的 8888 MF URL → local + flags', () => {
    const profile = pageConfigToContextProfile('inte', {
      enable: true,
      current: 'local',
      domainEntry: {
        apphub: 'https://127.0.0.1:8888/8079/remoteEntry.js',
      },
      logEnable: true,
      isCjetProxy: true,
      proxyIp: '127.0.0.1',
      proxyPort: 7001,
    });
    assert.deepEqual(profile.sources.apphub, { kind: 'local', value: '8079' });
    assert.equal(profile.logEnable, true);
    assert.equal(profile.isCjetProxy, true);
    assert.equal(profile.proxyIp, '127.0.0.1');
    assert.equal(profile.proxyPort, 7001);
  });
});
