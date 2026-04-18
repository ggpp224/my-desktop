/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';
import { getOllamaActiveModel } from '../agent/ollama-runtime.js';
import { searchWeeklyDoneTasks } from './jira-tool.js';

type OllamaMessage = { role: 'system' | 'user'; content: string };

interface OllamaChatResponse {
  message?: { content?: string; thinking?: string };
}

export interface WeeklyReportDraftResult {
  success: boolean;
  total: number;
  jiraTitles: string[];
  report: string;
}

function buildWeeklyReportPrompt(jiraTitles: string[]): OllamaMessage[] {
  const titlesText = jiraTitles.length > 0 ? jiraTitles.map((line) => `- ${line}`).join('\n') : '- 本周暂无已完成任务';
  const userPrompt = `# Role
你是一位专业的项目管理助手，擅长将零散的 Jira 任务标题整理成逻辑清晰、专业练达的工作周报。

# Task
请根据以下提供的 Jira 任务标题列表，撰写一份本周工作总结。

# Requirement
1. **归类总结**：不要直接翻译标题，请将相似的任务合并，并归纳为“重点项目推进”、“日常运维/Bug修复”、“跨部门协作”等模块。
2. **语言风格**：使用专业、职场化的中文，多用动词（如：完成、优化、推进、解决）。
3. **精简提炼**：忽略 Jira 编号，直接提取核心业务价值。
4. **格式要求**：采用 Markdown 的无序列表格式。

# Jira Titles
[在此处粘贴你的 Jira 标题列表，例如：
- PROJ-123 优化登录页面加载速度
- PROJ-124 修复结算页地址选择崩溃问题
- PROJ-125 配合法务完成合规性检查]

${titlesText}

# Weekly Report`;

  return [{ role: 'user', content: userPrompt }];
}

/** 周报篇幅较长，放宽上下文与最大生成长度；部分推理模型正文在 thinking 字段 */
const WEEKLY_REPORT_OLLAMA_OPTIONS = {
  num_ctx: 8192,
  num_predict: 4096,
};

/** Ollama 慢请求：默认无超时，此处给足时间避免大模型/大列表被误判失败 */
const WEEKLY_REPORT_FETCH_MS = Number(process.env.OLLAMA_WEEKLY_REPORT_TIMEOUT_MS ?? 600_000);

async function summarizeWeeklyReportByOllama(jiraTitles: string[]): Promise<string> {
  const timeoutMs = Number.isFinite(WEEKLY_REPORT_FETCH_MS) && WEEKLY_REPORT_FETCH_MS > 0 ? WEEKLY_REPORT_FETCH_MS : 600_000;
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  let response: Response;
  try {
    response = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        model: getOllamaActiveModel(),
        messages: buildWeeklyReportPrompt(jiraTitles),
        stream: false,
        ...(config.ollama.think !== undefined ? { think: config.ollama.think } : {}),
        options: WEEKLY_REPORT_OLLAMA_OPTIONS,
      }),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error(`周报总结失败：请求超时（>${Math.round(timeoutMs / 1000)}s），可增大环境变量 OLLAMA_WEEKLY_REPORT_TIMEOUT_MS`);
    }
    throw e;
  }
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`周报总结失败(${response.status}): ${bodyText || response.statusText}`);
  }
  const data = (await response.json()) as OllamaChatResponse;
  const msg = data.message;
  const content = (msg?.content ?? '').trim();
  const thinking = (msg?.thinking ?? '').trim();
  const text = content || thinking;
  if (!text) {
    throw new Error(
      '周报总结失败：模型未返回内容（content/thinking 均为空）。可尝试换模型、或检查 num_ctx 是否够容纳 Jira 列表'
    );
  }
  return text;
}

export async function writeWeeklyReport(maxResults = 100): Promise<WeeklyReportDraftResult> {
  const jiraResult = await searchWeeklyDoneTasks(maxResults);
  const jiraTitles = (jiraResult.issues ?? [])
    .map((issue) => `${issue.key} ${issue.summary}`.trim())
    .filter(Boolean);
  const report = await summarizeWeeklyReportByOllama(jiraTitles);
  return {
    success: true,
    total: jiraTitles.length,
    jiraTitles,
    report,
  };
}
