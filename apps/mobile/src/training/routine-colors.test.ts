import { describe, expect, it } from '@jest/globals';
import { MOBILE_ROUTINE_COLOR_KEYS } from '@/api/routine-color';
import { palette, routinePalette } from '@/design-system/brand';
import { routineColorContrast, trainingRoutineCheckColor, trainingRoutineColor } from './routine-colors';

describe('routine palette', () => {
  it.each([false, true])('uses brand colors and readable selection checks (dark=%s)', isDark => {
    for (const key of MOBILE_ROUTINE_COLOR_KEYS) {
      const background = trainingRoutineColor(key, isDark);
      const foreground = trainingRoutineCheckColor(key, isDark);
      expect(background).toBe(routinePalette[isDark ? 'dark' : 'light'][key]);
      expect([palette.light.onAccent, palette.light.text]).toContain(foreground);
      expect(routineColorContrast(background, foreground)).toBeGreaterThanOrEqual(3);
    }
  });
});
