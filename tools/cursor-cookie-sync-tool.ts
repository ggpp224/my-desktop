/* AI 生成 By Peng.Guo */
import { pbkdf2Sync, createDecipheriv } from 'crypto';
import { tmpdir, homedir, platform } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { setRuntimeCursorCookie } from './cursor-usage-tool.js';

const execFileAsync = promisify(execFile);
const CHROME_COOKIE_DB = join(
  homedir(),
  'Library',
  'Application Support',
  'Google',
  'Chrome',
  'Default',
  'Cookies'
);

export interface SyncCursorCookieResult {
  success: boolean;
  source: string;
  cookieNames: string[];
  cookieCount: number;
  message: string;
}

interface ChromeCookieRow {
  name: string;
  value: string;
  encryptedHex: string;
}

function unpadPkcs7(buffer: Buffer): Buffer {
  if (!buffer.length) return buffer;
  const pad = buffer[buffer.length - 1] ?? 0;
  if (pad <= 0 || pad > 16 || pad > buffer.length) return buffer;
  for (let i = buffer.length - pad; i < buffer.length; i += 1) {
    if (buffer[i] !== pad) return buffer;
  }
  return buffer.subarray(0, buffer.length - pad);
}

function decryptChromeV10(encryptedRaw: Buffer, key: Buffer): string {
  if (encryptedRaw.length <= 3) return '';
  const prefix = encryptedRaw.subarray(0, 3).toString('utf-8');
  if (prefix !== 'v10') return '';
  const payload = encryptedRaw.subarray(3);
  const iv = Buffer.alloc(16, 0x20);
  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  // 使用 latin1 避免无效 UTF-8 被替换为 U+FFFD（会导致 fetch Header ByteString 报错）
  return unpadPkcs7(decrypted).toString('latin1');
}

function sanitizeCookieToken(token: string): string {
  // Header ByteString 要求每个字符码点 <= 255，且 Cookie 建议仅使用可打印 ASCII。
  return token
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e && ch !== ';';
    })
    .join('');
}

async function getChromeSafeStoragePassword(): Promise<string> {
  const { stdout } = await execFileAsync('security', [
    'find-generic-password',
    '-w',
    '-a',
    'Chrome',
    '-s',
    'Chrome Safe Storage',
  ]);
  return stdout.trim();
}

async function queryCursorCookiesFromChrome(dbPath: string): Promise<ChromeCookieRow[]> {
  const tempDbPath = join(tmpdir(), `cursor-cookie-sync-${Date.now()}.sqlite`);
  await fs.copyFile(dbPath, tempDbPath);
  try {
    const sql = [
      "SELECT name || char(9) || value || char(9) || hex(encrypted_value)",
      'FROM cookies',
      "WHERE host_key LIKE '%cursor.com%'",
      'ORDER BY name;',
    ].join(' ');
    const { stdout } = await execFileAsync('sqlite3', [tempDbPath, sql]);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = '', value = '', encryptedHex = ''] = line.split('\t');
        return { name: name.trim(), value: value.trim(), encryptedHex: encryptedHex.trim() };
      })
      .filter((row) => row.name);
  } finally {
    await fs.unlink(tempDbPath).catch(() => {});
  }
}

function buildCookieHeader(rows: ChromeCookieRow[], key: Buffer): { header: string; names: string[] } {
  const pairs = new Map<string, string>();
  for (const row of rows) {
    let resolved = row.value;
    if (!resolved && row.encryptedHex) {
      try {
        const encryptedRaw = Buffer.from(row.encryptedHex, 'hex');
        resolved = decryptChromeV10(encryptedRaw, key);
      } catch {
        // ignore single-cookie decryption failure
      }
    }
    if (!resolved) continue;
    const safeName = sanitizeCookieToken(row.name);
    const safeValue = sanitizeCookieToken(resolved);
    if (!safeName || !safeValue) continue;
    pairs.set(safeName, safeValue);
  }
  const names = [...pairs.keys()];
  const header = names.map((name) => `${name}=${pairs.get(name)}`).join('; ');
  return { header, names };
}

export async function syncCursorCookieFromChrome(): Promise<SyncCursorCookieResult> {
  if (platform() !== 'darwin') {
    throw new Error('仅支持 macOS 自动同步 Cursor Cookie。');
  }
  const dbPath = CHROME_COOKIE_DB;
  await fs.access(dbPath);
  const rows = await queryCursorCookiesFromChrome(dbPath);
  if (!rows.length) {
    throw new Error('未在 Chrome Default Profile 中找到 cursor.com 登录 Cookie。');
  }
  const password = await getChromeSafeStoragePassword();
  if (!password) {
    throw new Error('读取 Chrome Safe Storage 密钥失败。');
  }
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  const { header, names } = buildCookieHeader(rows, key);
  if (!header) {
    throw new Error('找到 cursor.com Cookie 但解密失败，可能是浏览器加密策略变化。');
  }
  setRuntimeCursorCookie(header);
  return {
    success: true,
    source: dbPath,
    cookieNames: names,
    cookieCount: names.length,
    message: '已同步 Cursor 登录态到当前服务进程（仅内存）。',
  };
}
