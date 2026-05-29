/* AI 生成 By Peng.Guo */
import type { ToolCall } from '../../ollama-client.js';

/** 解析固定复合口令「合并nova并部署相关服务」 */
export function parseCompositeNovaMergeAndDeployIntent(userMessage: string): ToolCall | null {
  const compact = (userMessage ?? '').replace(/\s+/g, '').toLowerCase();
  if (compact !== '合并nova并部署相关服务') return null;
  return { name: 'composite_nova_merge_and_deploy', arguments: {} };
}
