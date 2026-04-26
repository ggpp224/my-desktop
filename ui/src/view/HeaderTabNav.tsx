/* AI 生成 By Peng.Guo */
import { useState } from 'react';
import type { AppThemeTokens } from '../domain/theme/appTheme';
import { IconButton } from './IconButton';

export type HeaderTabItem = {
  key: string;
  label: string;
};

type HeaderTabNavProps = {
  tabs: HeaderTabItem[];
  activeTabKey: string;
  themeTokens: AppThemeTokens;
  onTabClick: (tabKey: string) => void;
  onTabClose: (tabKey: string) => void;
};

function resolveTabIcon(tabKey: string): string {
  if (tabKey === 'workspace') return '⌂';
  if (tabKey === 'my-work') return '⌘';
  if (tabKey === 'knowledge-base') return '◫';
  if (tabKey.startsWith('knowledge-doc:')) return '◧';
  return '◦';
}

export function HeaderTabNav({
  tabs,
  activeTabKey,
  themeTokens,
  onTabClick,
  onTabClose,
}: HeaderTabNavProps) {
  const [hoveredTabKey, setHoveredTabKey] = useState<string | null>(null);

  return (
    <nav
      aria-label="头部功能页签"
      style={{
        display: 'flex',
        gap: 10,
        borderBottom: `1px solid ${themeTokens.inputBorder}`,
        paddingBottom: 2,
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTabKey === tab.key;
        const closable = tab.key !== 'workspace';
        const showClose = hoveredTabKey === tab.key;
        return (
          <div
            key={tab.key}
            onMouseEnter={() => setHoveredTabKey(tab.key)}
            onMouseLeave={() => setHoveredTabKey((prev) => (prev === tab.key ? null : prev))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 2px',
              borderBottom: isActive ? `2px solid ${themeTokens.tabActiveBorder}` : '2px solid transparent',
              color: isActive ? themeTokens.tabActiveBorder : themeTokens.textSecondary,
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
            }}
          >
            <IconButton
              themeTokens={themeTokens}
              icon={<span style={{ fontSize: 16, lineHeight: 1 }}>{resolveTabIcon(tab.key)}</span>}
              label={tab.label}
              onClick={() => onTabClick(tab.key)}
              variant="ghost"
              size="sm"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                padding: '8px 0 9px',
                fontWeight: 'inherit',
                minWidth: 0,
                justifyContent: 'flex-start',
              }}
            />
            {closable && (
              <IconButton
                themeTokens={themeTokens}
                icon="×"
                onClick={() => onTabClose(tab.key)}
                title={`关闭 ${tab.label}`}
                variant="ghost"
                size="icon"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: showClose ? 'pointer' : 'default',
                  opacity: showClose ? 1 : 0,
                  pointerEvents: showClose ? 'auto' : 'none',
                  transition: 'opacity 0.12s ease',
                  marginBottom: 1,
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
