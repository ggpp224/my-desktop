/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';
import { listWatchedNpmPackages } from '../config/npm-watched-packages.js';

export type NpmDistTagEntry = {
  tag: string;
  version: string;
  publishedAt: string | null;
  /** 相对发布时间，如「2天前」 */
  publishedAgo: string | null;
  preferred: boolean;
};

export type NpmPackageVersionItem = {
  name: string;
  preferredTag: string;
  tags: NpmDistTagEntry[];
  error?: string;
};

export type NpmPackageVersionsResult = {
  success: boolean;
  fetchedAt: string;
  registry: string;
  packages: NpmPackageVersionItem[];
  error?: string;
};

type NpmRegistryPackageDoc = {
  name?: string;
  'dist-tags'?: Record<string, string>;
  time?: Record<string, string>;
};

const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

/** 相对时间文案（中文），供列表展示 */
export function formatPublishedAgo(iso: string | null | undefined, nowMs = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const delta = Math.max(0, nowMs - t);
  if (delta < MS_MINUTE) return '刚刚';
  if (delta < MS_HOUR) return `${Math.floor(delta / MS_MINUTE)}分钟前`;
  if (delta < MS_DAY) return `${Math.floor(delta / MS_HOUR)}小时前`;
  const days = Math.floor(delta / MS_DAY);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月前`;
  return `${Math.floor(months / 12)}年前`;
}

function encodePackagePath(name: string): string {
  // scoped: @scope/name → @scope%2Fname（npm registry 约定）
  if (name.startsWith('@')) {
    const slash = name.indexOf('/');
    if (slash > 0) {
      return `${name.slice(0, slash)}%2F${name.slice(slash + 1)}`;
    }
  }
  return encodeURIComponent(name);
}

export function buildNpmPackageMetadataUrl(registryBase: string, packageName: string): string {
  const base = registryBase.replace(/\/$/, '');
  return `${base}/${encodePackagePath(packageName)}`;
}

export function parseDistTagsFromRegistryDoc(
  doc: NpmRegistryPackageDoc,
  preferredTag: string,
  nowMs = Date.now()
): NpmDistTagEntry[] {
  const distTags = doc['dist-tags'] ?? {};
  const times = doc.time ?? {};
  const entries: NpmDistTagEntry[] = Object.entries(distTags).map(([tag, version]) => {
    const publishedAt = times[version] ?? null;
    return {
      tag,
      version,
      publishedAt,
      publishedAgo: formatPublishedAgo(publishedAt, nowMs),
      preferred: tag === preferredTag,
    };
  });
  entries.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    if (a.tag === 'latest') return -1;
    if (b.tag === 'latest') return 1;
    return a.tag.localeCompare(b.tag);
  });
  return entries;
}

async function fetchPackageDoc(registryBase: string, packageName: string): Promise<NpmRegistryPackageDoc> {
  const url = buildNpmPackageMetadataUrl(registryBase, packageName);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body || response.statusText}`);
  }
  return (await response.json()) as NpmRegistryPackageDoc;
}

export async function getNpmPackageVersions(): Promise<NpmPackageVersionsResult> {
  const registry = config.npm.registryUrl.trim() || 'https://npmmirror.rd.chanjet.com';
  const watched = listWatchedNpmPackages();
  const fetchedAt = new Date().toISOString();
  const nowMs = Date.now();

  if (watched.length === 0) {
    return {
      success: false,
      fetchedAt,
      registry,
      packages: [],
      error: '未配置关注的 npm 包，请在 config/npm-watched-packages.ts 中添加。',
    };
  }

  const packages: NpmPackageVersionItem[] = await Promise.all(
    watched.map(async ({ name, preferredTag }) => {
      try {
        const doc = await fetchPackageDoc(registry, name);
        const tags = parseDistTagsFromRegistryDoc(doc, preferredTag, nowMs);
        if (tags.length === 0) {
          return { name, preferredTag, tags: [], error: '无 dist-tags' };
        }
        return { name, preferredTag, tags };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { name, preferredTag, tags: [], error: msg };
      }
    })
  );

  const anyOk = packages.some((p) => p.tags.length > 0 && !p.error);
  return {
    success: anyOk,
    fetchedAt,
    registry,
    packages,
    error: anyOk ? undefined : '全部包查询失败，请检查 NPM_REGISTRY_URL 与网络。',
  };
}
