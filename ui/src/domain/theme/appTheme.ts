/* AI 生成 By Peng.Guo */
export type AppThemeId = 'blue' | 'emerald';

export type AppThemeTokens = {
  appBackground: string;
  headerBackground: string;
  sidebarBackground: string;
  sidebarToggleBackground: string;
  workspacePanelBackground: string;
  workspacePanelSubtleBackground: string;
  inputBackground: string;
  inputBorder: string;
  panelBorder: string;
  tabActiveBackground: string;
  tabActiveBorder: string;
  tabInactiveBackground: string;
  tabInactiveBorder: string;
  accentButtonBackground: string;
  accentButtonBorder: string;
  textPrimary: string;
  textSecondary: string;
};

export const APP_THEME_LABELS: Record<AppThemeId, string> = {
  blue: '蓝色',
  emerald: '青绿色',
};

const BLUE_THEME: AppThemeTokens = {
  appBackground: '#1a1a2e',
  headerBackground: '#16213e',
  sidebarBackground: '#16213e',
  sidebarToggleBackground: '#0f3460',
  workspacePanelBackground: '#0d0d1a',
  workspacePanelSubtleBackground: '#111827',
  inputBackground: '#16213e',
  inputBorder: '#334155',
  panelBorder: '#333',
  tabActiveBackground: '#1d4ed8',
  tabActiveBorder: '#4f83ff',
  tabInactiveBackground: '#0f172a',
  tabInactiveBorder: '#334155',
  accentButtonBackground: '#0f3460',
  accentButtonBorder: '#284a76',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
};

const EMERALD_THEME: AppThemeTokens = {
  appBackground: '#0f1720',
  headerBackground: '#0d1f1b',
  sidebarBackground: '#0d1f1b',
  sidebarToggleBackground: '#0f766e',
  workspacePanelBackground: '#071611',
  workspacePanelSubtleBackground: '#0a2019',
  inputBackground: '#0d1f1b',
  inputBorder: '#2a3a36',
  panelBorder: '#2a3a36',
  tabActiveBackground: '#0f766e',
  tabActiveBorder: '#14b8a6',
  tabInactiveBackground: '#102724',
  tabInactiveBorder: '#2a3a36',
  accentButtonBackground: '#0f766e',
  accentButtonBorder: '#0d9488',
  textPrimary: '#e6fffa',
  textSecondary: '#99f6e4',
};

export const APP_THEME_TOKENS: Record<AppThemeId, AppThemeTokens> = {
  blue: BLUE_THEME,
  emerald: EMERALD_THEME,
};
