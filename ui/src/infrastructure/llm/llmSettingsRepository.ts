/* AI 生成 By Peng.Guo */
import type { GeminiUserSettings, LlmRuntimeMode } from '../../domain/llm/agentLlmRequest.js';
import { DEFAULT_GEMINI_MODEL } from '../../domain/llm/agentLlmRequest.js';

const STORAGE_KEY = 'adc-llm-settings-v1';

export type PersistedLlmSettings = {
  mode: LlmRuntimeMode;
  gemini: GeminiUserSettings;
};

const defaultSettings = (): PersistedLlmSettings => ({
  mode: 'local',
  gemini: { apiKey: '', model: DEFAULT_GEMINI_MODEL, baseUrl: '' },
});

function safeParse(raw: string | null): PersistedLlmSettings | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    const mode = o.mode === 'external' ? 'external' : 'local';
    const g = o.gemini && typeof o.gemini === 'object' ? (o.gemini as Record<string, unknown>) : {};
    const apiKey = typeof g.apiKey === 'string' ? g.apiKey : '';
    const model = typeof g.model === 'string' && g.model.trim() ? g.model : DEFAULT_GEMINI_MODEL;
    const baseUrl = typeof g.baseUrl === 'string' ? g.baseUrl : '';
    return { mode, gemini: { apiKey, model, baseUrl } };
  } catch {
    return null;
  }
}

export function loadLlmSettings(): PersistedLlmSettings {
  if (typeof window === 'undefined') return defaultSettings();
  const parsed = safeParse(window.localStorage.getItem(STORAGE_KEY));
  return parsed ?? defaultSettings();
}

export function saveLlmSettings(settings: PersistedLlmSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
