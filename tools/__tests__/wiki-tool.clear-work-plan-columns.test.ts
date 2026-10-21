/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clearWeeklyReportWorkPlanColumns, normalizeConfluenceStorageXhtml } from '../wiki-tool.js';

describe('clearWeeklyReportWorkPlanColumns', () => {
  it('清空本周工作与下周计划列，保留其余列与表头', () => {
    const input = `
<p>工作内容：</p>
<table>
<tbody>
<tr>
<th>特性名</th>
<th>说明</th>
<th>本周工作</th>
<th>下周计划</th>
<th>特性文档、开发方案地址及其他说明</th>
</tr>
<tr>
<td>移动端升级</td>
<td>负责人：甲</td>
<td><ul><li>完成 A</li></ul></td>
<td><p>推进 B</p></td>
<td><a href="https://jira.example/CPYF-1">CPYF-1</a></td>
</tr>
</tbody>
</table>
`.trim();

    const out = clearWeeklyReportWorkPlanColumns(input);
    assert.match(out, /移动端升级/);
    assert.match(out, /负责人：甲/);
    assert.match(out, /CPYF-1/);
    assert.match(out, /<th>本周工作<\/th>/);
    assert.match(out, /<th>下周计划<\/th>/);
    assert.doesNotMatch(out, /完成 A/);
    assert.doesNotMatch(out, /推进 B/);
  });

  it('支持 rowspan/colspan 占用网格后仍按表头列清空', () => {
    const input = `
<table>
<tbody>
<tr>
<th rowspan="1">特性名</th>
<th>说明</th>
<th>本周工作</th>
<th>下周计划</th>
<th>文档</th>
</tr>
<tr>
<td rowspan="2">特性甲</td>
<td>开始时间</td>
<td rowspan="2"><p>本周做了 X</p></td>
<td rowspan="2"><p>下周做 Y</p></td>
<td rowspan="2">doc</td>
</tr>
<tr>
<td>负责人</td>
</tr>
</tbody>
</table>
`.trim();

    const out = clearWeeklyReportWorkPlanColumns(input);
    assert.match(out, /特性甲/);
    assert.match(out, /开始时间/);
    assert.match(out, /负责人/);
    assert.match(out, />doc</);
    assert.doesNotMatch(out, /本周做了 X/);
    assert.doesNotMatch(out, /下周做 Y/);
  });

  it('无目标列表头时原样返回（并保持 void 标签可提交）', () => {
    const input = `<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>`;
    assert.equal(clearWeeklyReportWorkPlanColumns(input), input);
  });

  it('colgroup/col 序列化为 XHTML 自闭合，避免 Confluence 400', () => {
    const input = `
<table>
<colgroup>
<col style="width: 20.0%" />
<col style="width: 20.0%" />
<col />
<col>
</colgroup>
<tbody>
<tr>
<th>特性名</th>
<th>说明</th>
<th>本周工作</th>
<th>下周计划</th>
</tr>
<tr>
<td>特性</td>
<td>说明</td>
<td>本周</td>
<td>下周</td>
</tr>
</tbody>
</table>
`.trim();

    const out = clearWeeklyReportWorkPlanColumns(input);
    assert.doesNotMatch(out, /本周(?!工作)/);
    assert.doesNotMatch(out, /下周(?!计划)/);
    assert.match(out, /<colgroup>/i);
    assert.match(out, /<\/colgroup>/i);
    // 不得出现未闭合的 <col ...>（其后直接跟另一个标签）
    assert.doesNotMatch(out, /<col(?:\s[^>/]*)?\s*>(?!\s*<\/col>)/i);
    assert.match(out, /<col[^>]*\/>/i);
  });
});

describe('normalizeConfluenceStorageXhtml', () => {
  it('将裸 <col> / <br> 转为自闭合', () => {
    const raw = '<colgroup><col style="width: 10%"><col></colgroup><p>a<br>b</p>';
    const out = normalizeConfluenceStorageXhtml(raw);
    assert.equal(out, '<colgroup><col style="width: 10%" /><col /></colgroup><p>a<br />b</p>');
  });
});
