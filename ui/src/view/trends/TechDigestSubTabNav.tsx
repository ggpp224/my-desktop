/* AI 生成 By Peng.Guo */
import type { AppThemeTokens } from '../../domain/theme/appTheme';
import type { TechDigestInnerTab } from '../../domain/trends/models';
import { Button } from '../Button';

type TechDigestSubTabNavProps = {
  activeTab: TechDigestInnerTab;
  themeTokens: AppThemeTokens;
  onTabChange: (tab: TechDigestInnerTab) => void;
};

const TABS: Array<{ key: TechDigestInnerTab; label: string }> = [
  { key: 'daily', label: '今日' },
  { key: 'longterm', label: '中长周期' },
];

export function TechDigestSubTabNav({ activeTab, themeTokens, onTabChange }: TechDigestSubTabNavProps) {
  return (
    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
      {TABS.map((tab) => (
        <Button
          key={tab.key}
          themeTokens={themeTokens}
          variant={activeTab === tab.key ? 'solid' : 'soft'}
          size="sm"
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}
