/* AI 生成 By Peng.Guo */
import type { AppThemeId } from '../../domain/theme/appTheme';

const THEME_STORAGE_KEY = 'ai-dev-control-center:theme';

function isThemeId(value: string): value is AppThemeId {
  return value === 'blue' || value === 'emerald' || value === 'mint-light';
}

export function loadThemeId(): AppThemeId {
  if (typeof window === 'undefined') return 'blue';
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY)?.trim();
  if (!raw) return 'blue';
  return isThemeId(raw) ? raw : 'blue';
}

export function saveThemeId(themeId: AppThemeId): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
}
