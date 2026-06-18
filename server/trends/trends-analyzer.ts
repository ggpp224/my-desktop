/* AI 生成 By Peng.Guo */
import { config } from '../../config/default.js';
import type { AgentLlmOptions } from '../../agent/agent.js';
import { fetchOllamaApiChatWithThinkFallback, mergeStreamFragment, type ChatMessage } from '../../agent/ollama-client.js';
import { getOllamaActiveModel } from '../../agent/ollama-runtime.js';
import { streamGeminiText } from '../../agent/gemini-client.js';
import { buildDedupedItems, normalizeItemUrl } from './trends-keyword-filter.js';
import type { AnalyzedProject, PeriodTop20Rankings, RawTrendItem, TechDigestProgressHooks, TechDigestScope } from './trends-types.js';
import { buildWeeklyFrequencyMarkdown, queryWeeklyTopFrequency } from './trends-repository.js';

const BATCH_SIZE = 8;

type BatchProjectJson = {
  id: string;
  name: string;
  url: string;
  oneLiner: string;
  whyHot: string;
  innovation: string;
  worthStudying: boolean;
  worthStudyingReason: string;
  relevanceScore: number;
};

function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text.trim();
}

async function completeText(
  messages: ChatMessage[],
  llm: AgentLlmOptions | undefined,
  hooks?: TechDigestProgressHooks
): Promise<string> {
  const timeoutMs = config.techDigest.llmTimeoutMs;
  const signal =
    hooks?.signal ??
    (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  const useGemini = llm?.mode === 'external' && llm.provider === 'gemini';

  if (useGemini) {
    const apiKey = (llm.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
    const result = await streamGeminiText(messages, { apiKey, model: llm.model, baseUrl: llm.baseUrl }, {
      signal,
      onDelta: (textDelta) => hooks?.onLlmDelta?.({ contentDelta: textDelta }),
    });
    return result.text;
  }

  const chatBody: Record<string, unknown> = {
    model: getOllamaActiveModel(),
    messages,
    stream: true,
    ...(config.ollama.think !== undefined ? { think: config.ollama.think } : {}),
    options: {
      num_ctx: 8192,
      num_predict: 6144,
      temperature: config.techDigest.ollamaTemperature,
    },
  };

  const response = await fetchOllamaApiChatWithThinkFallback(chatBody, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`LLM 分析失败(${response.status}): ${errText || response.statusText}`);
  }
  if (!response.body) throw new Error('LLM 无响应体');

  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let accumContent = '';
  let accumThinking = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let data: { message?: ChatMessage; thinking?: string; done?: boolean };
      try {
        data = JSON.parse(line) as { message?: ChatMessage; thinking?: string; done?: boolean };
      } catch {
        continue;
      }
      const msg = data.message;
      if (msg && typeof msg.content === 'string' && msg.content.length > 0) {
        const { next, delta } = mergeStreamFragment(accumContent, msg.content);
        if (delta) hooks?.onLlmDelta?.({ contentDelta: delta });
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
        if (delta) hooks?.onLlmDelta?.({ thinkingDelta: delta });
        accumThinking = next;
      }
    }
  }

  return (accumContent.trim() || accumThinking.trim());
}

function buildBatchPrompt(items: Array<RawTrendItem & { sources: string[] }>, batchIndex: number, totalBatches: number): ChatMessage[] {
  const list = items
    .map(
      (item, i) =>
        `${i + 1}. id=${item.repoFullName?.toLowerCase() || normalizeItemUrl(item.url)}
   name=${item.title}
   url=${item.url}
   sources=${item.sources.join(',')}
   score=${item.score ?? 'n/a'}
   summary=${item.summary ?? ''}`
    )
    .join('\n\n');

  const userPrompt = `你是 AI 开发技术分析师。以下是从 GitHub Trending、Hacker News、Reddit 筛选出的热点条目（批次 ${batchIndex}/${totalBatches}）。

关注方向：Agent、MCP、Runtime、Workflow、IDE、Coding Agent 及相关工具。

**重要**：列表中每个条目都必须输出一条分析，不得跳过。与关注方向弱相关时仍写简介，并将 relevanceScore 设为 20–50；强相关设为 70–100。

输入列表：
${list}

字段长度要求（中文，宁详勿略）：
- oneLiner：2–3 句（约 50–100 字），说明项目定位、核心能力与适用场景
- whyHot：3–5 句（约 80–160 字），说明近期走红原因、社区讨论点或数据依据
- innovation：2–4 句（约 60–120 字），提炼架构或实现上的技术亮点
- worthStudyingReason：2–3 句（约 50–100 字），说明是否值得读源码及具体理由

请严格输出 JSON（不要其他文字）：
{
  "projects": [
    {
      "id": "与输入 id 一致",
      "name": "项目名",
      "url": "链接",
      "oneLiner": "详细一句话介绍（见上文字数要求）",
      "whyHot": "为什么火（见上文字数要求）",
      "innovation": "技术创新点（见上文字数要求）",
      "worthStudying": true,
      "worthStudyingReason": "是否值得研究源码及理由（见上文字数要求）",
      "relevanceScore": 85
    }
  ]
}`;

  return [{ role: 'user', content: userPrompt }];
}

function buildSummaryPromptForScope(
  scope: TechDigestScope,
  projects: AnalyzedProject[],
  weeklyFreqMarkdown: string
): ChatMessage[] {
  const projectList = projects
    .map(
      (p) =>
        `- id=${p.id} name=${p.name} score=${p.relevanceScore} worthStudying=${p.worthStudying}
  oneLiner=${p.oneLiner}
  whyHot=${p.whyHot}
  innovation=${p.innovation}`
    )
    .join('\n');

  if (scope === 'daily') {
    const userPrompt = `你是 AI 技术雷达主编。根据今日已分析项目，生成今日榜单与周趋势。

已分析项目：
${projectList}

近 7 天历史上榜频次：
${weeklyFreqMarkdown}

请严格输出 JSON：
{
  "top10": ["今日最值得关注的 project id，最多10个"],
  "top5SourceStudy": ["今日最值得研究源码的 project id，最多5个"],
  "trendsMarkdown": "本周技术趋势（Markdown）。要求 5–8 条，每条格式：\\n### 小标题\\n2–4 句展开说明，含具体项目/技术动向与对开发者的启示；避免只写短语。"
}`;
    return [{ role: 'user', content: userPrompt }];
  }

  const periodLabel = scope === 'monthly' ? '本月' : '半年度';
  const userPrompt = `你是 AI 技术雷达主编。根据${periodLabel}已分析项目，生成趋势总结。

已分析项目：
${projectList}

请严格输出 JSON：
{
  "trendsMarkdown": "${periodLabel}技术趋势（Markdown）。要求 5–8 条，每条格式：\\n### 小标题\\n2–4 句展开说明，偏 Agent/MCP/Runtime/Workflow/IDE；引用具体项目或社区现象，避免只写短语。"
}`;
  return [{ role: 'user', content: userPrompt }];
}

function renderProjectDetails(projects: AnalyzedProject[]): string {
  return projects
    .map((p) => {
      const worth = p.worthStudying ? `是 — ${p.worthStudyingReason}` : `否 — ${p.worthStudyingReason}`;
      return `### ${p.name}

- **链接**：[${p.url}](${p.url})
- **来源**：${p.sources.join('、')}
- **相关度**：${p.relevanceScore}/100

**项目概述**

${p.oneLiner}

**为什么火**

${p.whyHot}

**技术创新点**

${p.innovation}

**是否值得研究源码**：${worth}`;
    })
    .join('\n\n');
}

export function buildDailyReportMarkdown(
  projects: AnalyzedProject[],
  filtered: RawTrendItem[],
  rankings: PeriodTop20Rankings,
  top10: string[],
  top5: string[],
  weeklyTrends: string
): string {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const rawFallback = buildRawFallbackMap(filtered);
  const top10Lines = formatRankingLines(top10, projectMap, rawFallback, 'follow');
  const top5Lines = formatRankingLines(top5, projectMap, rawFallback, 'study');
  const dailyHot = formatRankingLines(rankings.topHot, projectMap, rawFallback, 'hot');
  const details = renderProjectDetails(projects);

  return `# 今日最值得关注项目 TOP10

${top10Lines || '（暂无）'}

# 今日最值得研究源码 TOP5

${top5Lines || '（暂无）'}

# 今日最热度 TOP20

${dailyHot || '（暂无）'}

# 本周技术趋势

${weeklyTrends}

---

## 项目详情

${details || '（暂无相关项目）'}
`;
}

const LONG_TERM_SECTION_TITLE: Record<Exclude<TechDigestScope, 'daily'>, string> = {
  monthly: '本月（GitHub Trending 按月 + Reddit 月榜）',
  halfYear: '半年度（GitHub 按月趋势 + Reddit 年榜近似）',
};

const LONG_TERM_TRENDS_TITLE: Record<Exclude<TechDigestScope, 'daily'>, string> = {
  monthly: '本月技术趋势',
  halfYear: '半年度技术趋势',
};

export function buildLongTermReportMarkdown(
  scope: Exclude<TechDigestScope, 'daily'>,
  projects: AnalyzedProject[],
  filtered: RawTrendItem[],
  rankings: PeriodTop20Rankings,
  trendsMarkdown: string
): string {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const rawFallback = buildRawFallbackMap(filtered);
  const details = renderProjectDetails(projects);

  return `# ${scope === 'monthly' ? '本月' : '半年度'}榜单

${renderPeriodTop20Section(LONG_TERM_SECTION_TITLE[scope], rankings, projectMap, rawFallback)}

# ${LONG_TERM_TRENDS_TITLE[scope]}

${trendsMarkdown}

---

## 项目详情

${details || '（暂无相关项目）'}
`;
}

function toAnalyzedProject(raw: BatchProjectJson, sources: string[]): AnalyzedProject {
  return {
    id: raw.id,
    name: raw.name,
    url: raw.url,
    sources: sources as AnalyzedProject['sources'],
    oneLiner: raw.oneLiner,
    whyHot: raw.whyHot,
    innovation: raw.innovation,
    worthStudying: Boolean(raw.worthStudying),
    worthStudyingReason: raw.worthStudyingReason,
    relevanceScore: Math.max(0, Math.min(100, Number(raw.relevanceScore) || 0)),
  };
}

type RankingDetailMode = 'follow' | 'study' | 'hot';

function truncateIntro(text: string, maxLen = 320): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/** 有序列表条目续行缩进，避免空行后段落脱离 li 顶格显示 */
function indentListContinuation(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `    ${line}`))
    .join('\n');
}

function appendListParagraph(lines: string[], paragraph: string | undefined): void {
  if (!paragraph?.trim()) return;
  lines.push('', indentListContinuation(paragraph.trim()));
}

function formatSingleRankingEntry(
  index: number,
  id: string,
  projectMap: Map<string, AnalyzedProject>,
  rawFallback: Map<string, RawTrendItem>,
  mode: RankingDetailMode
): string | null {
  const p = projectMap.get(id);
  const raw = rawFallback.get(id);
  const scoreTag = raw?.score != null ? ` · 热度 ${raw.score}` : '';

  if (p) {
    const lines: string[] = [];
    if (mode === 'hot') {
      lines.push(`${index}. **[${p.name}](${p.url})**（相关度 ${p.relevanceScore}/100${scoreTag}）`);
      appendListParagraph(lines, p.oneLiner);
      appendListParagraph(lines, p.whyHot ? `**为何火热**：${p.whyHot}` : undefined);
      appendListParagraph(lines, p.innovation ? `**技术亮点**：${p.innovation}` : undefined);
    } else if (mode === 'study') {
      lines.push(`${index}. **[${p.name}](${p.url})**（相关度 ${p.relevanceScore}/100）`);
      appendListParagraph(lines, `**研究价值**：${p.worthStudyingReason}`);
      appendListParagraph(lines, p.innovation ? `**技术亮点**：${p.innovation}` : undefined);
      appendListParagraph(lines, `**项目概述**：${p.oneLiner}`);
    } else {
      lines.push(`${index}. **[${p.name}](${p.url})**（相关度 ${p.relevanceScore}/100${scoreTag}）`);
      appendListParagraph(lines, p.oneLiner);
      appendListParagraph(lines, p.whyHot ? `**为何值得关注**：${p.whyHot}` : undefined);
      appendListParagraph(lines, p.innovation ? `**技术创新**：${p.innovation}` : undefined);
    }
    return lines.join('\n');
  }

  if (raw) {
    const scoreHint = raw.score != null ? `（热度 ${raw.score}）` : '';
    const lines = [`${index}. **[${raw.title}](${raw.url})**${scoreHint}`];
    const intro = (raw.summary ?? '').trim();
    if (intro) {
      appendListParagraph(lines, truncateIntro(intro));
    } else {
      appendListParagraph(lines, '_（暂无 LLM 深度分析；可结合标题与链接自行判断）_');
    }
    return lines.join('\n');
  }

  return null;
}

function formatRankingLines(
  ids: string[],
  projectMap: Map<string, AnalyzedProject>,
  rawFallback: Map<string, RawTrendItem>,
  mode: RankingDetailMode
): string {
  return ids
    .map((id, i) => formatSingleRankingEntry(i + 1, id, projectMap, rawFallback, mode))
    .filter(Boolean)
    .join('\n\n');
}

function buildRawFallbackMap(items: RawTrendItem[]): Map<string, RawTrendItem> {
  const map = new Map<string, RawTrendItem>();
  for (const item of items) {
    const id = item.repoFullName?.toLowerCase() || normalizeItemUrl(item.url);
    if (!map.has(id)) map.set(id, item);
  }
  return map;
}

function renderPeriodTop20Section(
  title: string,
  rankings: PeriodTop20Rankings,
  projectMap: Map<string, AnalyzedProject>,
  rawFallback: Map<string, RawTrendItem>
): string {
  return `## ${title}

### 最值得关注 TOP20

${formatRankingLines(rankings.topFollow, projectMap, rawFallback, 'follow') || '（暂无）'}

### 最值得研究源码 TOP20

${formatRankingLines(rankings.topSourceStudy, projectMap, rawFallback, 'study') || '（暂无）'}

### 最热度 TOP20

${formatRankingLines(rankings.topHot, projectMap, rawFallback, 'hot') || '（暂无）'}
`;
}

type ScopeAnalysisResult = {
  projects: AnalyzedProject[];
  top10: string[];
  top5SourceStudy: string[];
  topHot20: string[];
  trendsMarkdown: string;
};

export async function analyzeTrendItemsForScope(
  scope: TechDigestScope,
  filtered: RawTrendItem[],
  rankings: PeriodTop20Rankings,
  llm: AgentLlmOptions | undefined,
  hooks?: TechDigestProgressHooks
): Promise<ScopeAnalysisResult> {
  const emptyTrends =
    scope === 'daily'
      ? buildWeeklyFrequencyMarkdown(queryWeeklyTopFrequency())
      : scope === 'monthly'
        ? '本月暂无足够数据分析。'
        : '半年度暂无足够数据分析。';

  const deduped = buildDedupedItems(filtered);
  if (deduped.length === 0) {
    return {
      projects: [],
      top10: [],
      top5SourceStudy: [],
      topHot20: rankings.topHot,
      trendsMarkdown: emptyTrends,
    };
  }

  const allProjects: AnalyzedProject[] = [];
  const batches: Array<typeof deduped> = [];
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    batches.push(deduped.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i++) {
    hooks?.onProgress?.(`LLM 分析 (${i + 1}/${batches.length})`);
    const batch = batches[i]!;
    const text = await completeText(buildBatchPrompt(batch, i + 1, batches.length), llm, hooks);
    try {
      const parsed = JSON.parse(extractJsonBlock(text)) as { projects?: BatchProjectJson[] };
      for (const raw of parsed.projects ?? []) {
        const item = batch.find(
          (b) =>
            (b.repoFullName?.toLowerCase() || normalizeItemUrl(b.url)) === raw.id ||
            normalizeItemUrl(b.url) === raw.id
        );
        allProjects.push(toAnalyzedProject(raw, item?.sources ?? [item?.source ?? 'github']));
      }
    } catch {
      hooks?.onProgress?.(`批次 ${i + 1} JSON 解析失败，跳过`);
    }
  }

  allProjects.sort((a, b) => b.relevanceScore - a.relevanceScore);

  hooks?.onProgress?.('生成榜单与趋势总结');
  const weeklyFreq = buildWeeklyFrequencyMarkdown(queryWeeklyTopFrequency());
  const summaryText = await completeText(
    buildSummaryPromptForScope(scope, allProjects, weeklyFreq),
    llm,
    hooks
  );

  let top10: string[] = [];
  let top5SourceStudy: string[] = [];
  let trendsMarkdown = emptyTrends;

  try {
    const summary = JSON.parse(extractJsonBlock(summaryText)) as {
      top10?: string[];
      top5SourceStudy?: string[];
      trendsMarkdown?: string;
      weeklyTrendsMarkdown?: string;
      monthlyTrendsMarkdown?: string;
      halfYearTrendsMarkdown?: string;
    };
    if (scope === 'daily') {
      top10 = (summary.top10 ?? []).slice(0, 10);
      top5SourceStudy = (summary.top5SourceStudy ?? []).slice(0, 5);
      trendsMarkdown =
        summary.trendsMarkdown?.trim() ||
        summary.weeklyTrendsMarkdown?.trim() ||
        weeklyFreq;
    } else {
      trendsMarkdown =
        summary.trendsMarkdown?.trim() ||
        (scope === 'monthly' ? summary.monthlyTrendsMarkdown : summary.halfYearTrendsMarkdown)?.trim() ||
        emptyTrends;
    }
  } catch {
    if (scope === 'daily') {
      top10 = allProjects.slice(0, 10).map((p) => p.id);
      top5SourceStudy = allProjects.filter((p) => p.worthStudying).slice(0, 5).map((p) => p.id);
    }
  }

  return {
    projects: allProjects,
    top10,
    top5SourceStudy,
    topHot20: rankings.topHot,
    trendsMarkdown,
  };
}

export function resolveLlmModelLabel(llm: AgentLlmOptions | undefined): string {
  if (llm?.mode === 'external' && llm.provider === 'gemini') {
    return `gemini:${llm.model}`;
  }
  return `ollama:${getOllamaActiveModel()}`;
}
