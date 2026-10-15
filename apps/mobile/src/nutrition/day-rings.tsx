import Svg, { Circle, G } from 'react-native-svg';
import { brandTokens, useOwnlevelTheme } from '@/design-system';
import { ringFraction, type DayRings, type RingReading } from './day-home-model';

/** More than one turn keeps the base full, then paints the current lap in a darker champagne. */
export function ringLaps(fraction: number | null) {
  if (fraction === null || fraction <= 0) return { base: 0, excess: 0 };
  return { base: Math.min(fraction, 1), excess: fraction > 1 ? ((fraction - 1) % 1 || 1) : 0 };
}
const darker = (hex: string) => `#${[1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.74).toString(16).padStart(2, '0')).join('')}`;

function Ring({ color, radius, reading, stroke, testID, track }: {
  color: string; radius: number; reading: RingReading; stroke: number; testID: string; track: string;
}) {
  const fraction = ringFraction(reading);
  const { base, excess } = ringLaps(fraction);
  const circumference = 2 * Math.PI * radius;
  const arc = (share: number, tint: string, id: string) => share > 0 ? <Circle cx={80} cy={80} r={radius} fill="none"
    stroke={tint} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${share * circumference} ${circumference}`}
    testID={id} /> : null;
  return <G rotation={-90} origin="80, 80">
    <Circle cx={80} cy={80} r={radius} fill="none" stroke={track} strokeWidth={stroke}
      strokeDasharray={fraction === null ? '3 5' : undefined} testID={`${testID}-${fraction === null ? 'unknown' : 'track'}`} />
    {arc(base, color, `${testID}-base`)}
    {arc(excess, darker(color), `${testID}-excess`)}
  </G>;
}

/** Decorative geometry only; the containing control provides exact values and data-state labels. */
export function NutritionRings({ readings, size = 148, testID = 'nutrition-rings' }: { readings: DayRings; size?: number; testID?: string }) {
  const { colors, isDark } = useOwnlevelTheme();
  const outer = brandTokens.palette.dark.accent;
  const inner = isDark ? brandTokens.palette.dark.heroTo : colors.primary;
  return <Svg accessibilityElementsHidden importantForAccessibility="no-hide-descendants" width={size} height={size} viewBox="0 0 160 160" testID={testID}>
    <Ring color={outer} radius={69} reading={readings.calories} stroke={16} testID={`${testID}-calories`} track={colors.surfaceRaised} />
    <Ring color={inner} radius={47} reading={readings.protein} stroke={16} testID={`${testID}-protein`} track={colors.surfaceRaised} />
  </Svg>;
}

export function NutritionCalorieRing({ reading, size = 40, testID }: { reading: RingReading; size?: number; testID: string }) {
  const { colors } = useOwnlevelTheme();
  return <Svg accessibilityElementsHidden width={size} height={size} viewBox="0 0 160 160" testID={testID}>
    <Ring color={brandTokens.palette.dark.accent} radius={69} reading={reading} stroke={10} track={colors.surfaceRaised} testID={testID} />
  </Svg>;
}
