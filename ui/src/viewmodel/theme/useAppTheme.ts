/* AI 生成 By Peng.Guo */
import { useMemo, useState } from 'react';
import { APP_THEME_TOKENS, type AppThemeId } from '../../domain/theme/appTheme';
import { loadThemeId, saveThemeId } from '../../infrastructure/theme/themeDataSource';

export function useAppTheme() {
  const [themeId, setThemeId] = useState<AppThemeId>(() => loadThemeId());

  const tokens = useMemo(() => APP_THEME_TOKENS[themeId], [themeId]);

  const switchTheme = (nextThemeId: AppThemeId) => {
    setThemeId(nextThemeId);
    saveThemeId(nextThemeId);
  };

  return { themeId, tokens, switchTheme };
}
