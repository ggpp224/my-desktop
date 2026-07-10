/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMacostunmodeStartCommand } from './macostunmode-tool.js';

describe('buildMacostunmodeStartCommand', () => {
  it('无密码时直接 exec sudo 脚本', () => {
    const cmd = buildMacostunmodeStartCommand('/tmp/macostunmode', '');
    assert.match(cmd, /cd "\/tmp\/macostunmode"/);
    assert.match(cmd, /exec sudo env MACOSTUNMODE_AUTO_GATEKEEPER=1 \.\/macostunmode\.sh/);
    assert.doesNotMatch(cmd, /printf/);
  });

  it('有密码时仅 sudo -v 读管道，脚本走终端 stdin', () => {
    const cmd = buildMacostunmodeStartCommand('/tmp/macostunmode', '    ');
    assert.match(cmd, /printf '%s\\n' '    ' \| sudo -S -v/);
    assert.match(cmd, /exec sudo env MACOSTUNMODE_AUTO_GATEKEEPER=1 \.\/macostunmode\.sh/);
    assert.doesNotMatch(cmd, /sudo -S \.\/macostunmode\.sh/);
  });
});
