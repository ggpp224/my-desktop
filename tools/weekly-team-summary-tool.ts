/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';
import { fetchOllamaApiChatWithThinkFallback, mergeStreamFragment, type ChatMessage } from '../agent/ollama-client.js';
import { getOllamaActiveModel } from '../agent/ollama-runtime.js';
import { fetchWeeklyReportPageInfo } from './wiki-tool.js';
import { markdownToConfluenceWiki } from './markdown-to-confluence-wiki.js';
import { markdownToHtmlFragment } from './markdown-to-html.js';
import { compactConfluenceWikiBlankLines, normalizeMarkdownForWeeklyExport } from './weekly-report-markdown-normalize.js';

type OllamaMessage = { role: 'system' | 'user'; content: string };

type OllamaChatStreamLine = {
  message?: ChatMessage | null;
  thinking?: string;
  done?: boolean;
};

export interface WeeklyTeamSummaryDraftResult {
  success: boolean;
  wikiQuarter: string;
  wikiWeekRange: string;
  wikiTargetUrl: string;
  wikiPageId: string;
  /** 送入模型的 HTML 字符数（可能已截断） */
  sourceHtmlChars: number;
  /** 富文本 HTML */
  reportHtml: string;
  /** Legacy Wiki */
  reportWiki: string;
}

const TEAM_SUMMARY_OLLAMA_OPTIONS = {
  num_ctx: Math.max(4096, Math.min(131072, Number(process.env.OLLAMA_TEAM_SUMMARY_NUM_CTX ?? 16384) || 16384)),
  num_predict: Math.max(1024, Math.min(8192, Number(process.env.OLLAMA_TEAM_SUMMARY_NUM_PREDICT ?? 4096) || 4096)),
};

const TEAM_SUMMARY_FETCH_MS = Number(process.env.OLLAMA_TEAM_SUMMARY_TIMEOUT_MS ?? process.env.OLLAMA_WEEKLY_REPORT_TIMEOUT_MS ?? 600_000);

const TEAM_SUMMARY_MAX_HTML_CHARS = Math.max(5000, Math.min(800_000, Number(process.env.WEEKLY_TEAM_SUMMARY_MAX_HTML_CHARS ?? 200_000) || 200_000));

function buildWeeklyTeamSummaryPrompt(htmlSource: string): OllamaMessage[] {
  const userPrompt = `# Role
你是一位精通数据清洗与信息提取的资深技术项目经理。你擅长从复杂的 HTML/网页结构中精准提取关键业务信息，并将其转化为结构化的工作总结。

# Task
我将为你提供一段包含组内成员工作记录的 **HTML 源代码**。请你执行以下步骤：
1. **清洗数据**：忽略所有 HTML 标签、CSS 样式、脚本以及无关的导航信息，仅提取成员名称、日期、工作内容、状态等文本。
2. **逻辑整合**：基于提取的信息，按照指定的结构撰写一份【组内总结】。

# Input Data (HTML Source)
<<<BEGIN_HTML_SOURCE>>>
${htmlSource}
<<<END_HTML_SOURCE>>>

# Output Format & Requirements
请严格按照以下结构输出（Markdown 格式）：

## 1. 核心开发与功能进展
- 总结本阶段完成的关键功能开发、前后端联调及业务闭环情况。
- 重点突出高价值的产出（如：核心接口上线、新模块跑通）。

## 2. 系统运维与环境配置
- 总结服务器部署、数据库变更、域名解析、环境维护等工作。
- 记录针对系统稳定性、性能所做的具体优化。

## 3. 问题排查与质量保障
- 汇总 Bug 修复进度、线上异常排查、日志分析及代码质量控制情况。

## 4. 协作对接与文档产出
- 总结与外部供应商（如：文中提到的第三方平台）、产品或设计的对接成果。
- 记录技术方案、接口文档的更新。

## 5. 待办事项与风险预警
- 梳理未完成的任务及下一阶段计划，标注出潜在的延期风险或技术瓶颈。

# Writing Style
- **专业且客观**：使用专业技术术语，避免口语化描述。
- **结构化呈现**：使用 Markdown 列表，对关键任务和状态（如：已完成、处理中）进行**加粗**。
- **智能合并**：自动识别并合并多人参与的同一项任务，不要简单堆砌原始记录。`;

  return [{ role: 'user', content: userPrompt }];
}

async function summarizeTeamSummaryByOllama(
  htmlSource: string,
  hooks?: { onProgress?: (message: string) => void; onStreamDelta?: (d: { thinkingDelta?: string; contentDelta?: string }) => void }
): Promise<{ reportHtml: string; reportWiki: string }> {
  const timeoutMs = Number.isFinite(TEAM_SUMMARY_FETCH_MS) && TEAM_SUMMARY_FETCH_MS > 0 ? TEAM_SUMMARY_FETCH_MS : 600_000;
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  hooks?.onProgress?.('已连接模型，开始流式生成组内总结…');

  const chatBody: Record<string, unknown> = {
    model: getOllamaActiveModel(),
    messages: buildWeeklyTeamSummaryPrompt(htmlSource) as ChatMessage[],
    stream: true,
    ...(config.ollama.think !== undefined ? { think: config.ollama.think } : {}),
    options: TEAM_SUMMARY_OLLAMA_OPTIONS,
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
      throw new Error(`组内总结失败：请求超时（>${Math.round(timeoutMs / 1000)}s），可增大 OLLAMA_TEAM_SUMMARY_TIMEOUT_MS`);
    }
    throw e;
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`组内总结失败(${response.status}): ${bodyText || response.statusText}`);
  }
  if (!response.body) throw new Error('组内总结失败：Ollama 无响应体');

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
    throw new Error('组内总结失败：模型未返回内容。可尝试增大 OLLAMA_TEAM_SUMMARY_NUM_CTX 或换模型');
  }
  hooks?.onProgress?.('组内总结正文已生成，正在生成 HTML 与 Wiki…');
  const md = normalizeMarkdownForWeeklyExport(text);
  const reportWiki = compactConfluenceWikiBlankLines(markdownToConfluenceWiki(md));
  const reportHtml = markdownToHtmlFragment(md);
  hooks?.onProgress?.('已生成 HTML 与 Wiki。');
  return { reportHtml, reportWiki };
}

export type GenerateWeeklyTeamSummaryHooks = {
  onProgress?: (message: string) => void;
  onStreamDelta?: (d: { thinkingDelta?: string; contentDelta?: string }) => void;
};

export async function generateWeeklyTeamSummary(hooks?: GenerateWeeklyTeamSummaryHooks): Promise<WeeklyTeamSummaryDraftResult> {
  hooks?.onProgress?.('正在抓取 wiki 周报页 HTML…');
  const wiki = await fetchWeeklyReportPageInfo();
  if (!wiki.success) {
    throw new Error(wiki.error ?? '抓取周报页失败，无法生成组内总结');
  }
  let html = (wiki.bodyStorage ?? '').trim();
  if (!html) {
    throw new Error('周报页正文为空，无法生成组内总结（请确认 Confluence 返回了 body.storage 或 body.view）');
  }
  const rawLen = html.length;
  if (html.length > TEAM_SUMMARY_MAX_HTML_CHARS) {
    html = `${html.slice(0, TEAM_SUMMARY_MAX_HTML_CHARS)}\n\n<!-- 以下内容因长度限制已截断，原始约 ${rawLen} 字符 -->`;
    hooks?.onProgress?.(`HTML 已截断至 ${TEAM_SUMMARY_MAX_HTML_CHARS} 字符（原始 ${rawLen}），可调整 WEEKLY_TEAM_SUMMARY_MAX_HTML_CHARS / OLLAMA_TEAM_SUMMARY_NUM_CTX`);
  }
  hooks?.onProgress?.(`已获取 HTML ${html.length} 字符（wiki 周区间：${wiki.weekRange || wiki.pageTitle || '—'}），正在调用本地模型…`);
  const { reportHtml, reportWiki } = await summarizeTeamSummaryByOllama(html, hooks);
  return {
    success: true,
    wikiQuarter: wiki.quarter,
    wikiWeekRange: wiki.weekRange,
    wikiTargetUrl: wiki.targetUrl,
    wikiPageId: wiki.pageId ?? '',
    sourceHtmlChars: html.length,
    reportHtml,
    reportWiki,
  };
}
