/* AI 生成 By Peng.Guo */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config/default.js';

export type GeminiEnvSettingsSnapshot = {
  hasApiKey: boolean;
  apiKeySuffix: string;
  model: string;
};

export type SaveGeminiEnvSettingsInput = {
  apiKey?: string;
  model?: string;
};

function resolveEnvPath(): string {
  return path.join(process.cwd(), '.env');
}

function formatEnvLine(key: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return `${key}=`;
  if (/[\s#"'\\]/.test(trimmed)) {
    return `${key}="${trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `${key}=${trimmed}`;
}

/** 更新或追加 .env 中的单行变量，并同步到当前进程的 process.env */
export function upsertEnvFileVar(key: string, value: string): void {
  const envPath = resolveEnvPath();
  const line = formatEnvLine(key, value);
  const content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const re = new RegExp(`^${key}=.*(?:\\r?\\n|$)`, 'm');
  const next = re.test(content) ? content.replace(re, `${line}\n`) : `${content.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, next.startsWith('\n') ? next.slice(1) : next, 'utf8');
  if (value.trim()) {
    process.env[key] = value.trim();
  } else {
    delete process.env[key];
  }
}

function readApiKeyFromEnv(): string {
  return (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
}

export function getGeminiEnvSettingsSnapshot(): GeminiEnvSettingsSnapshot {
  const apiKey = readApiKeyFromEnv();
  return {
    hasApiKey: Boolean(apiKey),
    apiKeySuffix: apiKey.length >= 4 ? apiKey.slice(-4) : '',
    model: (process.env.GEMINI_DEFAULT_MODEL ?? '').trim() || config.gemini.defaultModel,
  };
}

export function saveGeminiEnvSettings(input: SaveGeminiEnvSettingsInput): GeminiEnvSettingsSnapshot {
  const apiKey = (input.apiKey ?? '').trim();
  if (apiKey) {
    upsertEnvFileVar('GEMINI_API_KEY', apiKey);
    delete process.env.GOOGLE_API_KEY;
  }
  const model = (input.model ?? '').trim();
  if (model) {
    upsertEnvFileVar('GEMINI_DEFAULT_MODEL', model);
    config.gemini.defaultModel = model;
  }
  return getGeminiEnvSettingsSnapshot();
}
