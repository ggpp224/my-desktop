/* AI 生成 By Peng.Guo */
import { useEffect, useRef, useState } from 'react';
import { APP_THEME_LABELS, type AppThemeId, type AppThemeTokens } from '../domain/theme/appTheme';
import { Button } from './Button';
import { IconButton } from './IconButton';

type ThemeSwitcherProps = {
  value: AppThemeId;
  tokens: AppThemeTokens;
  onChange: (themeId: AppThemeId) => void;
};

const THEME_OPTIONS: AppThemeId[] = ['blue', 'emerald', 'mint-light'];

export function ThemeSwitcher({ value, tokens, onChange }: ThemeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
      }}
    >
      <IconButton
        themeTokens={tokens}
        icon="🎨"
        ariaLabel="换肤"
        title={`当前皮肤：${APP_THEME_LABELS[value]}`}
        onClick={() => setOpen((prev) => !prev)}
        variant={open ? 'solid' : 'soft'}
        size="icon"
      />
      {open ? (
        <div
          role="listbox"
          aria-label="皮肤选择"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            minWidth: 120,
            borderRadius: 8,
            border: `1px solid ${tokens.tabInactiveBorder}`,
            background: tokens.tabInactiveBackground,
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            zIndex: 120,
          }}
        >
          {THEME_OPTIONS.map((themeId) => {
            const active = value === themeId;
            return (
              <Button
                key={themeId}
                themeTokens={tokens}
                onClick={() => {
                  onChange(themeId);
                  setOpen(false);
                }}
                variant={active ? 'solid' : 'ghost'}
                size="sm"
                fullWidth
                style={{
                  justifyContent: 'flex-start',
                  border: 'none',
                  borderBottom: themeId === THEME_OPTIONS[THEME_OPTIONS.length - 1] ? 'none' : `1px solid ${tokens.tabInactiveBorder}`,
                  borderRadius: 0,
                  fontWeight: active ? 700 : 500,
                }}
              >
                {APP_THEME_LABELS[themeId]}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
