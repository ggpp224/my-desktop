/* AI 生成 By Peng.Guo */
import { useState, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import type { AppThemeTokens } from '../domain/theme/appTheme';
import type { ButtonSize, ButtonVariant } from './Button';

type IconButtonProps = {
  themeTokens: AppThemeTokens;
  icon: ReactNode;
  label?: ReactNode;
  title?: string;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  selected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
};

export function IconButton({
  themeTokens,
  icon,
  label,
  title,
  ariaLabel,
  onClick,
  variant = 'ghost',
  size = 'icon',
  selected = false,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  type = 'button',
}: IconButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const hasLabel = typeof label !== 'undefined' && label !== null;
  const resolvedSize: ButtonSize = hasLabel && size === 'icon' ? 'md' : size;
  const isCircleIconOnly = !hasLabel && resolvedSize === 'icon';

  const sizeStyle = (() => {
    if (resolvedSize === 'sm') return { height: 28, minWidth: hasLabel ? 28 : 28, padding: hasLabel ? '0 10px' : 0, fontSize: 12 };
    if (resolvedSize === 'lg') return { height: 40, minWidth: hasLabel ? 40 : 40, padding: hasLabel ? '0 16px' : 0, fontSize: 14 };
    if (resolvedSize === 'icon') return { width: 36, height: 36, minWidth: 36, padding: 0, fontSize: 14 };
    return { height: 36, minWidth: hasLabel ? 36 : 36, padding: hasLabel ? '0 14px' : 0, fontSize: 14 };
  })();

  const baseColor = (() => {
    if (variant === 'solid') return themeTokens.textPrimary;
    if (variant === 'text') return themeTokens.tabActiveBorder;
    return selected ? themeTokens.tabActiveBorder : themeTokens.textSecondary;
  })();

  const interactiveBackground = (() => {
    if (variant === 'solid') {
      if (pressed) return themeTokens.tabInactiveBackground;
      if (hovered) return themeTokens.tabActiveBackground;
      return themeTokens.accentButtonBackground;
    }
    if (selected) return `${themeTokens.tabActiveBorder}22`;
    if (pressed) return `${themeTokens.tabActiveBorder}30`;
    if (hovered) return `${themeTokens.tabActiveBorder}1f`;
    return 'transparent';
  })();

  const interactiveBorder = (() => {
    if (variant === 'dashed') return `1px dashed ${themeTokens.tabActiveBorder}`;
    if (variant === 'outline') return `1px solid ${themeTokens.inputBorder}`;
    if (variant === 'solid') return `1px solid ${themeTokens.accentButtonBorder}`;
    return 'none';
  })();

  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...sizeStyle,
        width: fullWidth ? '100%' : sizeStyle.width,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: hasLabel ? 8 : 0,
        border: interactiveBorder,
        borderRadius: isCircleIconOnly ? '999px' : 10,
        background: interactiveBackground,
        color: baseColor,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        fontWeight: selected ? 700 : 600,
        lineHeight: 1,
        opacity: disabled ? 0.55 : 1,
        boxShadow: focused ? `0 0 0 2px ${themeTokens.tabActiveBorder}40` : 'none',
        transition: 'background-color 140ms ease, color 140ms ease, box-shadow 140ms ease, opacity 140ms ease',
        ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: resolvedSize === 'sm' ? 14 : 16 }}>{icon}</span>
      {loading ? '处理中…' : label}
    </button>
  );
}
