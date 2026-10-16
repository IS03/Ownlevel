import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import { Text } from 'react-native';

import { layout, palette, radius as brandRadius, space, typeScale } from './brand';
import { OwnlevelThemeProvider, useOwnlevelTheme } from './theme';
import { darkColors, lightColors, radius, sizes, spacing, typography, type ThemeColors } from './tokens';

describe('Mobile theme on the OWNLEVEL brand tokens', () => {
  const schemes: [string, ThemeColors, Record<string, string>][] = [
    ['light', lightColors, palette.light],
    ['dark', darkColors, palette.dark],
  ];
  it.each(schemes)('%s colors come from the official palette', (_, colors, brand) => {
    expect(colors).toMatchObject({
      background: brand.bg, surface: brand.surface, surfaceRaised: brand.elevated, text: brand.text,
      textMuted: brand.textMuted, border: brand.border, primary: brand.accent, onPrimary: brand.onAccent,
      brandSubtle: brand.accentSoft, brandSurface: brand.heroFrom, onBrand: brand.onHero, danger: brand.error,
    });
    // Every role is a brand value: no green/amber (or any other off-brand color) is reintroduced.
    const allowed = new Set<string>(Object.values(brand));
    expect(Object.entries(colors).filter(([, value]) => !allowed.has(value))).toEqual([]);
    expect(colors.dangerSoft).toBe(brand.errorSoft);
    // The deprecated success/warning/unavailable aliases are gone (M9.2).
    expect(Object.keys(colors).filter(k => /success|warning|unavailable/.test(k))).toEqual([]);
  });

  it('champagne is the primary accent in both modes', () => {
    expect(lightColors.primary).toBe('#705F36');
    expect(darkColors.primary).toBe('#C9B68A');
  });

  it('typography, spacing, radius and sizes are derived from the shared tokens', () => {
    expect(typography.display).toBe(typeScale.largeTitle);
    expect(typography.heading).toBe(typeScale.title2);
    expect(typography.body).toBe(typeScale.body);
    expect(typography.label).toBe(typeScale.headline);
    expect(typography.caption).toBe(typeScale.caption);
    for (const role of Object.keys(typeScale) as (keyof typeof typeScale)[]) expect(typography[role]).toBe(typeScale[role]);
    expect('overline' in typography).toBe(false);
    const scale = new Set<number>([0, ...Object.values(space)]);
    expect(Object.values(spacing).filter(v => !scale.has(v))).toEqual([]);
    const radii = new Set<number>(Object.values(brandRadius));
    expect(Object.values(radius).filter(v => !radii.has(v))).toEqual([]);
    expect(radius).toMatchObject(brandRadius);
    expect(sizes.touchTarget).toBe(layout.minTouch);
  });

  it('the theme provider delivers the brand palette for the resolved mode', () => {
    function Probe() {
      const { colors, mode } = useOwnlevelTheme();
      return <Text testID="probe">{`${mode}:${colors.background}:${colors.primary}`}</Text>;
    }
    const dark = render(<OwnlevelThemeProvider initialMode="dark"><Probe /></OwnlevelThemeProvider>);
    expect(dark.getByTestId('probe').props.children).toBe(`dark:${palette.dark.bg}:${palette.dark.accent}`);
    const light = render(<OwnlevelThemeProvider initialMode="light"><Probe /></OwnlevelThemeProvider>);
    expect(light.getByTestId('probe').props.children).toBe(`light:${palette.light.bg}:${palette.light.accent}`);
  });
});
