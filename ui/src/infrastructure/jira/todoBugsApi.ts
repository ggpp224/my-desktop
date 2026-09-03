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
  /** 处理中 bug：当前用户是否已评论「已处理」 */
  processed?: boolean;
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

export type SubmitBugForTestResult = {
  success?: boolean;
  key?: string;
  transitionId?: string;
  transitionName?: string;
  toStatus?: string;
  error?: string;
};

export type CloseIssueResult = {
  success?: boolean;
  key?: string;
  transitionId?: string;
  transitionName?: string;
  toStatus?: string;
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

export async function fetchAssigneeTasks(
  apiBase: string,
  options?: { maxResults?: number },
): Promise<JiraBugPayload> {
  const base = apiBase.replace(/\/$/, '');
  const params = new URLSearchParams({ maxResults: String(options?.maxResults ?? 100) });
  const res = await fetch(`${base}/jira/assignee-tasks?${params.toString()}`);
  const data = (await res.json()) as JiraBugPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

export async function submitBugForTest(apiBase: string, issueKey: string): Promise<SubmitBugForTestResult> {
  const base = apiBase.replace(/\/$/, '');
  const key = issueKey.trim();
  if (!key) throw new Error('issue key 不能为空');
  const res = await fetch(`${base}/jira/issues/${encodeURIComponent(key)}/submit-for-test`, {
    method: 'POST',
  });
  const data = (await res.json()) as SubmitBugForTestResult;
  if (!res.ok || !data.success) {
    throw new Error(data.error || `提测失败 (${res.status})`);
  }
  return data;
}

export async function closeJiraIssue(apiBase: string, issueKey: string): Promise<CloseIssueResult> {
  const base = apiBase.replace(/\/$/, '');
  const key = issueKey.trim();
  if (!key) throw new Error('issue key 不能为空');
  const res = await fetch(`${base}/jira/issues/${encodeURIComponent(key)}/close`, {
    method: 'POST',
  });
  const data = (await res.json()) as CloseIssueResult;
  if (!res.ok || !data.success) {
    throw new Error(data.error || `关闭失败 (${res.status})`);
  }
  return data;
}
