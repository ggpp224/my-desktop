/* AI 生成 By Peng.Guo */
export type JiraBugItem = {
  key?: string;
  summary?: string;
  status?: string;
  resolution?: string;
  fixVersion?: string;
  assignee?: string;
  developer?: string;
  feature?: string;
  url?: string;
};

export type JiraBugPayload = {
  success?: boolean;
  total?: number;
  issues?: JiraBugItem[];
  error?: string;
};

export async function fetchTodoBugs(apiBase: string, maxResults = 100): Promise<JiraBugPayload> {
  const base = apiBase.replace(/\/$/, '');
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  const res = await fetch(`${base}/jira/todo-bugs?${params.toString()}`);
  const data = (await res.json()) as JiraBugPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}
