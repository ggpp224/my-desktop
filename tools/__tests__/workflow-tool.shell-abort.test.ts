/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { abortMessageForFailedShell } from '../workflow-tool.js';

describe('workflow-tool.shell-abort', () => {
  it('exit 0 不中止', () => {
    assert.equal(abortMessageForFailedShell(5, { code: 0, stderr: '' }), undefined);
  });

  it('exit 非 0 中止并带上 stderr', () => {
    const message = abortMessageForFailedShell(5, {
      code: 1,
      stderr: 'sh: scripts/check-deprecated-modules.sh: No such file or directory\n',
    });
    assert.equal(
      message,
      '步骤 5 失败，exit=1：sh: scripts/check-deprecated-modules.sh: No such file or directory'
    );
  });

  it('被信号杀掉时 code 为 null 也中止', () => {
    const message = abortMessageForFailedShell(2, { code: null, stderr: '' });
    assert.equal(message, '步骤 2 失败，exit=null');
  });
});
