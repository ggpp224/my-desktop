/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildNpmPackageMetadataUrl,
  formatPublishedAgo,
  parseDistTagsFromRegistryDoc,
} from '../npm-package-version-tool.js';

describe('npm-package-version-tool.format', () => {
  it('scoped 包编码为 @scope%2Fname', () => {
    const url = buildNpmPackageMetadataUrl('https://npmmirror.rd.chanjet.com', '@chanjet/nova-uikit');
    assert.equal(url, 'https://npmmirror.rd.chanjet.com/@chanjet%2Fnova-uikit');
  });

  it('相对时间：天/小时/分钟', () => {
    const now = Date.parse('2026-09-03T12:00:00.000Z');
    assert.equal(formatPublishedAgo('2026-09-01T12:00:00.000Z', now), '2天前');
    assert.equal(formatPublishedAgo('2026-09-03T10:00:00.000Z', now), '2小时前');
    assert.equal(formatPublishedAgo('2026-09-03T11:50:00.000Z', now), '10分钟前');
    assert.equal(formatPublishedAgo(null, now), null);
  });

  it('解析 dist-tags：preferred 优先，附带发布时间', () => {
    const tags = parseDistTagsFromRegistryDoc(
      {
        'dist-tags': {
          latest: '1.260922.0',
          beta: '1.6.0-beta.384',
        },
        time: {
          '1.260922.0': '2026-09-01T08:00:00.000Z',
          '1.6.0-beta.384': '2026-09-01T09:00:00.000Z',
        },
      },
      'beta',
      Date.parse('2026-09-03T12:00:00.000Z')
    );
    assert.equal(tags.length, 2);
    assert.equal(tags[0]?.tag, 'beta');
    assert.equal(tags[0]?.preferred, true);
    assert.equal(tags[0]?.version, '1.6.0-beta.384');
    assert.equal(tags[0]?.publishedAgo, '2天前');
    assert.equal(tags[1]?.tag, 'latest');
    assert.equal(tags[1]?.preferred, false);
  });
});
