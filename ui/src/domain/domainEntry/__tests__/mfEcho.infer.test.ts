/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inferMfHighlight, isLocalhostMfSource, isLocalMfSource, isOverrideMfSource } from '../mfEcho';

describe('inferMfHighlight', () => {
  it('有 localhost 覆盖时高亮 local', () => {
    assert.equal(
      inferMfHighlight({ apphub: { kind: 'local', value: '8079' }, ydzee: { kind: 'cdn', value: 'test2' } }, 'inte'),
      'local'
    );
    assert.equal(inferMfHighlight({ apphub: { kind: 'url', value: 'http://localhost:1/remoteEntry.js' } }, 'test'), 'local');
  });

  it('仅 CDN 覆盖不算 local 高亮', () => {
    assert.equal(inferMfHighlight({ ydzee: { kind: 'cdn', value: 'test2' } }, 'inte'), 'inte');
  });

  it('全 follow / 空 sources 时高亮业务环境', () => {
    assert.equal(inferMfHighlight({}, 'inte'), 'inte');
    assert.equal(inferMfHighlight({ ydzee: { kind: 'follow' } }, 'test'), 'test');
  });

  it('isLocalhostMfSource 仅 localhost', () => {
    assert.equal(isLocalhostMfSource({ kind: 'local', value: '1' }), true);
    assert.equal(isLocalhostMfSource({ kind: 'url', value: 'http://localhost:9/remoteEntry.js' }), true);
    assert.equal(isLocalhostMfSource({ kind: 'url', value: 'https://cdn.example/x' }), false);
    assert.equal(isLocalhostMfSource({ kind: 'cdn', value: 'test2' }), false);
    assert.equal(isLocalMfSource({ kind: 'follow' }), false);
  });

  it('isOverrideMfSource：cdn/url 也算覆盖（勾选不要求 localhost）', () => {
    assert.equal(isOverrideMfSource({ kind: 'cdn', value: 'test2' }), true);
    assert.equal(isOverrideMfSource({ kind: 'url', value: 'https://cdn.example/x' }), true);
    assert.equal(isOverrideMfSource({ kind: 'follow' }), false);
  });
});
