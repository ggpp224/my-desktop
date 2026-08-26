/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  enqueueRemoteCommand,
  getRemoteCommandSubscriberCount,
  resetRemoteCommandHubForTests,
  subscribeRemoteCommands,
} from './remote-command-hub.js';

describe('remote-command-hub', () => {
  beforeEach(() => {
    resetRemoteCommandHubForTests();
  });

  it('无订阅者时排队，订阅后立即投递', () => {
    const queued = enqueueRemoteCommand('部署 nova');
    assert.equal(queued.queued, true);
    assert.equal(queued.subscriberCount, 0);

    const received: string[] = [];
    const unsubscribe = subscribeRemoteCommands((p) => received.push(p.message));
    assert.deepEqual(received, ['部署 nova']);
    assert.equal(getRemoteCommandSubscriberCount(), 1);
    unsubscribe();
  });

  it('有订阅者时立即广播且不再排队', () => {
    const received: string[] = [];
    subscribeRemoteCommands((p) => received.push(p.message));
    const result = enqueueRemoteCommand('开始工作');
    assert.equal(result.queued, false);
    assert.equal(result.subscriberCount, 1);
    assert.deepEqual(received, ['开始工作']);
  });
});
