/* AI 生成 By Peng.Guo */
import { Buffer } from 'buffer';
import { config } from '../config/default.js';
import { CloseIssueDefaults, type CloseIssueDefaultsConfig } from './jira-close-issue-defaults.js';
import {
  TransitionScreenFieldMapper,
  type JiraTransitionFields,
} from './jira-transition-screen-field-mapper.js';

export type CloseIssueResult = {
  success: boolean;
  key: string;
  transitionId?: string;
  transitionName?: string;
  toStatus?: string;
  error?: string;
};

type JiraTransition = {
  id?: string;
  name?: string;
  to?: { name?: string };
  fields?: JiraTransitionFields;
};

type JiraIssueFields = {
  summary?: string;
  assignee?: { name?: string; key?: string; displayName?: string };
  fixVersions?: Array<{ name?: string; id?: string }>;
  [fieldId: string]: unknown;
};

function getAuthHeader(): string {
  const username = config.jira.username.trim();
  const password = config.jira.password.trim();
  if (!username || !password) {
    throw new Error('Jira 认证信息缺失：请在环境变量中配置 JIRA_USERNAME 和 JIRA_PASSWORD。');
  }
  const basic = Buffer.from(`${username}:${password}`, 'utf-8').toString('base64');
  return `Basic ${basic}`;
}

function resolveBaseUrl(): string {
  const baseUrl = config.jira.baseUrl.trim().replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('Jira 地址未配置：请设置 JIRA_BASE_URL。');
  }
  return baseUrl;
}

function buildDefaultsConfig(): CloseIssueDefaultsConfig {
  return {
    resolution: config.jira.closeIssue.resolution,
  };
}

function formatOptionValue(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as { value?: string; name?: string };
    return (o.value ?? o.name ?? '').trim();
  }
  return '';
}

function findScreenFieldId(screenFields: JiraTransitionFields, fieldName: string): string | undefined {
  const target = fieldName.trim();
  for (const [id, meta] of Object.entries(screenFields)) {
    if ((meta.name ?? '').trim() === target) return id;
  }
  return undefined;
}

async function listTransitions(
  baseUrl: string,
  authHeader: string,
  issueKey: string,
): Promise<JiraTransition[]> {
  const url = `${baseUrl}/rest/api/2/issue/${encodeURIComponent(issueKey)}/transitions?expand=transitions.fields`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: authHeader },
  });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`拉取工作流失败(${res.status}): ${bodyText || res.statusText}`);
  }
  const data = (await res.json()) as { transitions?: JiraTransition[] };
  return data.transitions ?? [];
}

function findTransitionByName(transitions: JiraTransition[], name: string): JiraTransition | undefined {
  const target = name.trim().toLowerCase();
  return transitions.find((t) => (t.name ?? '').trim().toLowerCase() === target);
}

async function fetchIssueFields(
  baseUrl: string,
  authHeader: string,
  issueKey: string,
  fieldIds: string[],
): Promise<JiraIssueFields> {
  const unique = [...new Set(fieldIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  const params = new URLSearchParams({ fields: unique.join(',') });
  const res = await fetch(`${baseUrl}/rest/api/2/issue/${encodeURIComponent(issueKey)}?${params}`, {
    headers: { Accept: 'application/json', Authorization: authHeader },
  });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`读取 issue 失败(${res.status}): ${bodyText || res.statusText}`);
  }
  const data = (await res.json()) as { fields?: JiraIssueFields };
  return data.fields ?? {};
}

async function doTransition(
  baseUrl: string,
  authHeader: string,
  issueKey: string,
  transitionId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${baseUrl}/rest/api/2/issue/${encodeURIComponent(issueKey)}/transitions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({
      transition: { id: transitionId },
      fields,
    }),
  });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`执行关闭失败(${res.status}): ${bodyText || res.statusText}`);
  }
}

/**
 * Application：对指定 issue 执行「关闭问题」工作流转场，并按默认策略填充屏字段。
 */
export async function closeIssue(issueKeyRaw: string): Promise<CloseIssueResult> {
  const key = issueKeyRaw.trim().toUpperCase();
  if (!key) {
    return { success: false, key: '', error: 'issue key 不能为空' };
  }

  try {
    const baseUrl = resolveBaseUrl();
    const authHeader = getAuthHeader();
    const transitionName = config.jira.closeIssue.transitionName.trim() || '关闭问题';

    const transitions = await listTransitions(baseUrl, authHeader, key);
    const transition = findTransitionByName(transitions, transitionName);
    if (!transition?.id) {
      const available = transitions.map((t) => t.name).filter(Boolean).join('、') || '（无）';
      return {
        success: false,
        key,
        error: `当前状态不可执行「${transitionName}」。可用流转：${available}`,
      };
    }

    const screenFields = transition.fields ?? {};
    const defectTypeFieldId = findScreenFieldId(screenFields, '缺陷类型');
    const issueFields = await fetchIssueFields(baseUrl, authHeader, key, [
      'assignee',
      'fixVersions',
      ...(defectTypeFieldId ? [defectTypeFieldId] : []),
    ]);

    const assigneeName = (issueFields.assignee?.name ?? issueFields.assignee?.key ?? '').trim();
    const fixVersionNames = (issueFields.fixVersions ?? [])
      .map((v) => (v.name ?? '').trim())
      .filter(Boolean)
      .join(',');
    const defectType = defectTypeFieldId
      ? formatOptionValue(issueFields[defectTypeFieldId]) || undefined
      : undefined;

    const defaults = new CloseIssueDefaults(buildDefaultsConfig());
    const intent = defaults.buildIntent({
      defectType,
      assignee: assigneeName || undefined,
      fixVersions: fixVersionNames || undefined,
    });
    const mapper = TransitionScreenFieldMapper.createDefault();
    const fields = mapper.buildFields(screenFields, intent, { actionLabel: '关闭' });

    await doTransition(baseUrl, authHeader, key, transition.id, fields);

    return {
      success: true,
      key,
      transitionId: transition.id,
      transitionName: transition.name,
      toStatus: transition.to?.name,
    };
  } catch (err) {
    return {
      success: false,
      key,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
