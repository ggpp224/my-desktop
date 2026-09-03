/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CloseIssueDefaults } from '../jira-close-issue-defaults.js';
import {
  ResolutionFieldValueStrategy,
  TransitionScreenFieldMapper,
  VersionArrayFieldValueStrategy,
} from '../jira-transition-screen-field-mapper.js';

describe('CloseIssueDefaults.buildIntent', () => {
  it('默认解决结果为修复，并回填既有字段', () => {
    const defaults = new CloseIssueDefaults({ resolution: '修复' });
    const intent = defaults.buildIntent({
      defectType: '控制错误',
      assignee: 'guopengb',
      fixVersions: '261126,后续迭代',
    });
    assert.equal(intent['解决结果'], '修复');
    assert.equal(intent['缺陷类型'], '控制错误');
    assert.equal(intent['经办人'], 'guopengb');
    assert.equal(intent['修复的版本'], '261126,后续迭代');
  });

  it('空 resolution 回退为修复', () => {
    const defaults = new CloseIssueDefaults({ resolution: '  ' });
    assert.equal(defaults.buildIntent()['解决结果'], '修复');
  });
});

describe('ResolutionFieldValueStrategy', () => {
  const strategy = new ResolutionFieldValueStrategy();

  it('按 name 匹配 allowedValues', () => {
    const mapped = strategy.map(
      {
        name: '解决结果',
        schema: { type: 'resolution', system: 'resolution' },
        allowedValues: [
          { id: '1', name: '修复' },
          { id: '2', name: '完成' },
        ],
      },
      '修复',
    );
    assert.deepEqual(mapped, { id: '1' });
  });

  it('无 allowedValues 时按 name 提交', () => {
    const mapped = strategy.map(
      { name: '解决结果', schema: { type: 'resolution', system: 'resolution' } },
      '修复',
    );
    assert.deepEqual(mapped, { name: '修复' });
  });
});

describe('TransitionScreenFieldMapper.close fields', () => {
  it('组装关闭问题屏字段（解决结果 + 经办人 + 修复版本）', () => {
    const mapper = TransitionScreenFieldMapper.createDefault();
    const fields = mapper.buildFields(
      {
        resolution: {
          name: '解决结果',
          required: true,
          schema: { type: 'resolution', system: 'resolution' },
          allowedValues: [{ id: '10000', name: '修复' }],
        },
        assignee: {
          name: '经办人',
          required: false,
          schema: { type: 'user', system: 'assignee' },
        },
        fixVersions: {
          name: '修复的版本',
          required: false,
          schema: { type: 'array', items: 'version', system: 'fixVersions' },
          allowedValues: [{ id: '200', name: '261126' }],
        },
        comment: {
          name: '备注',
          required: false,
          schema: { type: 'string', system: 'comment' },
        },
      },
      {
        解决结果: '修复',
        经办人: 'guopengb',
        修复的版本: '261126',
      },
      { actionLabel: '关闭' },
    );
    assert.deepEqual(fields.resolution, { id: '10000' });
    assert.deepEqual(fields.assignee, { name: 'guopengb' });
    assert.deepEqual(fields.fixVersions, [{ id: '200' }]);
    assert.equal(fields.comment, undefined);
  });

  it('缺少必填解决结果时抛出关闭语义错误', () => {
    const mapper = TransitionScreenFieldMapper.createDefault();
    assert.throws(
      () =>
        mapper.buildFields(
          {
            resolution: {
              name: '解决结果',
              required: true,
              schema: { type: 'resolution', system: 'resolution' },
              allowedValues: [{ id: '1', name: '修复' }],
            },
          },
          {},
          { actionLabel: '关闭' },
        ),
      /关闭必填字段无法自动填充：解决结果/,
    );
  });
});

describe('VersionArrayFieldValueStrategy', () => {
  it('逗号分隔版本名映射为 id 列表', () => {
    const strategy = new VersionArrayFieldValueStrategy();
    const mapped = strategy.map(
      {
        name: '修复的版本',
        schema: { type: 'array', items: 'version' },
        allowedValues: [
          { id: '1', name: '261126' },
          { id: '2', name: '后续迭代' },
        ],
      },
      '261126, 后续迭代',
    );
    assert.deepEqual(mapped, [{ id: '1' }, { id: '2' }]);
  });
});
