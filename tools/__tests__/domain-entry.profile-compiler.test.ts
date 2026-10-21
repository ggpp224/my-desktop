/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MF_DOMAIN_BINDINGS } from '../../config/mf-domain-bindings.js';
import {
  buildShellLocalSources,
  compileContextProfile,
  compileDomainEntryProfile,
  resolveEntryInput,
  rewriteEnvInUrl,
} from '../domain-entry/profile-compiler.js';

const GOLDEN_BASE: Record<string, string> = {
  apphub: 'https://cloud.static.chanjet.com/saas-cc-web/inte/apphub/remoteEntry.js',
  React18App: 'https://cloud.static.chanjet.com/react18-antd5-mobx6/inte/remoteEntry.js',
  metapage: 'https://cloud.static.chanjet.com/saas-cc-web-metapage/inte/remoteEntry.js',
};

describe('domain-entry profile-compiler', () => {
  it('rewriteEnvInUrl 替换 path 中的环境段', () => {
    assert.equal(
      rewriteEnvInUrl(GOLDEN_BASE.apphub, 'prod'),
      'https://cloud.static.chanjet.com/saas-cc-web/prod/apphub/remoteEntry.js'
    );
  });

  it('compile local：shell 与带端口 remote 走 bindings 端口', () => {
    const overrides = compileDomainEntryProfile({ env: 'local', baseEntries: GOLDEN_BASE });
    const map = Object.fromEntries(overrides.map((o) => [o.domain, o.remoteEntryUrl]));
    assert.equal(map.apphub, 'http://localhost:8079/remoteEntry.js');
    assert.equal(map.React18App, 'http://localhost:8100/remoteEntry.js');
    assert.equal(map.metapage, GOLDEN_BASE.metapage);
  });

  it('compileContextProfile：follow 不产出；local/cdn 产出', () => {
    const overrides = compileContextProfile({
      contextEnv: 'inte',
      enable: true,
      sources: {
        apphub: { kind: 'local', value: '8079' },
        React18App: { kind: 'cdn', value: 'test' },
        metapage: { kind: 'follow' },
      },
      updatedAt: '',
    });
    const map = Object.fromEntries(overrides.map((o) => [o.domain, o.remoteEntryUrl]));
    assert.equal(map.apphub, 'http://localhost:8079/remoteEntry.js');
    assert.equal(map.React18App, 'https://cloud.static.chanjet.com/react18-antd5-mobx6/test/remoteEntry.js');
    assert.equal(map.metapage, undefined);
  });

  it('buildShellLocalSources：仅带端口域为 local', () => {
    const sources = buildShellLocalSources(MF_DOMAIN_BINDINGS);
    assert.equal(sources.apphub?.kind, 'local');
    assert.equal(sources.apphub?.value, '8079');
    assert.equal(sources.metapage?.kind, 'follow');
  });

  it('compile inte：base 为 localhost 时改走 cdnTemplate', () => {
    const overrides = compileDomainEntryProfile({
      env: 'inte',
      baseEntries: { apphub: 'http://localhost:8079/remoteEntry.js' },
    });
    const map = Object.fromEntries(overrides.map((o) => [o.domain, o.remoteEntryUrl]));
    assert.equal(map.apphub, 'https://cloud.static.chanjet.com/saas-cc-web/inte/apphub/remoteEntry.js');
  });

  it('resolveEntryInput：端口 / 别名 / 完整 URL', () => {
    assert.equal(resolveEntryInput({ domain: 'apphub', raw: '8079' }), 'http://localhost:8079/remoteEntry.js');
    assert.equal(
      resolveEntryInput({
        domain: 'apphub',
        raw: 'i',
        baseUrl: GOLDEN_BASE.apphub.replace('/inte/', '/test/'),
      }),
      'https://cloud.static.chanjet.com/saas-cc-web/inte/apphub/remoteEntry.js'
    );
  });

  it('resolveEntryInput 拒绝非法协议', () => {
    assert.throws(() => resolveEntryInput({ domain: 'a', raw: 'javascript:1' }), /仅允许 http/);
  });
});
