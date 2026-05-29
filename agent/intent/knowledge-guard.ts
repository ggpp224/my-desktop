/* AI 生成 By Peng.Guo */
import type { ProjectCapabilityInput } from '../../config/command-hints.js';
import { isRegisteredExecutableCommand } from './executable-registry.js';

/** 知识库正向信号：显式问答意图（不含单独「配置/使用/说明/示例」触发） */
export function hasKnowledgePositiveSignal(userMessage: string): boolean {
  const text = (userMessage ?? '').trim();
  if (!text) return false;
  const normalized = text.replace(/\s+/g, '');
  if (/(知识库|查文档|AdvanceGrid|条件格式化)/i.test(normalized)) return true;
  if (/(如何|怎么|怎样)/i.test(normalized)) return true;
  if (/[?？]\s*$/.test(text)) return true;
  return false;
}

/** 是否应走 query_knowledge_base（双闸门：非操作口令 + 正向问答信号） */
export function shouldRouteToKnowledgeBase(
  userMessage: string,
  projects: ProjectCapabilityInput[]
): boolean {
  if (isRegisteredExecutableCommand(userMessage, projects)) return false;
  return hasKnowledgePositiveSignal(userMessage);
}
