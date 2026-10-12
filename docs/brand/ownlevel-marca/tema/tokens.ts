/**
 * OWNLEVEL · tokens de diseño
 * Fuente única de verdad para mobile (Expo) y web (Tailwind).
 * Paleta: grafito + champagne (pantallas 38 oscuro / 43 claro del canvas).
 *
 * Reglas que el código no puede imponer, pero hay que respetar:
 * - Un solo acento. Champagne = lo importante (CTA, serie activa, récord).
 * - En claro, el acento de texto/íconos es #7D6A3C; #C9B68A solo para fondos/hero.
 * - Sin semáforo rojo/verde sobre datos del usuario. `error` es solo para fallas
 *   del sistema (sync, pagos) y acciones destructivas.
 * - Subas/bajas se marcan con flecha, no con color.
 * - Gráficos: máximo 4 series, etiqueta directa, champagne = serie principal.
 * - Vidrio SOLO en controles (tab bar, botones flotantes, barra superior al hacer
 *   scroll, controles sobre fotos/gráficos, temporizador flotante). Tarjetas,
 *   filas, listas, inputs y hero van sólidos.
 * - Íconos: SF Symbols en iOS (expo-symbols), Lucide en Android/web. Trazo 2.
 *   Tamaños 24 (tab bar), 20 (filas y botones), 17 (junto a texto Body).
 *   Gris secundario en reposo, accent cuando está activo.
 * - Respetar "Reducir movimiento": sin resortes, solo fundidos.
 *
 * Decisiones (canvas): 77 B · Equilibrado, 78 A, 79 A, 80 B · Nativo,
 * 81 B · Compañero de gym, 82 B · Vista previa de ejemplo.
 */

export type ColorScheme = 'dark' | 'light';

export const palette = {
  dark: {
    bg: '#09090B',
    surface: '#18181B',
    elevated: '#27272A',
    border: 'rgba(255,255,255,0.08)',
    text: '#F4F4F5',
    textMuted: '#9F9FA9',
    accent: '#C9B68A',
    accentSoft: 'rgba(201,182,138,0.16)',
    onAccent: '#1A1710',
    heroFrom: '#DCCBA3',
    heroTo: '#A8935F',
    onHero: '#1A1710',
    error: '#E5736B',
    errorSoft: 'rgba(229,115,107,0.14)',
  },
  light: {
    bg: '#F3F1EC',
    surface: '#FFFFFF',
    elevated: '#EAE7DF',
    border: '#E0DCD0',
    text: '#18181B',
    textMuted: '#6A6A72',
    accent: '#7D6A3C',
    accentSoft: 'rgba(201,182,138,0.32)',
    onAccent: '#FFFFFF',
    heroFrom: '#DCCBA3',
    heroTo: '#A8935F',
    onHero: '#1A1710',
    error: '#B4392F',
    errorSoft: 'rgba(180,57,47,0.10)',
  },
} as const satisfies Record<ColorScheme, Record<string, string>>;

export type ColorToken = keyof (typeof palette)['dark'];

/** Colores de rutina (C4): identidad mediante tira/punto, nunca acento de acciones o estados. */
export const routinePalette = {
  light: {
    violet: '#6B5BA8', indigo: '#4A5694', blue: '#3F6A96', cyan: '#2F7A72',
    green: '#5E7346', yellow: '#B08A3E', orange: '#A3573A', rose: '#9C4A6B',
  },
  dark: {
    violet: '#A99BD6', indigo: '#8E97D0', blue: '#7FA3C9', cyan: '#6FB3AA',
    green: '#9DB07F', yellow: '#D4B26A', orange: '#D08C6A', rose: '#CF8AA6',
  },
} as const;

/** Series de gráficos, en orden de uso. Máximo 4 por gráfico. */
export const chart = {
  dark: ['#C9B68A', '#7FA3C9', '#A99BD6', '#D08C6A', '#6FB3AA', '#8E8E96'],
  light: ['#7D6A3C', '#3F6A96', '#6B5BA8', '#A3573A', '#2F7A72', '#6A6A72'],
} as const;

/** Escala de intensidad/constancia (calendario, heatmap): 0 = nada, 4 = máximo. */
export const intensity = {
  dark: ['#27272A', '#504B42', '#786E5A', '#A09272', '#C9B68A'],
  light: ['#EAE7DF', '#CFC8B6', '#B4A88E', '#988965', '#7D6A3C'],
} as const;

/**
 * Tipografía: SF Pro (fuente del sistema en iOS). En Android cae en Roboto,
 * en web en la fuente del sistema. Hanken Grotesk solo vive en el logotipo (SVG).
 * Tamaños = estilos de texto de iOS, en pt.
 */
export const typeScale = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.4 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.4 },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.2 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.1 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
} as const;

export type TypeStyle = keyof typeof typeScale;

/** Radios (pt/px). Sistema 77 B · Equilibrado. */
export const radius = {
  card: 20,
  inner: 12, // filas de series y elementos dentro de una tarjeta
  button: 14,
  chip: 10,
  input: 12,
  sheet: 28, // hojas modales (bottom sheet), esquinas superiores
  tabBar: 26, // barra de pestañas flotante
  full: 999, // avatares, botones circulares flotantes
} as const;

/** Escala de espacios: todo múltiplo de 4. Nada fuera de esta lista. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

/** Medidas de layout del sistema 77 B. */
export const layout = {
  screenPadding: 16,
  cardPadding: 18, // única excepción a la escala, a propósito (aire interno de tarjeta)
  blockGap: 12,
  rowHeight: 44,
  buttonHeight: 50,
  inputHeight: 48,
  chipHeight: 34,
  tabBarHeight: 62,
  tabBarInset: 16, // separación de la barra flotante a los bordes
  minTouch: 44,
} as const;

/** Vidrio (imitación para Android/web; en iOS 26 usar el vidrio del sistema). */
export const glass = {
  dark: { fill: 'rgba(38,38,42,0.55)', border: 'rgba(255,255,255,0.12)', highlight: 'rgba(255,255,255,0.14)', blur: 22 },
  light: { fill: 'rgba(255,255,255,0.62)', border: 'rgba(255,255,255,0.90)', highlight: 'rgba(255,255,255,0.90)', blur: 22 },
} as const;

/** Movimiento · 80 B · Nativo: resortes suaves sin rebote visible. */
export const motion = {
  duration: { fast: 200, base: 300, slow: 450 },
  /** Curva para animaciones por tiempo (fundidos, colores). */
  easing: [0.2, 0, 0, 1] as const,
  /** Resorte para movimientos (entrar, presionar, expandir). Amortiguación ~0,9: sin rebote visible. */
  spring: { damping: 28, stiffness: 240, mass: 1 },
  pressScale: 0.95,
} as const;

/**
 * Vibración · 80 B. Nombre del evento → tipo de vibración.
 * (La implementación con expo-haptics está en mobile/haptics.ts.)
 */
export const hapticsMap = {
  stepperChange: 'selection', // cambiar peso o reps
  setComplete: 'impactMedium', // terminar una serie
  restEnd: 'impactHeavy', // fin del descanso
  personalRecord: 'success', // récord
  workoutComplete: 'success', // terminar entrenamiento
  systemError: 'error', // falla de sync, pago, etc.
} as const;

export type HapticEvent = keyof typeof hapticsMap;
