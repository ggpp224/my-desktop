/* AI 生成 By Peng.Guo */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { TechDigestReport, TechDigestScope } from './trends-types.js';

const DIGEST_DIR = path.resolve(process.cwd(), 'runtime', 'tech-digest');
const LEGACY_LATEST_FILE = path.join(DIGEST_DIR, 'latest.json');
const SCOPE_FILES: Record<TechDigestScope, string> = {
  daily: path.join(DIGEST_DIR, 'latest-daily.json'),
  monthly: path.join(DIGEST_DIR, 'latest-monthly.json'),
  halfYear: path.join(DIGEST_DIR, 'latest-halfyear.json'),
};
const HISTORY_DB = path.join(DIGEST_DIR, 'history.sqlite');

let historyDb: Database.Database | null = null;

function ensureDir(): void {
  if (!fs.existsSync(DIGEST_DIR)) fs.mkdirSync(DIGEST_DIR, { recursive: true });
}

function getHistoryDb(): Database.Database {
  if (!historyDb) {
    ensureDir();
    historyDb = new Database(HISTORY_DB);
    historyDb.pragma('journal_mode = WAL');
    historyDb.exec(`
      CREATE TABLE IF NOT EXISTS digest_top10 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        digest_date TEXT NOT NULL,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_digest_top10_date ON digest_top10(digest_date);
    `);
  }
  return historyDb;
}

function readJsonFile(filePath: string): TechDigestReport | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as TechDigestReport;
  } catch {
    return null;
  }
}

/** 兼容旧版 latest.json，仅作 daily 回退 */
function loadLegacyDailyDigest(): TechDigestReport | null {
  const legacy = readJsonFile(LEGACY_LATEST_FILE);
  if (!legacy) return null;
  return { ...legacy, scope: 'daily' };
}

export function loadDigest(scope: TechDigestScope): TechDigestReport | null {
  const scoped = readJsonFile(SCOPE_FILES[scope]);
  if (scoped) return { ...scoped, scope };
  if (scope === 'daily') return loadLegacyDailyDigest();
  return null;
}

export function loadAllDigests(): Partial<Record<TechDigestScope, TechDigestReport>> {
  const result: Partial<Record<TechDigestScope, TechDigestReport>> = {};
  for (const scope of ['daily', 'monthly', 'halfYear'] as TechDigestScope[]) {
    const report = loadDigest(scope);
    if (report) result[scope] = report;
  }
  return result;
}

/** @deprecated 使用 loadDigest('daily') */
export function loadLatestDigest(): TechDigestReport | null {
  return loadDigest('daily');
}

export function saveDigest(scope: TechDigestScope, report: TechDigestReport): void {
  ensureDir();
  const payload = { ...report, scope };
  fs.writeFileSync(SCOPE_FILES[scope], JSON.stringify(payload, null, 2), 'utf-8');
  if (scope === 'daily') {
    recordTop10History(payload);
  }
}

/** @deprecated 使用 saveDigest */
export function saveLatestDigest(report: TechDigestReport): void {
  saveDigest(report.scope ?? 'daily', report);
}

function recordTop10History(report: TechDigestReport): void {
  const top10 = report.top10 ?? [];
  if (top10.length === 0) return;
  const db = getHistoryDb();
  const date = report.generatedAt.slice(0, 10);
  const insert = db.prepare(
    `INSERT INTO digest_top10 (digest_date, project_id, project_name, created_at) VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const id of top10) {
      const project = report.projects.find((p) => p.id === id);
      if (!project) continue;
      insert.run(date, id, project.name, Date.now());
    }
  });
  tx();
}

export type WeeklyFrequencyRow = { project_name: string; count: number };

export function queryWeeklyTopFrequency(days = 7): WeeklyFrequencyRow[] {
  const db = getHistoryDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);
  return db
    .prepare(
      `SELECT project_name, COUNT(*) as count
       FROM digest_top10
       WHERE digest_date >= ?
       GROUP BY project_name
       ORDER BY count DESC
       LIMIT 15`
    )
    .all(sinceDate) as WeeklyFrequencyRow[];
}

export function buildWeeklyFrequencyMarkdown(rows: WeeklyFrequencyRow[]): string {
  if (rows.length === 0) {
    return '近 7 天暂无历史榜单数据，完成首次刷新后将开始累积周趋势。';
  }
  return rows.map((r, i) => `${i + 1}. **${r.project_name}**（上榜 ${r.count} 次）`).join('\n');
}
