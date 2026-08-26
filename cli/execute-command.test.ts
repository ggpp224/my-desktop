/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ToolCall } from '../agent/ollama-client.js';
import type { ProjectCapabilityInput } from '../config/command-hints.js';
import { executeCommand, listCommands } from './execute-command.js';
import { isDesktopOnlyTool } from './desktop-only.js';

const STUB_PROJECTS: ProjectCapabilityInput[] = [
  {
    codes: ['react18', 'nova', 'scm'],
    jenkins: { jobName: 'BUILD-react18', defaultBranch: 'test-260423' },
    merge: { targetBranch: 'test', runRelease: true },
  },
];

function stubExecute() {
  const calls: ToolCall[] = [];
  const executeTool = async (call: ToolCall) => {
    calls.push(call);
    return { stub: true, name: call.name };
  };
  return { calls, executeTool };
}

describe('executeCommand', () => {
  it('部署 nova → deploy_jenkins，并执行工具', async () => {
    const { calls, executeTool } = stubExecute();
    const result = await executeCommand('部署 nova', {
      resolveProjects: () => STUB_PROJECTS,
      executeTool,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.toolCall.name, 'deploy_jenkins');
      assert.equal((result.toolCall.arguments as { job?: string }).job, 'nova');
    }
    assert.equal(calls.length, 1);
  });

  it('开始工作 → run_workflow 且改写为 start-work-external-terminal', async () => {
    const { calls, executeTool } = stubExecute();
    const result = await executeCommand('开始工作', {
      resolveProjects: () => STUB_PROJECTS,
      executeTool,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.toolCall.name, 'run_workflow');
      assert.equal((result.toolCall.arguments as { name?: string }).name, 'start-work-external-terminal');
      assert.equal(result.rewritten, true);
    }
    assert.equal(calls.length, 1);
    assert.equal((calls[0].arguments as { name?: string }).name, 'start-work-external-terminal');
  });

  it('统计常用指令 → desktop_only，不执行工具', async () => {
    const { calls, executeTool } = stubExecute();
    const result = await executeCommand('统计常用指令', {
      resolveProjects: () => STUB_PROJECTS,
      executeTool,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'desktop_only');
      assert.equal(result.tool, 'open_command_stats');
    }
    assert.equal(calls.length, 0);
  });

  it('未命中口令 → unresolved，不调工具、不走 LLM', async () => {
    const { calls, executeTool } = stubExecute();
    const result = await executeCommand('随便聊聊今天天气', {
      resolveProjects: () => STUB_PROJECTS,
      executeTool,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'unresolved');
    }
    assert.equal(calls.length, 0);
  });

  it('listCommands 包含固定口令与开始工作', () => {
    const listed = listCommands();
    assert.ok(listed.exact.includes('开始工作'));
    assert.ok(listed.workflows.some((w) => w.name === 'start-work' || w.name === 'start-work'));
  });

  it('isDesktopOnlyTool 识别页签工具', () => {
    assert.equal(isDesktopOnlyTool('open_command_stats'), true);
    assert.equal(isDesktopOnlyTool('deploy_jenkins'), false);
  });
});
