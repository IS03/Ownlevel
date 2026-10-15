import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, spacing, useOwnlevelTheme } from '@/design-system';

export type PeriodChartPoint = { key: string; label: string; value: number | null; text: string; onPress?: () => void; hint?: string; soft?: boolean };

const H = 140, DOT = 8;

/**
 * One mark per point, fitting the width (IDENTIDAD.md § Gráficos):
 * - `bars`: from 0, so heights compare; 0 is a faint baseline and null is a gap (never 0);
 * - `dots`: a position between the lowest and highest value shown (weight, measures), where bars from 0 would hide the change.
 * Bars are full champagne and dots stress the latest record; `soft` marks a point still in progress.
 */
export function PeriodChart({ points, mode, target, testID }: { points: PeriodChartPoint[]; mode: 'bars' | 'dots'; target?: number | null; testID: string }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(300);
  const known = points.map(p => p.value).filter((v): v is number => v !== null);
  const high = Math.max(mode === 'bars' ? 1 : -Infinity, ...known, ...(mode === 'bars' && target ? [target] : []));
  const low = mode === 'dots' ? Math.min(...known) : 0;
  const lastKnown = points.map(p => p.value !== null).lastIndexOf(true);
  const n = points.length, step = Math.ceil(n / 5);
  const labeled = (i: number) => n <= 6 || i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2);
  const y = (v: number) => mode === 'bars' ? (H * v) / high : high === low ? H / 2 : ((v - low) / (high - low)) * (H - DOT);
  return <View testID={testID} onLayout={e => setWidth(e.nativeEvent.layout.width)} style={styles.chart}>
    {mode === 'bars' && target ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
      testID={`${testID}-target`} style={[styles.target, { top: H - y(target), borderColor: colors.textMuted }]} /> : null}
    {points.map((p, i) => {
      // Bars are all champagne (soft only while in progress); dots stress the latest record, as in the sketches.
      const full = mode === 'bars' ? !p.soft : i === lastKnown && !p.soft;
      const color = colors.primary, opacity = full ? 1 : 0.4;
      const mark = p.value === null ? null
        : mode === 'dots' ? <View style={[styles.dot, { bottom: y(p.value), backgroundColor: color, opacity }]} />
        : <View style={{ height: p.value === 0 ? 1 : Math.max(2, y(p.value)), backgroundColor: p.value === 0 ? colors.border : color, opacity: p.value === 0 ? 1 : opacity,
          borderTopLeftRadius: p.value === 0 ? 0 : 3, borderTopRightRadius: p.value === 0 ? 0 : 3 }} />;
      const kind = p.value === null ? 'gap' : p.value === 0 && mode === 'bars' ? 'zero' : 'mark';
      const a11y = `${p.label}, ${p.text}`;
      const body = <><View style={styles.plot}>{mark}</View>
        <AppText muted numeric variant="caption" numberOfLines={1} style={[styles.date, { width: Math.max(44, width / 5) }]}>{labeled(i) ? p.label : ''}</AppText></>;
      return p.onPress && p.value !== null
        ? <Pressable key={p.key} testID={`${testID}-${p.key}-${kind}`} accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint={p.hint} onPress={p.onPress} style={[styles.slot, { paddingHorizontal: n > 20 ? 1 : 3 }]}>{body}</Pressable>
        : <View key={p.key} testID={`${testID}-${p.key}-${kind}`} accessible accessibilityLabel={a11y} style={[styles.slot, { paddingHorizontal: n > 20 ? 1 : 3 }]}>{body}</View>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  chart: { flexDirection: 'row', minHeight: H + 28 },
  slot: { flex: 1, minWidth: 0, gap: spacing.xs },
  plot: { height: H, justifyContent: 'flex-end' },
  dot: { position: 'absolute', alignSelf: 'center', width: DOT, height: DOT, borderRadius: DOT / 2 },
  date: { alignSelf: 'center', textAlign: 'center' },
  target: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', zIndex: 1 },
});
