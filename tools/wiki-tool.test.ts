/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCalendarQuarterInTimeZone,
  formatWikiWeekRangeTitleInTimeZone,
  formatNextWikiWeekRangeTitleInTimeZone,
  formatWikiWeekRangeTitleAfterWeekTitle,
  formatQuarterTitleForWikiWeekRange,
} from './jira-weekly-window.js';
import { pickQuarterPageForDate, pickWeekPageForDate, pickLatestWeekPage } from './wiki-tool.js';

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

describe('formatNextWikiWeekRangeTitleInTimeZone', () => {
  it('当前周 260615-260621 时下周为 260622-260628', () => {
    const next = formatNextWikiWeekRangeTitleInTimeZone(new Date('2026-06-18T12:00:00+08:00'), TZ);
    assert.equal(next, '260622-260628');
  });

  it('周日仍指向同一业务周的下周区间', () => {
    const next = formatNextWikiWeekRangeTitleInTimeZone(new Date('2026-06-21T23:00:00+08:00'), TZ);
    assert.equal(next, '260622-260628');
  });
});

describe('formatWikiWeekRangeTitleAfterWeekTitle', () => {
  it('260824-260830 的下一连续周为 260831-260906（不跳到 260907）', () => {
    assert.equal(formatWikiWeekRangeTitleAfterWeekTitle('260824-260830', TZ), '260831-260906');
  });

  it('跨季度：260921-260927 下一周为 260928-261004', () => {
    assert.equal(formatWikiWeekRangeTitleAfterWeekTitle('260921-260927', TZ), '260928-261004');
  });
});

describe('formatQuarterTitleForWikiWeekRange', () => {
  it('260831-260906 属于 2026-Q3', () => {
    assert.equal(formatQuarterTitleForWikiWeekRange('260831-260906', TZ), '2026-Q3');
  });

  it('261005-261011 属于 2026-Q4', () => {
    assert.equal(formatQuarterTitleForWikiWeekRange('261005-261011', TZ), '2026-Q4');
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

describe('pickLatestWeekPage', () => {
  it('跨季度取 end 最大的周页', () => {
    const pages = [
      { id: 'a', title: '260824-260830' },
      { id: 'b', title: '260817-260823' },
      { id: 'c', title: '260907-260913' },
    ];
    assert.equal(pickLatestWeekPage(pages)?.id, 'c');
  });
});
