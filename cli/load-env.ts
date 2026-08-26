/* AI 生成 By Peng.Guo */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, '.env');
if (existsSync(envPath)) {
  loadDotenv({ path: envPath, override: false, quiet: true });
}
if (process.cwd() !== repoRoot) {
  process.chdir(repoRoot);
}

export function getMyDesktopRoot(): string {
  return repoRoot;
}
