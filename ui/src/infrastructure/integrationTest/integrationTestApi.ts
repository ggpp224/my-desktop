/* AI 生成 By Peng.Guo */
import type {
  IntegrationTestCatalog,
  IntegrationTestCommandPreview,
  IntegrationTestLastResults,
  IntegrationTestRunResponse,
  IntegrationTestSelection,
} from '../../domain/integrationTest/models';

export async function fetchIntegrationTestCatalog(apiBase: string): Promise<IntegrationTestCatalog> {
  const res = await fetch(`${apiBase}/integration-test/catalog`);
  if (!res.ok) throw new Error(`读取集成用例失败: ${res.status}`);
  return res.json() as Promise<IntegrationTestCatalog>;
}

export async function fetchIntegrationTestLastResults(apiBase: string): Promise<IntegrationTestLastResults> {
  const res = await fetch(`${apiBase}/integration-test/last-results`);
  if (!res.ok) throw new Error(`读取上次执行结果失败: ${res.status}`);
  return res.json() as Promise<IntegrationTestLastResults>;
}

export async function previewIntegrationTestCommand(
  apiBase: string,
  selection: IntegrationTestSelection
): Promise<IntegrationTestCommandPreview> {
  const res = await fetch(`${apiBase}/integration-test/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(selection),
  });
  if (!res.ok) throw new Error(`预览命令失败: ${res.status}`);
  return res.json() as Promise<IntegrationTestCommandPreview>;
}

export async function runIntegrationTests(
  apiBase: string,
  selection: IntegrationTestSelection
): Promise<IntegrationTestRunResponse> {
  const res = await fetch(`${apiBase}/integration-test/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(selection),
  });
  const data = (await res.json().catch(() => null)) as IntegrationTestRunResponse | null;
  if (data && typeof data.success === 'boolean') return data;
  return { success: false, error: `运行失败: ${res.status}` };
}
