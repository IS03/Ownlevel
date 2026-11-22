/**
 * Background atmosphere (M9.3 Home V3): the screen glow and Home's Nutrition band.
 *
 * PENDING BRAND REVIEW: these colors are not in the brand palette (packages/brand) yet and
 * IDENTIDAD.md does not cover background gradients; both are reviewed at M9 close (see
 * docs/mobile/m9-brand-polish-plan.md). Until then they live here, apart from the theme
 * color roles, which only map brand values. Dark mode keeps the brand dark palette; only
 * the glow and the band are new.
 *
 * `bandTextMuted` (grey over the light glow/band) and `accentStrong` (accent text on a light
 * accent-tinted glass button) exist only for contrast (≥ 4.5:1); dark uses the brand values.
 *
 * Colors are kept as "r,g,b" so every gradient stop uses the same color with its own alpha
 * (never "transparent", which interpolates through grey).
 */
export const atmosphere = {
  light: { glow: '228,222,201', band: '228,222,201', bandTextMuted: '#5F5D54' as string | null, accentStrong: '#5E5129' as string | null },
  dark: { glow: '42,39,32', band: '31,29,24', bandTextMuted: null as string | null, accentStrong: null as string | null },
} as const;

/**
 * Light surfaces are never flat white (user rule, 22/11): fields, search and quick tiles catch a soft light from the
 * top-left corner and settle into the warm field color below. `sheen` is the light, `base` the field, `deep` where it
 * settles; `glow` is the champagne touch only tiles carry.
 */
export const fieldLight = {
  light: { sheen: '255,254,250', base: '250,248,244', deep: '241,235,223', glow: '201,182,138' },
  dark: { sheen: '50,49,46', base: '39,39,42', deep: '33,33,36', glow: '201,182,138' },
} as const;

export type AtmosphereScheme = keyof typeof atmosphere;

export const rgba = (rgb: string, alpha: number) => `rgba(${rgb},${alpha})`;

/** Top-right glow: an ellipse with radii 300 × 400, centred at 105 % / -4 % (slightly off screen). */
export function glowGradient(rgb: string): string {
  return `radial-gradient(ellipse 300px 400px at 105% -4%, ${rgba(rgb, 1)} 0%, ${rgba(rgb, 0.55)} 38%, ${rgba(rgb, 0)} 100%)`;
}

/** Vertical fade of a band edge: `in` goes from transparent to solid (top), `out` the reverse (bottom). */
export function fadeGradient(rgb: string, direction: 'in' | 'out'): string {
  const [from, to] = direction === 'in' ? [0, 1] : [1, 0];
  return `linear-gradient(to bottom, ${rgba(rgb, from)} 0%, ${rgba(rgb, to)} 100%)`;
}

/** The field's light: brighter at the top-left, warmer at the bottom-right. A tile adds a faint champagne glow in its corner. */
export function fieldGradient(scheme: AtmosphereScheme, tile = false): string {
  const c = fieldLight[scheme];
  const base = `linear-gradient(160deg, ${rgba(c.sheen, 1)} 0%, ${rgba(c.base, 1)} 45%, ${rgba(c.deep, 1)} 100%)`;
  return tile ? `radial-gradient(ellipse 140px 90px at 0% 0%, ${rgba(c.glow, scheme === 'light' ? 0.16 : 0.12)} 0%, ${rgba(c.glow, 0)} 100%), ${base}` : base;
}
