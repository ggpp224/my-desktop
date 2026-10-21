/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCaseTree, folderVisibleCount } from '../caseTree.js';
import type { IntegrationTestCaseGroup } from '../models.js';

function group(
  partial: Pick<IntegrationTestCaseGroup, 'id' | 'suiteId' | 'label' | 'treeParentLabel' | 'dirPath'> & {
    caseCount?: number;
  }
): IntegrationTestCaseGroup {
  const n = partial.caseCount ?? 1;
  return {
    id: partial.id,
    suiteId: partial.suiteId,
    label: partial.label,
    treeParentLabel: partial.treeParentLabel,
    dirPath: partial.dirPath,
    cases: Array.from({ length: n }, (_, i) => ({
      specPath: `${partial.dirPath}/C${i}.spec.ts`,
      fileName: `C${i}.spec.ts`,
      titles: [],
    })),
  };
}

describe('buildCaseTree', () => {
  it('无 treeParentLabel 的分组保持扁平；UI 包名收拢到父层下', () => {
    const grid = group({
      id: 'grid',
      suiteId: 'portal',
      label: 'Grid',
      treeParentLabel: '',
      dirPath: 'tests/browser/grid',
    });
    const button = group({
      id: 'button',
      suiteId: 'ui',
      label: 'button',
      treeParentLabel: 'UI',
      dirPath: 'tests/ui/button',
    });
    const checkbox = group({
      id: 'checkbox',
      suiteId: 'ui',
      label: 'checkbox',
      treeParentLabel: 'UI',
      dirPath: 'tests/ui/checkbox',
      caseCount: 2,
    });
    const visible = [
      { group: grid, visible: grid.cases },
      { group: button, visible: button.cases },
      { group: checkbox, visible: checkbox.cases },
    ];
    const tree = buildCaseTree(visible);
    assert.equal(tree[0].kind, 'group');
    assert.equal(tree[1].kind, 'folder');
    if (tree[1].kind !== 'folder') return;
    assert.equal(tree[1].label, 'UI');
    assert.deepEqual(
      tree[1].children.map((c) => c.group.label),
      ['button', 'checkbox']
    );
    assert.equal(folderVisibleCount(tree[1].children), 3);
  });
});
