/* AI 生成 By Peng.Guo */

import type { AgentChatLlmBody, LlmRuntimeMode } from './agentLlmRequest';
import { DEFAULT_GEMINI_MODEL } from './agentLlmRequest';

export type ReportCopyLlmContext = {
  llmRuntimeMode: LlmRuntimeMode;
  /** 本地模式下当前 Ollama 模型名（来自 /agent/ollama/current-model） */
  ollamaModelName: string;
  agentChatLlmBody?: AgentChatLlmBody;
};

/** 括号内「本地/外部 + 模型名」，与复制到剪贴板的首行格式一致 */
export function resolveLlmSourceAndModelId(ctx: ReportCopyLlmContext): { source: '本地' | '外部'; modelId: string } {
  if (ctx.llmRuntimeMode === 'external' && ctx.agentChatLlmBody?.mode === 'external') {
    const modelId = ctx.agentChatLlmBody.model.trim() || DEFAULT_GEMINI_MODEL;
    return { source: '外部', modelId };
  }
  const modelId = ctx.ollamaModelName.trim() || 'Ollama';
  return { source: '本地', modelId };
}

/** 写周报：复制/展示首行 — 已基于 N 条 Jira 任务生成周报（本地 xxx） */
export function buildWeeklyReportLeadLine(jiraTitleCount: number, ctx: ReportCopyLlmContext): string {
  const { source, modelId } = resolveLlmSourceAndModelId(ctx);
  return `已基于 ${jiraTitleCount} 条 Jira 任务生成周报（${source} ${modelId}）`;
}

/** 组内总结：复制首行（无 Jira 条数，与 wiki 源对齐说明） */
export function buildTeamSummaryCopyLeadLine(ctx: ReportCopyLlmContext): string {
  const { source, modelId } = resolveLlmSourceAndModelId(ctx);
  return `已基于 wiki 周报页生成本周组内总结（${source} ${modelId}）`;
}

export function escapeHtmlForClipboard(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
