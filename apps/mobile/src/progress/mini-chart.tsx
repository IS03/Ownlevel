import { StyleSheet, View } from 'react-native';
import type { ProgressSparkPoint } from '@/api/progress';
import { useOwnlevelTheme } from '@/design-system';

export type SparkMode = 'bars' | 'level';
export type SparkMark = { key: string; tone: 'current' | 'reference'; kind: 'missing' | 'zero' | 'mark'; height: number };

/**
 * Mini chart geometry (IDENTIDAD.md § Gráficos): one mark per bucket, a null bucket is a gap (never 0).
 * - `bars` (sets, kcal): heights from 0, so a bar twice as tall is twice the value; 0 is a faint flat line.
 * - `level` (weight): a dot per bucket between the lowest and highest value shown; bars from 0 would hide the change.
 * With a comparison, both ranges share the scale and sit side by side in date order (comparison in grey).
 */
export function sparkGeometry(current: ProgressSparkPoint[], reference: ProgressSparkPoint[] | null, mode: SparkMode): SparkMark[][] {
  const groups = [{ tone: 'current' as const, points: current }, ...(reference ? [{ tone: 'reference' as const, points: reference }] : [])]
    .filter(g => g.points.length > 0).sort((a, b) => a.points[0].start.localeCompare(b.points[0].start));
  const known = groups.flatMap(g => g.points.map(p => p.value)).filter((v): v is number => v !== null);
  const high = Math.max(0, ...known), low = mode === 'level' ? Math.min(...known) : 0;
  return groups.map(g => g.points.map(p => {
    const key = `${g.tone}-${p.start}`;
    if (p.value === null) return { key, tone: g.tone, kind: 'missing', height: 0 };
    if (mode === 'bars' && p.value === 0) return { key, tone: g.tone, kind: 'zero', height: 0 };
    const height = mode === 'level' ? (high === low ? 0.5 : (p.value - low) / (high - low)) : p.value / high;
    return { key, tone: g.tone, kind: 'mark', height };
  }));
}

const W = 72, H = 30, GROUP_GAP = 5;

/** Decorative: the row's text says the same values, so the chart is hidden from VoiceOver. */
export function MiniChart({ current, reference, mode, testID }: { current: ProgressSparkPoint[]; reference: ProgressSparkPoint[] | null; mode: SparkMode; testID?: string }) {
  const { colors } = useOwnlevelTheme();
  const groups = sparkGeometry(current, reference, mode);
  const count = groups.reduce((t, g) => t + g.length, 0);
  if (!count || groups.every(g => g.every(m => m.kind === 'missing'))) return null;
  const gap = count > 20 ? 1 : 2;
  const width = Math.max(1, (W - GROUP_GAP * (groups.length - 1) - gap * (count - groups.length)) / count);
  const dot = Math.min(6, Math.max(3, width));
  return <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chart, { gap: GROUP_GAP }]}>
    {groups.map((g, i) => <View key={i} style={[styles.group, { gap }]}>
      {g.map(m => {
        const color = m.tone === 'current' ? colors.primary : colors.textMuted;
        const opacity = m.tone === 'current' ? 1 : 0.4;
        return <View key={m.key} testID={testID ? `${testID}-${m.key}-${m.kind}` : undefined} style={{ width, height: H, justifyContent: 'flex-end' }}>
          {m.kind === 'zero' ? <View style={{ height: 1, backgroundColor: color, opacity: opacity * 0.5 }} />
            : m.kind === 'mark' && mode === 'bars' ? <View style={{ height: Math.max(2, m.height * H), backgroundColor: color, opacity, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5 }} />
            : m.kind === 'mark' ? <View style={{ width: dot, height: dot, borderRadius: dot / 2, alignSelf: 'center', marginBottom: m.height * (H - dot), backgroundColor: color, opacity }} />
            : null}
        </View>;
      })}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({ chart: { width: W, height: H, flexDirection: 'row', alignItems: 'flex-end' }, group: { flexDirection: 'row', alignItems: 'flex-end' } });
