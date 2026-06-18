/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCalendarQuarterInTimeZone, formatWikiWeekRangeTitleInTimeZone } from './jira-weekly-window.js';
import { pickQuarterPageForDate, pickWeekPageForDate } from './wiki-tool.js';

const TZ = 'Asia/Shanghai';

describe('formatWikiWeekRangeTitleInTimeZone', () => {
  it('2026-06-18（周四）对应本周一～周日 260615-260621', () => {
    const range = formatWikiWeekRangeTitleInTimeZone(new Date('2026-06-18T12:00:00+08:00'), TZ);
    assert.equal(range, '260615-260621');
  });

  it('2026-06-15（周一）当周区间以周一为起点', () => {
    const range = formatWikiWeekRangeTitleInTimeZone(new Date('2026-06-15T08:00:00+08:00'), TZ);
    assert.equal(range, '260615-260621');
  });
});

describe('getCalendarQuarterInTimeZone', () => {
  it('2026-06-18 属于 2026-Q2', () => {
    const q = getCalendarQuarterInTimeZone(new Date('2026-06-18T12:00:00+08:00'), TZ);
    assert.deepEqual(q, { year: 2026, quarter: 2 });
  });

  it('2026-07-01 属于 2026-Q3', () => {
    const q = getCalendarQuarterInTimeZone(new Date('2026-07-01T12:00:00+08:00'), TZ);
    assert.deepEqual(q, { year: 2026, quarter: 3 });
  });
});

describe('pickQuarterPageForDate', () => {
  const pages = [
    { id: 'q1', title: '2026-Q1' },
    { id: 'q2', title: '2026-Q2' },
    { id: 'q3', title: '2026-Q3' },
  ];

  it('6 月应选 2026-Q2，而非 wiki 上编号最大的 Q3', () => {
    const picked = pickQuarterPageForDate(pages, new Date('2026-06-18T12:00:00+08:00'), TZ);
    assert.equal(picked?.id, 'q2');
  });

  it('7 月应选 2026-Q3', () => {
    const picked = pickQuarterPageForDate(pages, new Date('2026-07-15T12:00:00+08:00'), TZ);
    assert.equal(picked?.id, 'q3');
  });
});

describe('pickWeekPageForDate', () => {
  const quarterId = 'q2';
  const pages = [
    { id: 'w1', title: '260608-260614', ancestors: [{ id: quarterId }] },
    { id: 'w2', title: '260615-260621', ancestors: [{ id: quarterId }] },
    { id: 'w3', title: '260622-260628', ancestors: [{ id: quarterId }] },
  ];

  it('优先按周一～周日周区间标题精确匹配', () => {
    const picked = pickWeekPageForDate(pages, quarterId, new Date('2026-06-18T12:00:00+08:00'), TZ);
    assert.equal(picked?.id, 'w2');
    assert.equal(picked?.title, '260615-260621');
  });

  it('无当前周页时选本周一之前已结束的最新周', () => {
    const picked = pickWeekPageForDate(
      pages.filter((p) => p.id !== 'w2'),
      quarterId,
      new Date('2026-06-18T12:00:00+08:00'),
      TZ,
    );
    assert.equal(picked?.id, 'w1');
  });
});
