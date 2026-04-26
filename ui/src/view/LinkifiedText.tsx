/* AI 生成 By Peng.Guo */

import type { ReactNode } from 'react';

const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

type LinkifiedTextProps = {
  text: string;
  linkColor?: string;
};

/**
 * 渲染纯文本，并将 `[label](https://...)` 转为可点击外链（与部署反馈中的 Jenkins 链接约定一致）。
 */
export function LinkifiedText({ text, linkColor = 'currentColor' }: LinkifiedTextProps): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(MD_LINK_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const href = m[2];
    const label = m[1];
    nodes.push(
      <a
        key={`${m.index}-${href}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: linkColor, textDecoration: 'underline' }}
      >
        {label}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <span style={{ whiteSpace: 'pre-wrap' }}>{nodes.length > 0 ? nodes : text}</span>;
}
