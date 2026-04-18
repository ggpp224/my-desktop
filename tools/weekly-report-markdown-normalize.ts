/* AI 生成 By Peng.Guo */
/**
 * 收敛模型周报 Markdown 中的多余空行与行尾空格，减轻转 Wiki/HTML 后粘贴到 Confluence 时出现过大段间距。
 */

/** 将 3 个及以上连续换行压成 2 个（最多保留一个“空段”）；行尾空白去掉 */
export function normalizeMarkdownForWeeklyExport(md: string): string {
  let s = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[ \t]+$/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** 在 {code}…{code} 块外压缩连续换行，避免破坏代码块内格式 */
export function compactConfluenceWikiBlankLines(wiki: string): string {
  return wiki
    .split(/(\{code\}[\s\S]*?\{code\})/g)
    .map((seg, idx) => (idx % 2 === 1 ? seg : seg.replace(/\n{3,}/g, '\n\n')))
    .join('')
    .trim();
}
