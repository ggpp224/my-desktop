/* AI 生成 By Peng.Guo */
import type { ToolCall } from '../../ollama-client.js';

/** 解析升级集测 nova 版本等工作流口令 */
export function parseUpgradeNovaWorkflowIntent(userMessage: string): ToolCall | null {
  const text = (userMessage ?? '').trim();
  if (!text) return null;
  if (/执行工作流\s+upgrade-react18-nova\b/i.test(text)) {
    return { name: 'run_workflow', arguments: { name: 'upgrade-react18-nova' } };
  }
  if (/执行工作流\s+upgrade-cc-web-nova\b/i.test(text)) {
    return { name: 'run_workflow', arguments: { name: 'upgrade-cc-web-nova' } };
  }
  if (/升级\s*集测\s*cc-web2?\s*(?:的\s*)?nova\s*版本/i.test(text)) {
    return { name: 'run_workflow', arguments: { name: 'upgrade-cc-web-nova' } };
  }
  if (/升级\s*集测\s*react\s*18\s*(?:的\s*)?nova\s*版本/i.test(text)) {
    return { name: 'run_workflow', arguments: { name: 'upgrade-react18-nova' } };
  }
  return null;
}
