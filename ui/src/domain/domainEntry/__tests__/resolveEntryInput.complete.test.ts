/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { completeRemoteEntryInput } from '../resolveEntryInput.js';

describe('completeRemoteEntryInput', () => {
  it('纯端口补全为 localhost remoteEntry', () => {
    assert.equal(completeRemoteEntryInput('8100'), 'http://localhost:8100/remoteEntry.js');
    assert.equal(completeRemoteEntryInput(' 8079 '), 'http://localhost:8079/remoteEntry.js');
  });

  it('完整 URL 去掉 query', () => {
    assert.equal(
      completeRemoteEntryInput('http://localhost:8100/remoteEntry.js?1'),
      'http://localhost:8100/remoteEntry.js'
    );
  });

  it('环境别名基于原 URL 改写', () => {
    assert.equal(
      completeRemoteEntryInput(
        'i',
        'https://cloud.static.chanjet.com/saas-cc-web/test/apphub/remoteEntry.js'
      ),
      'https://cloud.static.chanjet.com/saas-cc-web/inte/apphub/remoteEntry.js'
    );
  });

  it('无法识别时原样返回', () => {
    assert.equal(completeRemoteEntryInput('not-a-url'), 'not-a-url');
  });
});
