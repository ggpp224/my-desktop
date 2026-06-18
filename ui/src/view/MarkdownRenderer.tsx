/* AI 生成 By Peng.Guo */
import { isValidElement, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { APP_THEME_TOKENS, type AppThemeTokens } from '../domain/theme/appTheme';
import { Button } from './Button';

export type MarkdownRendererVariant = 'default' | 'tech-digest';

type MarkdownRendererProps = {
  markdown: string;
  onLinkClick?: (href: string) => boolean;
  themeTokens?: AppThemeTokens;
  variant?: MarkdownRendererVariant;
};

const MARKDOWN_SYNTAX_REG = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|\[[^\]]+\]\([^)]+\)|\|.+\|/m;

/** 将榜单条目中断行缩进，修复旧缓存中描述段落顶格的问题 */
function normalizeTechDigestMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let inNumberedEntry = false;

  for (const line of lines) {
    const isNumberedTitle = /^\d+\.\s+\*\*/.test(line);
    const isHeading = /^#{1,6}\s/.test(line);
    const isBlockquote = /^>\s/.test(line);
    const isHorizontalRule = /^---\s*$/.test(line);
    const isEmpty = line.trim() === '';
    const isAlreadyIndented = /^    /.test(line);

    if (isNumberedTitle) {
      inNumberedEntry = true;
      result.push(line);
      continue;
    }

    if (isHeading || isHorizontalRule) {
      inNumberedEntry = false;
      result.push(line);
      continue;
    }

    if (inNumberedEntry && !isEmpty && !isAlreadyIndented && !isBlockquote) {
      result.push(`    ${line}`);
      continue;
    }

    if (!isEmpty && !isAlreadyIndented && !isBlockquote) {
      inNumberedEntry = false;
    }

    result.push(line);
  }

  return result.join('\n');
}

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
  themeTokens,
}: {
  className?: string;
  children: React.ReactNode;
  themeTokens: AppThemeTokens;
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
        <Button
          themeTokens={themeTokens}
          variant="soft"
          size="sm"
          onClick={() => void handleCopy()}
        >
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({
  markdown,
  onLinkClick,
  themeTokens = APP_THEME_TOKENS.blue,
  variant = 'default',
}: MarkdownRendererProps) {
  const rootClass =
    variant === 'tech-digest'
      ? 'markdown-body gitlab-markdown-body tech-digest-markdown'
      : 'markdown-body gitlab-markdown-body';

  const renderedMarkdown = variant === 'tech-digest' ? normalizeTechDigestMarkdown(markdown) : markdown;

  return (
    <div className={rootClass}>
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
            return <CodeBlock className={className} themeTokens={themeTokens}>{children}</CodeBlock>;
          },
        }}
      >
        {renderedMarkdown}
      </ReactMarkdown>
    </div>
  );
}
