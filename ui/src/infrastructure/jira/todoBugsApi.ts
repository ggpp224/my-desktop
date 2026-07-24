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

export type JiraFixIteration = {
  previous?: string | null;
  current?: string;
  next?: string | null;
  selected?: string;
};

export type JiraBugPayload = {
  success?: boolean;
  total?: number;
  issues?: JiraBugItem[];
  iteration?: JiraFixIteration;
  error?: string;
};

export async function fetchTodoBugs(
  apiBase: string,
  options?: { maxResults?: number; fixVersion?: string },
): Promise<JiraBugPayload> {
  const base = apiBase.replace(/\/$/, '');
  const params = new URLSearchParams({ maxResults: String(options?.maxResults ?? 100) });
  const fixVersion = (options?.fixVersion ?? '').trim();
  if (fixVersion) params.set('fixVersion', fixVersion);
  const res = await fetch(`${base}/jira/todo-bugs?${params.toString()}`);
  const data = (await res.json()) as JiraBugPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

export async function fetchInProgressBugs(
  apiBase: string,
  options?: { maxResults?: number; fixVersion?: string },
): Promise<JiraBugPayload> {
  const base = apiBase.replace(/\/$/, '');
  const params = new URLSearchParams({ maxResults: String(options?.maxResults ?? 100) });
  const fixVersion = (options?.fixVersion ?? '').trim();
  if (fixVersion) params.set('fixVersion', fixVersion);
  const res = await fetch(`${base}/jira/in-progress-bugs?${params.toString()}`);
  const data = (await res.json()) as JiraBugPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}
