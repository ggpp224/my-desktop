/* AI 生成 By Peng.Guo */
/**
 * 扫描集成测试仓根目录的 .env / .env.<name>[.example]，得到可选执行环境。
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { IIntegrationTestEnv } from './integration-test-types.js';

const ENV_FILE_PATTERN = /^\.env\.([A-Za-z0-9_-]+?)(\.example)?$/;
const PORTAL_BASE_URL_PATTERN = /^\s*PORTAL_BASE_URL\s*=\s*(.*?)\s*$/m;

function readPortalBaseUrl(filePath: string): string {
  try {
    const m = readFileSync(filePath, 'utf8').match(PORTAL_BASE_URL_PATTERN);
    return m ? m[1].replace(/^['"]|['"]$/g, '') : '';
  } catch {
    return '';
  }
}

function toEnvOption(projectPath: string, id: string, fileNames: Set<string>): IIntegrationTestEnv {
  const fileName = id ? `.env.${id}` : '.env';
  const exampleName = `${fileName}.example`;
  const hasLocalFile = fileNames.has(fileName);
  const urlSource = hasLocalFile ? fileName : fileNames.has(exampleName) ? exampleName : '';
  return {
    id,
    label: id || '默认',
    hasLocalFile,
    fileName,
    portalBaseUrl: urlSource ? readPortalBaseUrl(path.join(projectPath, urlSource)) : '',
  };
}

/** 默认环境（只加载 .env）总在首位，其余按名称排序；目录不存在时抛出 */
export function scanIntegrationTestEnvs(projectPath: string): IIntegrationTestEnv[] {
  const fileNames = new Set(readdirSync(projectPath));
  const ids = new Set<string>();
  for (const name of fileNames) {
    const m = name.match(ENV_FILE_PATTERN);
    if (m && m[1] !== 'example') ids.add(m[1]);
  }
  return [
    toEnvOption(projectPath, '', fileNames),
    ...[...ids].sort().map((id) => toEnvOption(projectPath, id, fileNames)),
  ];
}
