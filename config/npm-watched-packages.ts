/* AI 生成 By Peng.Guo */
/**
 * 「获取npm包版本」关注的包清单（数组顺序即展示顺序）。
 * preferredTag：优先展示的 dist-tag；查询时仍会拉取该包全部 Current Tags。
 * 后续新增包：在此追加一行即可。
 */
export type NpmWatchedPackage = {
  name: string;
  preferredTag: string;
};

export const NPM_WATCHED_PACKAGES: readonly NpmWatchedPackage[] = [
  { name: '@chanjet/nova-uikit', preferredTag: 'beta' },
  { name: '@chanjet/nova-shared', preferredTag: 'beta' },
  { name: '@chanjet/nova-cross-shared', preferredTag: 'beta' },
  { name: '@chanjet/nova-uikit-compat', preferredTag: 'beta' },
  { name: '@chanjet/nova-athena', preferredTag: 'beta' },
  { name: '@chanjet/nova-intelligent-import', preferredTag: 'beta' },
  { name: '@chanjet/nova-markdoc', preferredTag: 'beta' },
  { name: '@chanjet/nova-microkernel', preferredTag: 'beta' },
  { name: '@chanjet/nova-sample', preferredTag: 'beta' },
  { name: '@chanjet/ai-protocol', preferredTag: 'beta' },
  { name: '@chanjet/ai-runtime', preferredTag: 'beta' },
  { name: '@chanjet/ai-adapters', preferredTag: 'beta' },
];

/** @deprecated 兼容旧引用；顺序以 NPM_WATCHED_PACKAGES 为准 */
export const NPM_WATCHED_PACKAGE_TAGS: Readonly<Record<string, string>> = Object.fromEntries(
  NPM_WATCHED_PACKAGES.map((p) => [p.name, p.preferredTag])
);

export function listWatchedNpmPackages(): ReadonlyArray<NpmWatchedPackage> {
  return NPM_WATCHED_PACKAGES;
}
