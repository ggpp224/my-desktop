/* AI 生成 By Peng.Guo */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { marked } from 'marked';
import hljs from 'highlight.js';

const require = createRequire(import.meta.url);

const GITHUB_MD_CSS = readFileSync(
  require.resolve('github-markdown-css/github-markdown.css'),
  'utf8'
);
const HLJS_CSS = readFileSync(require.resolve('highlight.js/styles/github.min.css'), 'utf8');

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 识别 Mermaid 图（含 flowchart TB、subgraph 等） */
export function isMermaidDiagramSource(text: string, lang?: string): boolean {
  const normalizedLang = (lang ?? '').trim().toLowerCase();
  if (normalizedLang === 'mermaid') return true;
  const head = text.trim().split('\n')[0]?.trim() ?? '';
  return /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|C4Context|block-beta)\b/i.test(
    head
  );
}

const MERMAID_CSS = `
.mermaid-svg-wrap {
  margin: 16px 0;
  text-align: center;
  overflow-x: auto;
}
.mermaid-svg-wrap svg {
  max-width: 100%;
  height: auto;
}
pre.mermaid-error {
  color: #cf222e;
  background: #fff8f8;
  border: 1px solid #ff8182;
  border-radius: 6px;
  padding: 12px;
  white-space: pre-wrap;
  font-size: 12px;
}
`;

const GITLAB_EXTRA_CSS = `
body {
  margin: 0;
  padding: 24px;
  background: #fff;
}
.gitlab-markdown-body {
  box-sizing: border-box;
  max-width: 980px;
  margin: 0 auto;
  background: #fff;
  color: #24292f;
  border: 1px solid #d8dee4;
  border-radius: 8px;
  padding: 16px 20px;
  font-size: 14px;
  line-height: 1.7;
}
.gitlab-markdown-body.markdown-body h1,
.gitlab-markdown-body.markdown-body h2,
.gitlab-markdown-body.markdown-body h3,
.gitlab-markdown-body.markdown-body h4,
.gitlab-markdown-body.markdown-body h5,
.gitlab-markdown-body.markdown-body h6 {
  color: #24292f;
  border-bottom-color: #d0d7de;
}
.gitlab-markdown-body.markdown-body table {
  display: table;
  width: max-content;
  max-width: 100%;
  overflow: auto;
  border-collapse: collapse;
}
.gitlab-markdown-body.markdown-body table th,
.gitlab-markdown-body.markdown-body table td {
  border: 1px solid #d0d7de;
  padding: 6px 13px;
}
.gitlab-markdown-body.markdown-body table tr:nth-child(2n) {
  background-color: #f6f8fa;
}
.gitlab-markdown-body.markdown-body pre {
  background: #f6f8fa;
  border: 1px solid #d8dee4;
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
}
.gitlab-markdown-body.markdown-body code {
  font-size: 0.9em;
}
@media print {
  body { padding: 0; }
  .gitlab-markdown-body { border: none; border-radius: 0; }
}
`;

marked.setOptions({ gfm: true, breaks: true });
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      if (isMermaidDiagramSource(text, lang)) {
        // 不用 class="mermaid"，避免 mermaid.min.js 在脚本加载时自动渲染导致 textContent 变成 CSS/SVG
        const encoded = encodeURIComponent(text.trim());
        return `<pre class="md-mermaid-pending" data-diagram="${encoded}"></pre>`;
      }
      const language = lang && hljs.getLanguage(lang) ? lang : undefined;
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
      const cls = language ? `hljs language-${language}` : 'hljs';
      return `<pre><code class="${cls}">${highlighted}</code></pre>`;
    },
  },
});

/** Electron 预览页加载的 Mermaid 浏览器单文件包（非 mermaid.core.mjs，避免裸 import） */
export function getMermaidMinJsPath(): string {
  return require.resolve('mermaid/dist/mermaid.min.js');
}

export function markdownContainsMermaid(markdown: string): boolean {
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(markdown)) !== null) {
    const info = match[1]?.trim();
    const body = match[2] ?? '';
    if (isMermaidDiagramSource(body, info)) return true;
  }
  return false;
}

/** 展开 `~` / `~/...`，其余路径原样返回 */
export function expandUserPath(filePath: string): string {
  const trimmed = filePath.trim();
  if (trimmed === '~') return homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(homedir(), trimmed.slice(2));
  }
  return trimmed;
}

/** 本机下载目录；`MD_PDF_OUTPUT_DIR` 可覆盖，`fallbackDir` 供 Electron `app.getPath('downloads')` */
export function resolvePdfOutputDir(fallbackDir?: string): string {
  const fromEnv = (process.env.MD_PDF_OUTPUT_DIR ?? '').trim();
  if (fromEnv) return path.resolve(expandUserPath(fromEnv));
  const fallback = (fallbackDir ?? '').trim();
  if (fallback) return path.resolve(expandUserPath(fallback));
  return path.join(homedir(), 'Downloads');
}

export function resolvePdfOutputPath(mdFilePath: string, fallbackDir?: string): string {
  const parsed = path.parse(mdFilePath);
  return path.join(resolvePdfOutputDir(fallbackDir), `${parsed.name}.pdf`);
}

export async function readMarkdownFromFile(filePath: string): Promise<string> {
  const normalized = path.resolve(filePath);
  if (!normalized.toLowerCase().endsWith('.md')) {
    throw new Error('仅支持 .md 文件');
  }
  return readFile(normalized, 'utf8');
}

/** 将 Markdown 转为带 GitLab/GitHub 表格样式的完整 HTML 文档 */
export function buildGitlabStyleHtmlDocument(markdown: string, title?: string): string {
  const bodyHtml = marked.parse(markdown) as string;
  const safeTitle = (title ?? 'Markdown').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>${GITHUB_MD_CSS}</style>
  <style>${HLJS_CSS}</style>
  <style>${MERMAID_CSS}</style>
  <style>${GITLAB_EXTRA_CSS}</style>
</head>
<body>
  <article class="markdown-body gitlab-markdown-body">${bodyHtml}</article>
</body>
</html>`;
}

export async function buildHtmlDocumentFromMdFile(
  mdFilePath: string,
  fallbackDir?: string
): Promise<{ html: string; pdfPath: string; hasMermaid: boolean }> {
  const md = await readMarkdownFromFile(mdFilePath);
  const title = path.basename(mdFilePath, path.extname(mdFilePath));
  const html = buildGitlabStyleHtmlDocument(md, title);
  const pdfPath = resolvePdfOutputPath(mdFilePath, fallbackDir);
  return { html, pdfPath, hasMermaid: markdownContainsMermaid(md) };
}
