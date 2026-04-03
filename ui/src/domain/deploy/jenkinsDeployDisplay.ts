/* AI 生成 By Peng.Guo */

/**
 * 在部署反馈文案后追加 Markdown 形式链接 `[label](url)`，由 View 层解析为可点击 `<a>`。
 */
export function withJenkinsMarkdownLink(
  text: string,
  url: string | undefined,
  linkLabel = '打开 Jenkins'
): string {
  const u = url?.trim();
  if (!u) return text;
  return `${text} [${linkLabel}](${u})`;
}
