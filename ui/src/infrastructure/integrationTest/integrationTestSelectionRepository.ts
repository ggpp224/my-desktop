/* AI 生成 By Peng.Guo */
import type { IntegrationTestSelection } from '../../domain/integrationTest/models';

const STORAGE_KEY = 'adc-integration-test-selection-v1';

export function loadIntegrationTestSelection(): IntegrationTestSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      env: typeof o.env === 'string' ? o.env : '',
      mode: o.mode === 'local' ? 'local' : 'remote',
      headless: o.headless === true,
      specs: Array.isArray(o.specs) ? o.specs.filter((s): s is string => typeof s === 'string') : [],
    };
  } catch {
    return null;
  }
}

export function saveIntegrationTestSelection(selection: IntegrationTestSelection): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
}
