/* AI 生成 By Peng.Guo */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type KnowledgeDoc = {
  id: string;
  filePath: string;
  text: string;
  mtimeMs: number;
};

// AI 生成 By Peng.Guo
export const PRIVATE_KB_DOC_DIR = 'runtime/private-kb';

// AI 生成 By Peng.Guo
export function getKnowledgeDocDirs(): string[] {
  // 仅允许显式导入的私人知识库目录参与检索，避免项目 doc/docs 被默认纳入
  return [PRIVATE_KB_DOC_DIR];
}

async function walkMarkdownFiles(dirAbs: string): Promise<string[]> {
  const files: string[] = [];
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
  try {
    entries = await fs.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(abs)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(abs);
    }
  }
  return files;
}

function buildStableId(dirRaw: string, dirAbs: string, fileAbs: string): string {
  const relInDir = path.relative(dirAbs, fileAbs).split(path.sep).join('/');
  const dirNorm = dirRaw.split(path.sep).join('/').replace(/^\/+|\/+$/g, '');
  const joined = `${dirNorm}/${relInDir}`.replace(/\/+/g, '/');
  if (!joined) return fileAbs;
  // AI 生成 By Peng.Guo：导入目录默认含时间戳（import-<ts>），若直接参与 id 会导致同文档每次都被判定为新文档
  // 这里将 volatile 目录名归一化，确保增量重建可稳定复用缓存
  return joined.replace(/(^|\/)runtime\/private-kb\/import-\d+(?=\/)/, '$1runtime/private-kb/import-latest');
}

export async function loadMarkdownKnowledgeDocs(rootDirAbs: string, docDirs: string[]): Promise<KnowledgeDoc[]> {
  const dedup = new Set<string>();
  const docs: KnowledgeDoc[] = [];
  for (const dir of docDirs) {
    const clean = dir.trim();
    if (!clean) continue;
    const dirAbs = path.resolve(rootDirAbs, clean);
    const mdFiles = await walkMarkdownFiles(dirAbs);
    for (const fileAbs of mdFiles) {
      if (dedup.has(fileAbs)) continue;
      dedup.add(fileAbs);
      const stat = await fs.stat(fileAbs);
      const text = await fs.readFile(fileAbs, 'utf-8');
      docs.push({
        id: buildStableId(clean, dirAbs, fileAbs),
        filePath: fileAbs,
        text,
        mtimeMs: stat.mtimeMs,
      });
    }
  }
  docs.sort((a, b) => a.filePath.localeCompare(b.filePath, 'zh-CN'));
  return docs;
}
