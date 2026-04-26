/* AI 生成 By Peng.Guo */
import { forceRebuildKnowledgeIndex, rebuildKnowledgeIndex } from './llamaindex-retriever.js';

function logStep(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[rebuild-index][${ts}] ${message}`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const force = args.has('--force');
  logStep(`开始构建知识索引，force=${String(force)}`);
  const start = Date.now();
  const runner = force ? forceRebuildKnowledgeIndex : rebuildKnowledgeIndex;
  const result = await runner((message) => logStep(message));
  logStep(`完成：docsCount=${result.docsCount}，耗时=${Date.now() - start}ms`);
}

main().catch((err) => {
  logStep(`失败：${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exitCode = 1;
});
