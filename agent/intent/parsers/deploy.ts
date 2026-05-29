/* AI 生成 By Peng.Guo */
import type { ToolCall } from '../../ollama-client.js';

/** 解析「部署 nova 集测」：须优先于「部署 nova」 */
export function parseDeployNovaPretestIntent(userMessage: string): ToolCall | null {
  const text = (userMessage ?? '').trim();
  if (!/部署\s*nova(?:\s*集测|集测)/i.test(text)) return null;
  return { name: 'deploy_jenkins', arguments: { job: 'nova-pretest' } };
}

export function parseGenericDeployIntent(userMessage: string, explicitCode: string | null): ToolCall | null {
  const text = (userMessage ?? '').trim();
  if (!/^部署(?:\s|$)/i.test(text)) return null;

  const explicitJob = (explicitCode ?? '').trim().toLowerCase();
  const inferredJobMatch = text.match(/^部署\s+([a-z0-9][a-z0-9-]*)\b/i);
  const inferredJob = (inferredJobMatch?.[1] ?? '').trim().toLowerCase();
  const job = explicitJob || inferredJob;
  if (!job) return null;

  const branchMatch = text.match(/(?:分支\s*(?:是|为)?|branch\s*(?:=|是|为)?)\s*([a-z0-9._/-]+)/i);
  const branch = (branchMatch?.[1] ?? '').trim();

  return {
    name: 'deploy_jenkins',
    arguments: branch ? { job, branch } : { job },
  };
}

export function parseDeployIntent(userMessage: string, explicitCode: string | null): ToolCall | null {
  return parseDeployNovaPretestIntent(userMessage) ?? parseGenericDeployIntent(userMessage, explicitCode);
}
