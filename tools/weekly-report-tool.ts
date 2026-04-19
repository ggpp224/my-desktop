/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';
import { fetchOllamaApiChatWithThinkFallback, mergeStreamFragment, type ChatMessage } from '../agent/ollama-client.js';
import { getOllamaActiveModel } from '../agent/ollama-runtime.js';
import { searchWeeklyDoneTasks, searchWeeklyHandoffBugs } from './jira-tool.js';
import { markdownToConfluenceWiki } from './markdown-to-confluence-wiki.js';
import { markdownToHtmlFragment } from './markdown-to-html.js';
import { compactConfluenceWikiBlankLines, normalizeMarkdownForWeeklyExport } from './weekly-report-markdown-normalize.js';

type OllamaMessage = { role: 'system' | 'user'; content: string };

type OllamaChatStreamLine = {
  message?: ChatMessage | null;
  thinking?: string;
  done?: boolean;
};

export interface WeeklyReportDraftResult {
  success: boolean;
  total: number;
  jiraTitles: string[];
  /** 富文本 HTML，粘贴到 Confluence 新版 / 表格单元格时优先使用 */
  reportHtml: string;
  /** Legacy Wiki 标记（「插入 → Wiki」或仍解析 Wiki 的环境） */
  reportWiki: string;
}

function buildWeeklyReportPrompt(jiraTitles: string[]): OllamaMessage[] {
  const titlesText = jiraTitles.length > 0 ? jiraTitles.map((line) => `- ${line}`).join('\n') : '- 本周暂无已完成任务';
  const userPrompt = `# Role
你是一位专业的项目管理助手，擅长将零散的 Jira 任务标题整理成逻辑清晰、专业练达的工作周报。

# Task
请根据以下提供的 Jira 任务标题列表撰写本周工作总结。列表合并自「本周已完成」与「本周曾由我经办、当前经办/开发已不含我」的缺陷（同一编号仅一条）。

# Requirement
1. **归类总结**：不要直接翻译标题，请将相似的任务合并，并归纳为“重点项目推进”、“日常运维/Bug修复”、“跨部门协作”等模块。
2. **语言风格**：使用专业、职场化的中文，多用动词（如：完成、优化、推进、解决）。
3. **精简提炼**：忽略 Jira 编号，直接提取核心业务价值。
4. **格式要求**：周报正文请使用 **Markdown** 书写（便于阅读与生成），结构清晰即可。建议：
   - 标题：一级用一行「# 本周工作总结」，模块用「## 模块名」，小节可用「###」。
   - 列表：模块下用「- 」开头的无序列表归纳要点；需要时可用「1. 」有序列表。
   - 强调：关键字可用「**加粗**」；链接用「[说明](https://...)」。
   - 代码或片段：可用行内反引号或 Markdown 围栏代码块。
5. **排版**：章节之间、标题与列表之间**不要连续多行空行**（最多一个空行）；否则粘贴到 Wiki/表格后会出现很大段纵向留白。
   （说明：系统会在保存结果前自动将正文转为 HTML 与 Confluence Wiki，你只需按 Markdown 输出。）
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

async function summarizeWeeklyReportByOllama(
  jiraTitles: string[],
  hooks?: { onProgress?: (message: string) => void; onStreamDelta?: (d: { thinkingDelta?: string; contentDelta?: string }) => void }
): Promise<{ reportHtml: string; reportWiki: string }> {
  const timeoutMs = Number.isFinite(WEEKLY_REPORT_FETCH_MS) && WEEKLY_REPORT_FETCH_MS > 0 ? WEEKLY_REPORT_FETCH_MS : 600_000;
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  hooks?.onProgress?.('已连接模型，开始流式生成周报…');

  const chatBody: Record<string, unknown> = {
    model: getOllamaActiveModel(),
    messages: buildWeeklyReportPrompt(jiraTitles) as ChatMessage[],
    stream: true,
    ...(config.ollama.think !== undefined ? { think: config.ollama.think } : {}),
    options: WEEKLY_REPORT_OLLAMA_OPTIONS,
  };

  let response: Response;
  try {
    response = await fetchOllamaApiChatWithThinkFallback(chatBody, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error(`周报总结失败：请求超时（>${Math.round(timeoutMs / 1000)}s），可增大环境变量 OLLAMA_WEEKLY_REPORT_TIMEOUT_MS`);
    }
    throw e;
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`周报总结失败(${response.status}): ${bodyText || response.statusText}`);
  }
  if (!response.body) throw new Error('周报总结失败：Ollama 无响应体');

  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let accumContent = '';
  let accumThinking = '';
  let lastDoneMessage: ChatMessage | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let data: OllamaChatStreamLine;
      try {
        data = JSON.parse(line) as OllamaChatStreamLine;
      } catch {
        continue;
      }
      const msg = data.message;
      if (msg && typeof msg.content === 'string' && msg.content.length > 0) {
        const { next, delta } = mergeStreamFragment(accumContent, msg.content);
        if (delta) hooks?.onStreamDelta?.({ contentDelta: delta });
        accumContent = next;
      }
      const lineThinking =
        typeof data.thinking === 'string' && data.thinking.length > 0
          ? data.thinking
          : typeof msg?.thinking === 'string' && msg.thinking.length > 0
            ? msg.thinking
            : '';
      if (lineThinking) {
        const { next, delta } = mergeStreamFragment(accumThinking, lineThinking);
        if (delta) hooks?.onStreamDelta?.({ thinkingDelta: delta });
        accumThinking = next;
      }
      if (data.done === true && msg) lastDoneMessage = msg;
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      const data = JSON.parse(tail) as OllamaChatStreamLine;
      if (data.message) lastDoneMessage = data.message;
    } catch {
      /* ignore */
    }
  }

  const finalContent =
    lastDoneMessage?.content && String(lastDoneMessage.content).length > accumContent.length
      ? String(lastDoneMessage.content)
      : accumContent;
  const finalThinking = (lastDoneMessage?.thinking ?? '').trim() || accumThinking;
  const content = finalContent.trim();
  const thinking = finalThinking.trim();
  const text = content || thinking;
  if (!text) {
    throw new Error(
      '周报总结失败：模型未返回内容（content/thinking 均为空）。可尝试换模型、或检查 num_ctx 是否够容纳 Jira 列表'
    );
  }
  hooks?.onProgress?.('周报正文已生成完毕，正在生成 HTML 与 Wiki…');
  const md = normalizeMarkdownForWeeklyExport(text);
  const reportWiki = compactConfluenceWikiBlankLines(markdownToConfluenceWiki(md));
  const reportHtml = markdownToHtmlFragment(md);
  hooks?.onProgress?.('已生成 HTML（富文本粘贴）与 Wiki。');
  return { reportHtml, reportWiki };
}

export type WriteWeeklyReportHooks = {
  onProgress?: (message: string) => void;
  onStreamDelta?: (d: { thinkingDelta?: string; contentDelta?: string }) => void;
};

// AI 生成 By Peng.Guo
function mergeWeeklyReportIssueLines(
  doneIssues: Array<{ key: string; summary: string }>,
  handoffIssues: Array<{ key: string; summary: string }>,
  maxLines: number
): string[] {
  const limit = Math.max(1, Math.min(100, Math.floor(maxLines)));
  const byKey = new Map<string, string>();
  const push = (issue: { key: string; summary: string }) => {
    const k = issue.key.trim();
    if (!k || byKey.has(k)) return;
    const line = `${issue.key} ${issue.summary}`.trim();
    if (line) byKey.set(k, line);
  };
  for (const issue of doneIssues) push(issue);
  for (const issue of handoffIssues) push(issue);
  return [...byKey.values()].slice(0, limit);
}

export async function writeWeeklyReport(
  maxResults = 100,
  hooks?: WriteWeeklyReportHooks
): Promise<WeeklyReportDraftResult> {
  hooks?.onProgress?.('正在查询本周已完成任务与本周经我手的 bug…');
  const limit = Math.max(1, Math.min(100, Math.floor(maxResults)));
  const [doneResult, handoffResult] = await Promise.all([searchWeeklyDoneTasks(limit), searchWeeklyHandoffBugs(limit)]);
  const jiraTitles = mergeWeeklyReportIssueLines(doneResult.issues ?? [], handoffResult.issues ?? [], limit);
  hooks?.onProgress?.(`已获取 ${jiraTitles.length} 条任务标题（已合并去重），正在调用本地模型流式生成周报…`);
  const { reportHtml, reportWiki } = await summarizeWeeklyReportByOllama(jiraTitles, hooks);
  return {
    success: true,
    total: jiraTitles.length,
    jiraTitles,
    reportHtml,
    reportWiki,
  };
}
