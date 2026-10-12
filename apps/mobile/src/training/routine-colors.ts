import type { MobileRoutineColorKey } from '@/api/home';
import { palette, routinePalette } from '@/design-system/brand';

const routineColorLabels: Record<MobileRoutineColorKey, string> = {
  violet: 'violeta', indigo: 'índigo', blue: 'azul', cyan: 'celeste',
  green: 'verde', yellow: 'amarillo', orange: 'naranja', rose: 'rosa',
};

export function trainingRoutineColor(key: MobileRoutineColorKey, isDark: boolean): string {
  return routinePalette[isDark ? 'dark' : 'light'][key];
}

export function trainingRoutineColorLabel(key: MobileRoutineColorKey | null): string {
  return key === null ? 'sin color' : routineColorLabels[key];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function routineColorContrast(background: string, foreground: string): number {
  const [low, high] = [luminance(background), luminance(foreground)].sort((a, b) => a - b);
  return (high + 0.05) / (low + 0.05);
}

/** Pick the most legible brand token for a swatch's check, independent of the screen's theme. */
export function trainingRoutineCheckColor(key: MobileRoutineColorKey, isDark: boolean): string {
  const background = trainingRoutineColor(key, isDark);
  const candidates = [palette.light.onAccent, palette.light.text];
  return candidates.reduce((best, candidate) => routineColorContrast(background, candidate) >
    routineColorContrast(background, best) ? candidate : best);
}
