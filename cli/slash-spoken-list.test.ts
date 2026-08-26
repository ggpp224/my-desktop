/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProjectCapabilityInput } from '../config/command-hints.js';
import { collectSlashSpokenCommands, slashCommandFileStem } from './slash-spoken-list.js';

const STUB_PROJECTS: ProjectCapabilityInput[] = [
  {
    codes: ['react18', 'nova', 'scm'],
    jenkins: { jobName: 'BUILD-react18', defaultBranch: 'test-260423' },
    merge: { targetBranch: 'test', runRelease: true },
  },
];

describe('collectSlashSpokenCommands', () => {
  it('包含按项目展开的部署/合并/启动口令', () => {
    const spoken = collectSlashSpokenCommands(STUB_PROJECTS);
    assert.ok(spoken.includes('部署 nova'));
    assert.ok(spoken.includes('部署 nova 集测'));
    assert.ok(spoken.includes('合并 nova'));
    assert.ok(spoken.includes('启动 react18'));
    assert.ok(spoken.includes('开始工作'));
  });

  it('文件名保留空格以便面板搜索', () => {
    assert.equal(slashCommandFileStem('部署 nova'), '部署 nova');
  });
});
