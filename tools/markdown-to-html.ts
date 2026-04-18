/* AI 生成 By Peng.Guo */
/**
 * 将周报常用 Markdown 转为安全 HTML 片段，便于粘贴到 Confluence 新版编辑器 / 表格单元格（富文本）。
 * 行内先替换为占位符，再对剩余文本 escape，最后还原标签，避免双重转义。
 */

const PH = '\uE000';
const fenceToken = (i: number) => `${PH}FENCE${i}${PH}`;
const htmlToken = (i: number) => `${PH}H${i}${PH}`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractFencedCodeBlocks(input: string): { text: string; blocks: string[] } {
  const blocks: string[] = [];
  const re = /^```([^\n]*)\n([\s\S]*?)^```/gm;
  const text = input.replace(re, (_m, _lang: string, body: string) => {
    const idx = blocks.length;
    const inner = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    blocks.push(`<pre><code>${escapeHtml(inner)}</code></pre>`);
    return `${fenceToken(idx)}\n`;
  });
  return { text, blocks };
}

function restoreFencePlaceholders(s: string, blocks: string[]): string {
  return s.replace(new RegExp(`${PH}FENCE(\\d+)${PH}`, 'g'), (_, i) => blocks[Number(i)] ?? '');
}

function inlineToHtml(s: string): string {
  const htmlChunks: string[] = [];
  const push = (html: string) => {
    const i = htmlChunks.length;
    htmlChunks.push(html);
    return htmlToken(i);
  };

  let t = s.replace(/`([^`\n]+)`/g, (_m, code: string) => push(`<code>${escapeHtml(code)}</code>`));
  t = t.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) =>
    push(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`)
  );
  t = t.replace(/\*\*([^*]+)\*\*/g, (_m, x: string) => push(`<strong>${escapeHtml(x)}</strong>`));
  t = t.replace(/__([^_]+)__/g, (_m, x: string) => push(`<strong>${escapeHtml(x)}</strong>`));
  t = escapeHtml(t);
  return t.replace(new RegExp(`${PH}H(\\d+)${PH}`, 'g'), (_, i) => htmlChunks[Number(i)] ?? '');
}

function lineMarkdownHeadingToHtml(line: string): string | null {
  const m = line.match(/^(\s{0,3})(#{1,6})\s+(.+)$/);
  if (!m) return null;
  const level = m[2].length;
  const tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  const tight =
    level <= 2 ? 'margin:0.28em 0 0.12em' : level === 3 ? 'margin:0.22em 0 0.1em' : 'margin:0.18em 0 0.08em';
  return `<${tag} style="${tight}">${inlineToHtml(m[3].trimEnd())}</${tag}>`;
}

function matchListLine(line: string): { depth: number; body: string } | null {
  const m = line.match(/^(\s*)[-*+]\s+(.*)$/);
  if (!m) return null;
  const depth = Math.floor(m[1].length / 2);
  return { depth, body: m[2] };
}

function matchOrderedListLine(line: string): { depth: number; body: string } | null {
  const m = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (!m) return null;
  const depth = Math.floor(m[1].length / 2);
  return { depth, body: m[3] };
}

function lineHorizontalRule(line: string): string | null {
  if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) return '<hr />';
  return null;
}

/** 将连续列表行收进单个 ul，用 margin-left 表达嵌套（粘贴到表格时结构更稳） */
function blockLinesToHtml(lines: string[]): string {
  const parts: string[] = [];
  let i = 0;
  const flushList = (buf: { depth: number; body: string }[]) => {
    if (buf.length === 0) return;
    parts.push('<ul style="margin:0.2em 0 0.28em 1em;padding:0">');
    for (const it of buf) {
      const ml = it.depth * 1.25;
      const style = ml > 0 ? ` style="margin-left:${ml}em;list-style-type:disc;margin:0.12em 0"` : ' style="margin:0.12em 0"';
      parts.push(`<li${style}>${inlineToHtml(it.body)}</li>`);
    }
    parts.push('</ul>');
  };

  let listBuf: { depth: number; body: string }[] = [];
  let olBuf: string[] = [];

  const flushOl = () => {
    if (olBuf.length === 0) return;
    parts.push(`<ol style="margin:0.2em 0 0.28em 1em;padding:0">${olBuf.map((b) => `<li style="margin:0.12em 0">${inlineToHtml(b)}</li>`).join('')}</ol>`);
    olBuf = [];
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw ?? '';
    if (line.includes(`${PH}FENCE`)) {
      flushList(listBuf);
      listBuf = [];
      flushOl();
      parts.push(line);
      i++;
      continue;
    }
    if (!line.trim()) {
      flushList(listBuf);
      listBuf = [];
      flushOl();
      // 不 push 空串：避免 </h1>\n\n<h2>、</ul>\n\n<h2> 等被编辑器当成多段空白而纵向拉大
      i++;
      continue;
    }

    const hr = lineHorizontalRule(line);
    if (hr) {
      flushList(listBuf);
      listBuf = [];
      flushOl();
      parts.push(hr);
      i++;
      continue;
    }

    const h = lineMarkdownHeadingToHtml(line);
    if (h) {
      flushList(listBuf);
      listBuf = [];
      flushOl();
      parts.push(h);
      i++;
      continue;
    }

    const ol = matchOrderedListLine(line);
    if (ol) {
      flushList(listBuf);
      listBuf = [];
      olBuf.push(ol.body);
      i++;
      continue;
    }

    const ul = matchListLine(line);
    if (ul) {
      flushOl();
      listBuf.push(ul);
      i++;
      continue;
    }

    flushList(listBuf);
    flushOl();
    parts.push(`<p style="margin:0.18em 0">${inlineToHtml(line.trim())}</p>`);
    i++;
  }
  flushList(listBuf);
  flushOl();
  return parts.filter(Boolean).join('\n');
}

export function markdownToHtmlFragment(source: string): string {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return '';

  const { text: withoutFences, blocks } = extractFencedCodeBlocks(normalized);
  const lines = withoutFences.split('\n');
  let body = blockLinesToHtml(lines);
  body = restoreFencePlaceholders(body, blocks);
  return `<div class="weekly-report-html">${body.trim()}</div>`;
}
