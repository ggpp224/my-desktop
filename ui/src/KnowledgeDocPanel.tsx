/* AI 生成 By Peng.Guo */
import { useEffect, useState } from 'react';
import { MarkdownRenderer } from './view/MarkdownRenderer';

type KnowledgeDocPanelProps = {
  apiBase: string;
  sourcePath: string;
  onOpenKnowledgeDoc: (sourcePath: string) => void;
};

type KnowledgeDocumentPayload = {
  success?: boolean;
  path?: string;
  size?: number;
  modifiedAt?: string;
  content?: string;
  error?: string;
};

function resolveDocLinkPath(currentPath: string, href: string): string | null {
  const raw = href.trim();
  if (!raw) return null;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) return null;
  if (raw.startsWith('//')) return null;
  const cleanHref = raw.split('#')[0]?.split('?')[0] ?? '';
  if (!cleanHref) return null;
  const baseParts = currentPath.split('/').filter(Boolean);
  baseParts.pop();
  const inputParts = cleanHref.replace(/\\/g, '/').split('/').filter(Boolean);
  const stack = cleanHref.startsWith('/') ? [] : [...baseParts];
  for (const part of inputParts) {
    if (part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/');
}

export function KnowledgeDocPanel({ apiBase, sourcePath, onOpenKnowledgeDoc }: KnowledgeDocPanelProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<KnowledgeDocumentPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!apiBase || !sourcePath) return;
      setLoading(true);
      try {
        const resp = await fetch(`${apiBase}/knowledge-base/document?path=${encodeURIComponent(sourcePath)}`);
        const json = (await resp.json()) as KnowledgeDocumentPayload;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setData({ success: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiBase, sourcePath]);

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#94a3b8' }}>
        文档路径：<span style={{ color: '#93c5fd' }}>{sourcePath}</span>
      </div>
      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>正在加载文档...</div>
      ) : data?.success ? (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#94a3b8', display: 'flex', gap: 12 }}>
            {typeof data.size === 'number' ? <span>大小：{(data.size / 1024).toFixed(2)} KB</span> : null}
            {data.modifiedAt ? <span>修改时间：{new Date(data.modifiedAt).toLocaleString('zh-CN')}</span> : null}
          </div>
          <div style={{ overflow: 'auto', background: '#0d0d1a', borderRadius: 8, padding: 12 }}>
            <MarkdownRenderer
              markdown={data.content ?? ''}
              onLinkClick={(href) => {
                const nextPath = resolveDocLinkPath(sourcePath, href);
                if (!nextPath) return false;
                onOpenKnowledgeDoc(nextPath);
                return true;
              }}
            />
          </div>
        </div>
      ) : (
        <div style={{ color: '#fca5a5', fontSize: 13 }}>{data?.error ?? '加载失败'}</div>
      )}
    </section>
  );
}
