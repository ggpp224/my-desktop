/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProjectCapabilityInput } from '../../config/command-hints.js';
import { resolveIntent } from './intent-resolver.js';

const STUB_PROJECTS: ProjectCapabilityInput[] = [
  {
    codes: ['react18', 'nova', 'scm'],
    jenkins: { jobName: 'BUILD-react18', defaultBranch: 'test-260423' },
    merge: { targetBranch: 'test', runRelease: true },
  },
];

function toolOf(intent: ReturnType<typeof resolveIntent>): string | undefined {
  if (intent.kind === 'direct' || intent.kind === 'knowledge') return intent.tool;
  return undefined;
}

describe('resolveIntent', () => {
  it('固定口令：打开json配置中心 → open_json_config_center，跳过 LLM', () => {
    const intent = resolveIntent('打开json配置中心', { projects: STUB_PROJECTS });
    assert.equal(intent.kind, 'direct');
    assert.equal(intent.skipLlm, true);
    assert.equal(toolOf(intent), 'open_json_config_center');
  });

  it('固定口令：开始工作 → run_workflow start-work', () => {
    const intent = resolveIntent('开始工作', { projects: STUB_PROJECTS });
    assert.equal(intent.kind, 'direct');
    assert.equal(toolOf(intent), 'run_workflow');
    if (intent.kind === 'direct') {
      assert.equal((intent.toolCall.arguments as { name?: string }).name, 'start-work');
    }
  });

  it('固定口令：添加私人知识库 → 非 query_knowledge_base', () => {
    const intent = resolveIntent('添加私人知识库', { projects: STUB_PROJECTS });
    assert.equal(intent.kind, 'direct');
    assert.equal(toolOf(intent), 'open_knowledge_base_manager');
  });

  it('固定口令：统计常用指令 → open_command_stats', () => {
    const intent = resolveIntent('统计常用指令', { projects: STUB_PROJECTS });
    assert.equal(intent.kind, 'direct');
    assert.equal(toolOf(intent), 'open_command_stats');
  });

  it('模式：部署 react18 → deploy_jenkins', () => {
    const intent = resolveIntent('部署 react18', { projects: STUB_PROJECTS });
    assert.equal(intent.kind, 'direct');
    assert.equal(toolOf(intent), 'deploy_jenkins');
    if (intent.kind === 'direct') {
      assert.equal((intent.toolCall.arguments as { job?: string }).job, 'react18');
    }
  });

  it('模式：合并 nova 集测 → merge_repo nova-pretest', () => {
    const intent = resolveIntent('合并 nova 集测', { projects: STUB_PROJECTS });
    assert.equal(intent.kind, 'direct');
    assert.equal(toolOf(intent), 'merge_repo');
    if (intent.kind === 'direct') {
      assert.equal((intent.toolCall.arguments as { repo?: string }).repo, 'nova-pretest');
    }
  });

  it('固定口令：tun → start_macostunmode', () => {
    const intent = resolveIntent('tun', { projects: STUB_PROJECTS });
    assert.equal(intent.kind, 'direct');
    assert.equal(toolOf(intent), 'start_macostunmode');
  });

  it('知识库正向：如何使用 AdvanceGrid 条件格式化', () => {
    const intent = resolveIntent('如何使用 AdvanceGrid 条件格式化', { projects: STUB_PROJECTS });
    assert.equal(intent.kind, 'knowledge');
    assert.equal(toolOf(intent), 'query_knowledge_base');
    assert.equal(intent.skipLlm, true);
  });

  it('知识库负向：打开json配置中心 不进知识库', () => {
    const intent = resolveIntent('打开json配置中心', { projects: STUB_PROJECTS });
    assert.notEqual(intent.kind, 'knowledge');
  });

  it('知识库负向：部署 nova 不进知识库', () => {
    const intent = resolveIntent('部署 nova', { projects: STUB_PROJECTS });
    assert.notEqual(intent.kind, 'knowledge');
  });

  it('复合口令：合并nova并部署相关服务', () => {
    const intent = resolveIntent('合并nova并部署相关服务', { projects: STUB_PROJECTS });
    assert.equal(intent.kind, 'direct');
    assert.equal(toolOf(intent), 'composite_nova_merge_and_deploy');
  });
});
