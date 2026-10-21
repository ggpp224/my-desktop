/* AI 生成 By Peng.Guo */
/**
 * 将扁平的用例分组组装成用例树节点：
 * - 无 treeParentLabel：包名分组直接作为顶层
 * - 有 treeParentLabel：父层（如 UI）→ 包名 → 组件用例
 */
import type { IntegrationTestCase, IntegrationTestCaseGroup } from './models';

export type VisibleCaseGroup = {
  group: IntegrationTestCaseGroup;
  visible: IntegrationTestCase[];
};

/** 用例树顶层节点：普通分组，或带父层的套件文件夹 */
export type CaseTreeNode =
  | { kind: 'group'; group: IntegrationTestCaseGroup; visible: IntegrationTestCase[] }
  | {
      kind: 'folder';
      label: string;
      /** 稳定 key，如 `folder:UI` */
      key: string;
      children: VisibleCaseGroup[];
    };

/** 按扫描顺序收拢同 treeParentLabel 的连续分组 */
export function buildCaseTree(visibleGroups: VisibleCaseGroup[]): CaseTreeNode[] {
  const nodes: CaseTreeNode[] = [];
  let i = 0;
  while (i < visibleGroups.length) {
    const parent = visibleGroups[i].group.treeParentLabel;
    if (!parent) {
      nodes.push({ kind: 'group', group: visibleGroups[i].group, visible: visibleGroups[i].visible });
      i += 1;
      continue;
    }
    const children: VisibleCaseGroup[] = [];
    while (i < visibleGroups.length && visibleGroups[i].group.treeParentLabel === parent) {
      children.push(visibleGroups[i]);
      i += 1;
    }
    nodes.push({ kind: 'folder', label: parent, key: `folder:${parent}`, children });
  }
  return nodes;
}

/** 文件夹下可见用例总数 */
export function folderVisibleCount(children: VisibleCaseGroup[]): number {
  return children.reduce((n, c) => n + c.visible.length, 0);
}
