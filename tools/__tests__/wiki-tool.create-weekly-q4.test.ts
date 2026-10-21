/* AI 生成 By Peng.Guo */
/**
 * 「创建周报页面」：创建【日历本周】；当前日期所在季度不存在时先建季度。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatCalendarQuarterTitleInTimeZone,
  formatQuarterTitleForWikiWeekRange,
  formatWikiWeekRangeTitleInTimeZone,
  getCalendarQuarterInTimeZone,
} from '../jira-weekly-window.js';
import { resolveNextWeeklyReportCreateTarget, resolveQuartersToCreateBeforeWeekPage } from '../wiki-tool.js';

const TZ = 'Asia/Shanghai';

/** 2026-Q4 周中（周四）→ 本周 261005-261011 */
const NOW_Q4 = new Date('2026-10-08T12:00:00+08:00');
/** 2026-Q3 末（周三）→ 本周 260928-261004 */
const NOW_Q3_LATE = new Date('2026-09-30T12:00:00+08:00');
/** 2026-Q3 实际「今天」样例（周六）→ 本周 260831-260906 */
const NOW_Q3_SEP5 = new Date('2026-09-05T12:00:00+08:00');

describe('创建周报页面 / 日历本周与季度', () => {
  it('Q3（2026-09-05）：本周 260831-260906，季度 2026-Q3，源周取上一周而非误建的下周/2025', () => {
    assert.deepEqual(getCalendarQuarterInTimeZone(NOW_Q3_SEP5, TZ), { year: 2026, quarter: 3 });
    assert.equal(formatCalendarQuarterTitleInTimeZone(NOW_Q3_SEP5, TZ), '2026-Q3');
    assert.equal(formatWikiWeekRangeTitleInTimeZone(NOW_Q3_SEP5, TZ), '260831-260906');
    assert.equal(formatQuarterTitleForWikiWeekRange('260831-260906', TZ), '2026-Q3');

    const pages = [
      { id: 'q3', title: '2026-Q3' },
      { id: 'y25', title: '250922-250928' },
      { id: 'prev', title: '260824-260830' },
      { id: 'older', title: '260817-260823' },
      { id: 'wrongNext', title: '260907-260913' },
    ];
    const target = resolveNextWeeklyReportCreateTarget(pages, TZ, NOW_Q3_SEP5);
    assert.ok(target);
    assert.equal(target.targetWeekTitle, '260831-260906');
    assert.equal(target.quarterTitle, '2026-Q3');
    assert.equal(target.currentQuarterTitle, '2026-Q3');
    assert.equal(target.source.id, 'prev');
    assert.equal(target.sourceWeekRange, '260824-260830');
    assert.equal(target.alreadyExists, false);
    assert.deepEqual(target.quartersToCreateBeforeWeek, []);
  });

  it('Q4 时「本周」标题正确', () => {
    assert.equal(formatWikiWeekRangeTitleInTimeZone(NOW_Q4, TZ), '261005-261011');
    assert.deepEqual(getCalendarQuarterInTimeZone(NOW_Q4, TZ), { year: 2026, quarter: 4 });
    assert.equal(formatCalendarQuarterTitleInTimeZone(NOW_Q4, TZ), '2026-Q4');
    assert.equal(formatQuarterTitleForWikiWeekRange('261005-261011', TZ), '2026-Q4');
  });

  it('Q4：待建页必须是日历本周，源周用上一周；忽略 2025 旧页', () => {
    const pages = [
      { id: 'y25a', title: '250915-250921' },
      { id: 'y25b', title: '250922-250928' },
      { id: 'prev', title: '260928-261004' },
      { id: 'older', title: '260824-260830' },
    ];
    const target = resolveNextWeeklyReportCreateTarget(pages, TZ, NOW_Q4);
    assert.ok(target);
    assert.equal(target.targetWeekTitle, '261005-261011');
    assert.equal(target.nextWeekTitle, '261005-261011');
    assert.equal(target.quarterTitle, '2026-Q4');
    assert.equal(target.source.id, 'prev');
    assert.equal(target.sourceWeekRange, '260928-261004');
    assert.equal(target.alreadyExists, false);
  });

  it('Q4：本周页已存在则 alreadyExists=true', () => {
    const pages = [
      { id: 'prev', title: '260928-261004' },
      { id: 'cur', title: '261005-261011' },
    ];
    const target = resolveNextWeeklyReportCreateTarget(pages, TZ, NOW_Q4);
    assert.ok(target);
    assert.equal(target.targetWeekTitle, '261005-261011');
    assert.equal(target.alreadyExists, true);
    assert.equal(target.source.id, 'prev');
  });

  it('Q3 末：待建为本周 260928-261004，挂 2026-Q3', () => {
    const pages = [
      { id: 'prev', title: '260921-260927' },
    ];
    const target = resolveNextWeeklyReportCreateTarget(pages, TZ, NOW_Q3_LATE);
    assert.ok(target);
    assert.equal(target.targetWeekTitle, '260928-261004');
    assert.equal(target.quarterTitle, '2026-Q3');
    assert.equal(target.currentQuarterTitle, '2026-Q3');
    assert.equal(target.source.id, 'prev');
  });
});

describe('创建周报页面 / 当前日期所在季度不存在则先建', () => {
  it('resolveQuartersToCreate：当前 Q4 不存在时，列表以 2026-Q4 开头', () => {
    const pages = [{ id: 'q3', title: '2026-Q3' }];
    assert.deepEqual(
      resolveQuartersToCreateBeforeWeekPage(pages, '2026-Q4', '2026-Q4'),
      ['2026-Q4'],
    );
  });

  it('resolveQuartersToCreate：当前 Q3 与目标周 Q4 都不存在时，先 Q3 再 Q4', () => {
    assert.deepEqual(
      resolveQuartersToCreateBeforeWeekPage([], '2026-Q3', '2026-Q4'),
      ['2026-Q3', '2026-Q4'],
    );
  });

  it('Q4：树上仅有 2026-Q3 时须先建 2026-Q4，再挂本周页', () => {
    const pages = [
      { id: 'q3', title: '2026-Q3' },
      { id: 'prev', title: '260928-261004' },
    ];
    const target = resolveNextWeeklyReportCreateTarget(pages, TZ, NOW_Q4);
    assert.ok(target);
    assert.equal(target.targetWeekTitle, '261005-261011');
    assert.equal(target.currentQuarterTitle, '2026-Q4');
    assert.equal(target.currentQuarterNeedsCreate, true);
    assert.equal(target.quarterNeedsCreate, true);
    assert.deepEqual(target.quartersToCreateBeforeWeek, ['2026-Q4']);
  });

  it('Q4：2026-Q4 已存在时不必再建季度', () => {
    const pages = [
      { id: 'q4', title: '2026-Q4' },
      { id: 'prev', title: '260928-261004' },
    ];
    const target = resolveNextWeeklyReportCreateTarget(pages, TZ, NOW_Q4);
    assert.ok(target);
    assert.equal(target.currentQuarterNeedsCreate, false);
    assert.equal(target.quarterNeedsCreate, false);
    assert.deepEqual(target.quartersToCreateBeforeWeek, []);
  });
});
