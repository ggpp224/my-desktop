/* AI 生成 By Peng.Guo */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { CommandStatEventInput, CommandStatSource } from './command-stat-labels.js';

const DB_PATH = path.resolve(process.cwd(), 'runtime', 'command-stats.sqlite');
const SCHEMA_VERSION = '1';

export type StatsDateRange = { fromMs: number; toMs: number };

export type CommandStatAggregatedItem = {
  canonicalKey: string;
  displayLabel: string;
  count: number;
  source?: string;
};

export type CommandStatTimelineBucket = {
  date: string;
  count: number;
};

export type CommandStatBySourceItem = {
  source: string;
  count: number;
};

export type StatsQueryOptions = {
  range: StatsDateRange;
  source?: CommandStatSource;
  limit?: number;
};

let dbInstance: Database.Database | null = null;

function ensureRuntimeDir(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS command_stat_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_key TEXT NOT NULL,
      display_label TEXT NOT NULL,
      source TEXT NOT NULL,
      route TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      meta_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cse_created_at ON command_stat_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_cse_canonical_created ON command_stat_events(canonical_key, created_at);
    CREATE INDEX IF NOT EXISTS idx_cse_source_created ON command_stat_events(source, created_at);
  `);
  const row = db.prepare(`SELECT value FROM schema_meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare(`INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)`).run(SCHEMA_VERSION);
  }
}

function getDb(): Database.Database {
  if (!dbInstance) {
    ensureRuntimeDir();
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    migrate(dbInstance);
  }
  return dbInstance;
}

export function recordCommandStat(input: CommandStatEventInput): void {
  try {
    const db = getDb();
    const metaJson = input.meta ? JSON.stringify(input.meta) : null;
    db.prepare(
      `INSERT INTO command_stat_events (canonical_key, display_label, source, route, success, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.canonicalKey,
      input.displayLabel,
      input.source,
      input.route,
      input.success === false ? 0 : 1,
      metaJson,
      Date.now()
    );
  } catch {
    /* 统计失败不影响主流程 */
  }
}

function buildRangeWhere(opts: StatsQueryOptions): { sql: string; params: Array<string | number> } {
  const clauses = ['created_at >= ?', 'created_at <= ?', 'success = 1'];
  const params: Array<string | number> = [opts.range.fromMs, opts.range.toMs];
  if (opts.source) {
    clauses.push('source = ?');
    params.push(opts.source);
  }
  return { sql: clauses.join(' AND '), params };
}

export function queryAggregated(opts: StatsQueryOptions): { items: CommandStatAggregatedItem[]; total: number } {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 100);
  const { sql: whereSql, params } = buildRangeWhere(opts);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM command_stat_events WHERE ${whereSql}`)
    .get(...params) as { c: number };
  const total = totalRow?.c ?? 0;

  const rows = db
    .prepare(
      `SELECT canonical_key AS canonicalKey,
              MAX(display_label) AS displayLabel,
              COUNT(*) AS count,
              MIN(source) AS source
       FROM command_stat_events
       WHERE ${whereSql}
       GROUP BY canonical_key
       ORDER BY count DESC
       LIMIT ?`
    )
    .all(...params, limit) as CommandStatAggregatedItem[];

  return { items: rows, total };
}

export function queryTimeline(opts: StatsQueryOptions): { buckets: CommandStatTimelineBucket[]; total: number } {
  const db = getDb();
  const { sql: whereSql, params } = buildRangeWhere(opts);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM command_stat_events WHERE ${whereSql}`)
    .get(...params) as { c: number };
  const total = totalRow?.c ?? 0;

  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS date,
              COUNT(*) AS count
       FROM command_stat_events
       WHERE ${whereSql}
       GROUP BY date
       ORDER BY date ASC`
    )
    .all(...params) as CommandStatTimelineBucket[];

  return { buckets: rows, total };
}

export function queryBySource(opts: StatsQueryOptions): { items: CommandStatBySourceItem[]; total: number } {
  const db = getDb();
  const { sql: whereSql, params } = buildRangeWhere(opts);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM command_stat_events WHERE ${whereSql}`)
    .get(...params) as { c: number };
  const total = totalRow?.c ?? 0;

  const rows = db
    .prepare(
      `SELECT source, COUNT(*) AS count
       FROM command_stat_events
       WHERE ${whereSql}
       GROUP BY source
       ORDER BY count DESC`
    )
    .all(...params) as CommandStatBySourceItem[];

  return { items: rows, total };
}

export function parseStatsRangeQuery(query: {
  days?: string;
  from?: string;
  to?: string;
}): StatsDateRange {
  const now = Date.now();
  const toRaw = (query.to ?? '').trim();
  const fromRaw = (query.from ?? '').trim();
  const daysRaw = (query.days ?? '').trim();

  let toMs = now;
  let fromMs = now - 30 * 24 * 60 * 60 * 1000;

  if (toRaw) {
    const parsed = Date.parse(toRaw);
    if (!Number.isNaN(parsed)) toMs = parsed;
  }
  if (fromRaw) {
    const parsed = Date.parse(fromRaw);
    if (!Number.isNaN(parsed)) fromMs = parsed;
  } else if (daysRaw) {
    const days = Math.min(Math.max(parseInt(daysRaw, 10) || 30, 1), 365);
    fromMs = toMs - days * 24 * 60 * 60 * 1000;
  }

  if (fromMs > toMs) {
    const swap = fromMs;
    fromMs = toMs;
    toMs = swap;
  }

  return { fromMs, toMs };
}

export function formatRangeForResponse(range: StatsDateRange): { from: string; to: string } {
  return {
    from: new Date(range.fromMs).toISOString(),
    to: new Date(range.toMs).toISOString(),
  };
}
