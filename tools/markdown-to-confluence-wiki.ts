/* AI 生成 By Peng.Guo */
/**
 * 将周报常用 Markdown 转为 Confluence Legacy Wiki 标记（便于粘贴「插入 → Wiki 标记」）。
 * 非完整 CommonMark 解析器，覆盖标题 / 列表 / 加粗 / 链接 / 行内代码 / 围栏代码块等常见形态。
 */

const PH = '\uE000';
const fenceToken = (i: number) => `${PH}FENCE${i}${PH}`;
const inlineToken = (i: number) => `${PH}INLINE${i}${PH}`;

function extractFencedCodeBlocks(input: string): { text: string; blocks: string[] } {
  const blocks: string[] = [];
  const re = /^```([^\n]*)\n([\s\S]*?)^```/gm;
  const text = input.replace(re, (_m, _lang: string, body: string) => {
    const idx = blocks.length;
    const inner = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n?$/, '\n');
    blocks.push(`{code}\n${inner}{code}`);
    return `${fenceToken(idx)}\n`;
  });
  return { text, blocks };
}

function restoreFencePlaceholders(s: string, blocks: string[]): string {
  return s.replace(new RegExp(`${PH}FENCE(\\d+)${PH}`, 'g'), (_, i) => blocks[Number(i)] ?? '');
}

/** 行首 Markdown 标题 → h1. … h6. */
function lineMarkdownHeadingToWiki(line: string): string {
  const m = line.match(/^(\s{0,3})(#{1,6})\s+(.+)$/);
  if (!m) return line;
  const level = m[2].length;
  return `${m[1]}h${level}. ${m[3].trimEnd()}`;
}

/** 行首无序列表（含缩进层级）→ Wiki * / ** / *** */
function lineMarkdownUlToWiki(line: string): string {
  const m = line.match(/^(\s*)[-*+]\s+(.*)$/);
  if (!m) return line;
  const depth = Math.min(6, Math.floor(m[1].length / 2) + 1);
  return `${'*'.repeat(depth)} ${m[2]}`;
}

/** 行首有序列表 → Wiki # */
function lineMarkdownOlToWiki(line: string): string {
  const m = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (!m) return line;
  const depth = Math.min(6, Math.floor(m[1].length / 2) + 1);
  return `${'#'.repeat(depth)} ${m[3]}`;
}

function lineHorizontalRule(line: string): string {
  if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) return '----';
  return line;
}

function transformHeadingsAndHr(s: string): string {
  return s
    .split('\n')
    .map((line) => {
      if (line.includes(`${PH}FENCE`)) return line;
      let out = lineMarkdownHeadingToWiki(line);
      out = lineHorizontalRule(out);
      return out;
    })
    .join('\n');
}

function transformLists(s: string): string {
  return s
    .split('\n')
    .map((line) => {
      if (line.includes(`${PH}FENCE`) || line.includes(`${PH}INLINE`)) return line;
      let out = lineMarkdownOlToWiki(line);
      if (out === line) out = lineMarkdownUlToWiki(line);
      return out;
    })
    .join('\n');
}

/** 行内 **粗体**、__粗体__、[文本](url)、`代码`（先保护反引号块再处理加粗，避免误伤代码内星号） */
function inlineMarkdownToWiki(s: string): string {
  const inlineChunks: string[] = [];
  let t = s.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const i = inlineChunks.length;
    inlineChunks.push(`{{${code}}}`);
    return inlineToken(i);
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  t = t.replace(/__([^_]+)__/g, '*$1*');
  t = t.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, '[$1|$2]');
  t = t.replace(new RegExp(`${PH}INLINE(\\d+)${PH}`, 'g'), (_, i) => inlineChunks[Number(i)] ?? '');
  return t;
}

export function markdownToConfluenceWiki(source: string): string {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return '';

  const { text: withoutFences, blocks } = extractFencedCodeBlocks(normalized);
  let body = transformHeadingsAndHr(withoutFences);
  body = inlineMarkdownToWiki(body);
  body = transformLists(body);
  body = restoreFencePlaceholders(body, blocks);

  return body.trim();
}
