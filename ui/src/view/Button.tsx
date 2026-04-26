/* AI 生成 By Peng.Guo */
import { useMemo, useState, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import type { AppThemeTokens } from '../domain/theme/appTheme';

export type ButtonVariant = 'solid' | 'soft' | 'outline' | 'ghost' | 'dashed' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

type ButtonProps = {
  themeTokens: AppThemeTokens;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  selected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  title?: string;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
};

type Palette = {
  background: string;
  border: string;
  color: string;
  hoverBackground: string;
  activeBackground: string;
};

const SIZE_STYLES: Record<ButtonSize, CSSProperties> = {
  sm: { height: 28, padding: '0 10px', fontSize: 12, borderRadius: 8, fontWeight: 500 },
  md: { height: 36, padding: '0 14px', fontSize: 14, borderRadius: 10, fontWeight: 500 },
  lg: { height: 40, padding: '0 16px', fontSize: 14, borderRadius: 10, fontWeight: 500 },
  icon: { width: 28, height: 28, padding: 0, fontSize: 14, borderRadius: 8 },
};

function buildPalettes(tokens: AppThemeTokens): Record<ButtonVariant, Palette> {
  return {
    solid: {
      background: tokens.accentButtonBackground,
      border: tokens.accentButtonBorder,
      color: tokens.textPrimary,
      hoverBackground: tokens.tabActiveBackground,
      activeBackground: tokens.tabInactiveBackground,
    },
    soft: {
      background: tokens.tabInactiveBackground,
      border: tokens.inputBorder,
      color: tokens.tabActiveBorder,
      hoverBackground: tokens.workspacePanelSubtleBackground,
      activeBackground: tokens.workspacePanelBackground,
    },
    outline: {
      background: 'transparent',
      border: tokens.inputBorder,
      color: tokens.textPrimary,
      hoverBackground: tokens.tabInactiveBackground,
      activeBackground: tokens.workspacePanelBackground,
    },
    ghost: {
      background: 'transparent',
      border: 'transparent',
      color: tokens.tabActiveBorder,
      hoverBackground: `${tokens.tabActiveBorder}24`,
      activeBackground: tokens.workspacePanelBackground,
    },
    dashed: {
      background: tokens.tabInactiveBackground,
      border: tokens.tabActiveBorder,
      color: tokens.tabActiveBorder,
      hoverBackground: tokens.workspacePanelSubtleBackground,
      activeBackground: tokens.workspacePanelBackground,
    },
    text: {
      background: 'transparent',
      border: 'transparent',
      color: tokens.tabActiveBorder,
      hoverBackground: `${tokens.tabActiveBorder}24`,
      activeBackground: tokens.workspacePanelBackground,
    },
  };
}

export function Button({
  themeTokens,
  children,
  variant = 'ghost',
  size = 'md',
  selected = false,
  disabled = false,
  loading = false,
  fullWidth = false,
  startIcon,
  endIcon,
  title,
  ariaLabel,
  onClick,
  style,
  type = 'button',
}: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const palettes = useMemo(() => buildPalettes(themeTokens), [themeTokens]);
  const palette = palettes[variant];
  const interactionBackground = pressed ? palette.activeBackground : hovered ? palette.hoverBackground : palette.background;
  const selectedBackground =
    variant === 'solid'
      ? themeTokens.tabActiveBackground
      : `${themeTokens.tabActiveBorder}1f`;
  const effectiveBackground = selected ? selectedBackground : interactionBackground;
  const effectiveBorder = variant === 'dashed' ? `1px dashed ${palette.border}` : `1px solid ${selected ? themeTokens.tabActiveBorder : palette.border}`;
  const effectiveColor = selected
    ? (variant === 'solid' ? themeTokens.textPrimary : themeTokens.tabActiveBorder)
    : palette.color;

  return (
    <button
      type={type}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled || loading}
      style={{
        ...SIZE_STYLES[size],
        width: fullWidth ? '100%' : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        border: effectiveBorder,
        background: effectiveBackground,
        color: effectiveColor,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        fontWeight: selected ? 600 : (size === 'icon' ? 600 : 500),
        lineHeight: 1,
        opacity: disabled ? 0.55 : 1,
        boxShadow: focused ? `0 0 0 2px ${themeTokens.tabActiveBorder}40` : 'none',
        transition: 'background-color 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease, opacity 140ms ease',
        ...style,
      }}
    >
      {startIcon ? <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: size === 'sm' ? 14 : 16 }}>{startIcon}</span> : null}
      {loading ? '处理中…' : children}
      {endIcon ? <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: size === 'sm' ? 14 : 16 }}>{endIcon}</span> : null}
    </button>
  );
}
