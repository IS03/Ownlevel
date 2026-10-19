import type { TextStyle } from 'react-native';

import { layout, palette, radius as brandRadius, space, typeScale } from './brand';

// Mobile adapter over the shared OWNLEVEL brand tokens (packages/brand). Every value
// comes from the brand; this file only maps the design-system names onto it.
// Legacy names are kept so screens keep compiling; M9.2/M9.3 migrate consumers.

type ColorRoles = {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  brandSubtle: string;
  brandSurface: string;
  onBrand: string;
  danger: string;
  dangerSoft: string;
};

function colorRoles(scheme: (typeof palette)['dark'] | (typeof palette)['light']): ColorRoles {
  return {
    background: scheme.bg,
    surface: scheme.surface,
    // Brand "elevated": inputs, chips, inner blocks and pressed states.
    surfaceRaised: scheme.elevated,
    text: scheme.text,
    textMuted: scheme.textMuted,
    border: scheme.border,
    primary: scheme.accent,
    onPrimary: scheme.onAccent,
    brandSubtle: scheme.accentSoft,
    // Hero surfaces stay solid until the hero gradient lands (heroFrom → heroTo).
    brandSurface: scheme.heroFrom,
    onBrand: scheme.onHero,
    // System failures and destructive actions only, never to judge the user's data.
    danger: scheme.error,
    dangerSoft: scheme.errorSoft,
  };
}

export const lightColors = colorRoles(palette.light);
export const darkColors = colorRoles(palette.dark);

export type ThemeColors = ColorRoles;

/**
 * Legacy spacing names mapped onto the brand scale (4, 8, 12, 16, 20, 24, 32, 40).
 * `none` is the absence of spacing. `xxxl` was 48, which is outside the scale:
 * it maps to the largest brand step (40).
 */
export const spacing = {
  none: 0,
  xs: space.xxs,
  sm: space.xs,
  md: space.sm,
  lg: space.md,
  xl: space.xl,
  xxl: space.xxl,
  xxxl: space.xxxl,
} as const;

/**
 * Brand radii (card, inner, button, chip, input, sheet, tabBar, full). Prefer these
 * names in new code. Legacy aliases, by actual use: `sm` = inputs/skeleton → input,
 * `md` = inner elements/buttons → inner, `lg` = surfaces → card, `xl` = hero card → card,
 * `pill` = pills/tracks → full.
 */
export const radius = {
  ...brandRadius,
  sm: brandRadius.input,
  md: brandRadius.inner,
  lg: brandRadius.card,
  xl: brandRadius.card,
  pill: brandRadius.full,
} as const;

export const sizes = {
  touchTarget: layout.minTouch,
  // Mobile-only layout constraints (not brand tokens).
  contentMaxWidth: 720,
  separator: 1,
} as const;

type TypographyToken = Pick<TextStyle, 'fontSize' | 'fontWeight' | 'letterSpacing' | 'lineHeight'>;

/**
 * The brand iOS type scale (no fontFamily: iOS renders SF Pro, Android Roboto), plus
 * the historical role names used across screens, mapped onto it.
 */
export const typography = {
  largeTitle: typeScale.largeTitle,
  title1: typeScale.title1,
  title2: typeScale.title2,
  headline: typeScale.headline,
  body: typeScale.body,
  subheadline: typeScale.subheadline,
  footnote: typeScale.footnote,
  caption: typeScale.caption,
  /** Main number of a sheet or hero (IDENTIDAD.md § Tipografía). Always with `numeric`. */
  heroNumber: typeScale.heroNumber,
  /** Same as largeTitle. */
  display: typeScale.largeTitle,
  /** Same as title2. */
  heading: typeScale.title2,
  /** Same as headline (button labels, field labels, row titles). */
  label: typeScale.headline,
} as const satisfies Record<string, TypographyToken>;
