/* AI 生成 By Peng.Guo */
import { isValidElement, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

type MarkdownRendererProps = {
  markdown: string;
  onLinkClick?: (href: string) => boolean;
};

const MARKDOWN_SYNTAX_REG = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|\[[^\]]+\]\([^)]+\)|\|.+\|/m;

export function isLikelyMarkdown(text: string): boolean {
  return MARKDOWN_SYNTAX_REG.test(text);
}

function extractTextFromNode(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map((item) => extractTextFromNode(item)).join('');
  if (isValidElement(node)) return extractTextFromNode(node.props.children);
  return '';
}

function buildCodeKey(className: string | undefined, codeText: string): string {
  const language = className ?? '';
  return `${language}::${codeText.slice(0, 100)}`;
}

function parseCodeLanguage(className?: string): string {
  if (!className) return 'text';
  const tokens = className.split(/\s+/).filter(Boolean);
  const languageToken = tokens.find((token) => token.startsWith('language-'));
  if (languageToken) return languageToken.replace('language-', '') || 'text';
  const fallback = tokens.find((token) => token !== 'hljs');
  return fallback || 'text';
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const codeText = useMemo(() => extractTextFromNode(children).replace(/\n$/, ''), [children]);
  const key = buildCodeKey(className, codeText);
  const language = parseCodeLanguage(className);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="gitlab-md-code-block" data-code-key={key}>
      <div className="gitlab-md-code-toolbar">
        <span>{language || 'text'}</span>
        <button type="button" onClick={() => void handleCopy()}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ markdown, onLinkClick }: MarkdownRendererProps) {
  return (
    <div className="markdown-body gitlab-markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a({ href, children }) {
            const target = (href ?? '').trim();
            if (!target) return <span>{children}</span>;
            return (
              <a
                href={target}
                onClick={(event) => {
                  const handled = onLinkClick?.(target) ?? false;
                  if (handled) event.preventDefault();
                }}
                target="_blank"
                rel="noreferrer"
              >
                {children}
              </a>
            );
          },
          code({ className, children }) {
            const plainText = extractTextFromNode(children);
            const isBlock = Boolean(className) || plainText.includes('\n');
            if (!isBlock) return <code className={className}>{children}</code>;
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
