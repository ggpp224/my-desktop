/* AI 生成 By Peng.Guo */
import { config } from '../config/default.js';

export interface CursorUsageResult {
  success: boolean;
  fetchedAt: string;
  source: string;
  data: unknown;
}

let runtimeCursorCookie = '';

export function setRuntimeCursorCookie(cookie: string): void {
  runtimeCursorCookie = cookie.trim();
}

function buildCursorAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: process.env.CURSOR_API_ORIGIN?.trim() || 'https://cursor.com',
    Referer: process.env.CURSOR_API_REFERER?.trim() || 'https://cursor.com/dashboard',
  };
  const token = config.cursor.token.trim();
  const cookie = config.cursor.cookie.trim() || runtimeCursorCookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (!token && !cookie) {
    throw new Error(
      'Cursor 认证信息缺失：请在环境变量中配置 CURSOR_API_TOKEN 或 CURSOR_COOKIE。'
    );
  }
  return headers;
}

function parseSafeInt(value: string, fallback: number): number {
  const n = Number(value.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function buildDayRange(nowMs = Date.now()): { startDate: number; endDate: number } {
  const now = new Date(nowMs);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  return { startDate: start, endDate: end };
}

function calculateMonthlyAnchorStart(baseStartMs: number, nowMs = Date.now()): number {
  const base = new Date(baseStartMs);
  if (Number.isNaN(base.getTime())) return nowMs;
  const now = new Date(nowMs);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = base.getUTCDate();
  const hh = base.getUTCHours();
  const mm = base.getUTCMinutes();
  const ss = base.getUTCSeconds();
  const ms = base.getUTCMilliseconds();
  const currentMonthAnchor = Date.UTC(y, m, d, hh, mm, ss, ms);
  if (currentMonthAnchor <= nowMs) return currentMonthAnchor;
  return Date.UTC(y, m - 1, d, hh, mm, ss, ms);
}

async function postCursorUsage(url: string, payload: Record<string, unknown>): Promise<CursorUsageResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: buildCursorAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cursor 用量查询失败(${response.status}): ${body || response.statusText}`);
  }
  const data = (await response.json()) as unknown;
  return {
    success: true,
    fetchedAt: new Date().toISOString(),
    source: url,
    data: {
      request: payload,
      response: data,
    },
  };
}

export async function getCursorUsage(): Promise<CursorUsageResult> {
  const url = config.cursor.usageApiUrl.trim();
  if (!url) {
    throw new Error('Cursor 用量 API 地址未配置：请设置 CURSOR_USAGE_API_URL。');
  }
  const teamId = parseSafeInt(process.env.CURSOR_TEAM_ID || '-1', -1);
  const monthlyBaseStart = parseSafeInt(process.env.CURSOR_USAGE_MONTHLY_BASE_START || '1774764813000', 1774764813000);
  const startDate = calculateMonthlyAnchorStart(monthlyBaseStart);
  return postCursorUsage(url, { teamId, startDate });
}

export async function getCursorTodayUsage(): Promise<CursorUsageResult> {
  const url = config.cursor.todayUsageApiUrl.trim();
  if (!url) {
    throw new Error('Cursor 今日用量 API 地址未配置：请设置 CURSOR_TODAY_USAGE_API_URL。');
  }
  const teamId = parseSafeInt(process.env.CURSOR_TEAM_ID || '0', 0);
  const page = parseSafeInt(process.env.CURSOR_TODAY_PAGE || '1', 1);
  const pageSize = parseSafeInt(process.env.CURSOR_TODAY_PAGE_SIZE || '10', 10);
  const { startDate, endDate } = buildDayRange();
  return postCursorUsage(url, {
    teamId,
    startDate: String(startDate),
    endDate: String(endDate),
    page,
    pageSize,
  });
}
