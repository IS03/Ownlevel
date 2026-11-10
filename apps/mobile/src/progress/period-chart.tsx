import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';

export type PeriodChartPoint = { key: string; label: string; value: number | null; text: string; onPress?: () => void; hint?: string; soft?: boolean;
  /** `dots` only: the value written over the dot ("62,7"); shown for every point when there are few, otherwise first, last, lowest and highest. */
  valueText?: string };
/** A plan stage behind the points (keys are dates): start inclusive, end exclusive (null = open). */
export type PeriodChartBand = { id: string; start: string; end: string | null; label: string; current: boolean };

const H = 140, DOT = 8, LABEL = 18;

/**
 * One mark per point, fitting the width (IDENTIDAD.md § Gráficos):
 * - `bars`: from 0, so heights compare; 0 is a faint baseline and null is a gap (never 0);
 * - `dots`: a position between the lowest and highest value shown (weight, measures), where bars from 0 would hide the change.
 * Bars are full champagne and dots stress the latest record; `soft` marks a point still in progress.
 */
export function PeriodChart({ points, mode, target, bands, testID, inspection, compact = false }: {
  points: PeriodChartPoint[]; mode: 'bars' | 'dots'; target?: number | null; bands?: PeriodChartBand[]; testID: string;
  /** Portada preview only; default detail charts keep their existing geometry. */
  compact?: boolean;
  /** Opt-in for Métricas: inspect even empty buckets, with scrollable 44 pt targets and narrower marks. */
  inspection?: { selectedKey: string | null; onSelect: (key: string) => void };
}) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(300);
  const plotHeight = compact ? brandTokens.layout.minTouch : H;
  const known = points.map(p => p.value).filter((v): v is number => v !== null);
  const high = Math.max(mode === 'bars' ? 1 : -Infinity, ...known, ...(mode === 'bars' && target ? [target] : []));
  const low = mode === 'dots' ? Math.min(...known) : inspection ? Math.min(0, ...known, target ?? 0) : 0;
  const lastKnown = points.map(p => p.value !== null).lastIndexOf(true);
  const n = points.length, step = Math.ceil(n / 5);
  const labeled = (i: number) => n <= 6 || i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2);
  const bandOf = (key: string) => bands?.find(b => key >= b.start && (b.end === null || key < b.end)) ?? null;
  // Dots can carry their value on top: a few always, many only at the ends and at the lowest and highest.
  const idx = points.flatMap((p, i) => p.value === null ? [] : [i]);
  const byValue = [...idx].sort((a, b) => points[a].value! - points[b].value!);
  const written = new Set(mode !== 'dots' || !points.some(p => p.valueText) ? [] : idx.length <= 6 ? idx
    : [idx[0], idx[idx.length - 1], byValue[0], byValue[byValue.length - 1]]);
  const room = written.size ? LABEL : 0;
  // Dots sit a few points above the dates, so the lowest one never touches its label.
  const lift = mode === 'dots' ? 4 : 0;
  const y = (v: number) => mode === 'bars' ? (plotHeight * v) / (high - low) : high === low ? (plotHeight - room) / 2 : lift + ((v - low) / (high - low)) * (plotHeight - DOT - room - lift);
  const baseline = mode === 'bars' ? y(-low) : 0;
  return <View testID={testID} onLayout={e => setWidth(e.nativeEvent.layout.width)} style={[styles.chart, { minHeight: plotHeight + 28 }, inspection && { flex: 1, minWidth: n * brandTokens.layout.minTouch }]}>
    {inspection && low < 0 ? <View pointerEvents="none" style={[styles.target, { top: plotHeight - baseline, borderColor: colors.border }]} /> : null}
    {mode === 'bars' && target != null && (target !== 0 || inspection) ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
      testID={`${testID}-target`} style={[styles.target, { top: plotHeight - baseline - y(target), borderColor: colors.text }]} /> : null}
    {points.map((p, i) => {
      // Bars are all champagne (soft only while in progress); dots stress the latest record, as in the sketches.
      const full = mode === 'bars' ? !p.soft : i === lastKnown && !p.soft;
      const color = colors.primary, opacity = full ? 1 : 0.4;
      const mark = p.value === null ? null
        : mode === 'dots' ? <>
          <View style={[styles.dot, { bottom: y(p.value), backgroundColor: color, opacity }]} />
          {written.has(i) && p.valueText ? <AppText numeric variant="caption" numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no"
            style={[styles.value, { bottom: y(p.value) + DOT + 2, color: full ? colors.text : colors.textMuted }]}>{p.valueText}</AppText> : null}
        </>
        : <View style={[{ height: p.value === 0 ? 1 : Math.max(2, inspection ? Math.abs(y(p.value)) : y(p.value)), backgroundColor: p.value === 0 ? colors.border : color, opacity: p.value === 0 ? 1 : opacity,
          borderTopLeftRadius: p.value === 0 ? 0 : 3, borderTopRightRadius: p.value === 0 ? 0 : 3 }, inspection && { position: 'absolute', bottom: baseline + Math.min(0, y(p.value)), width: spacing.lg, maxWidth: '100%', alignSelf: 'center' }]} />;
      const kind = p.value === null ? 'gap' : p.value === 0 && mode === 'bars' ? 'zero' : 'mark';
      const a11y = `${p.label}, ${p.text}`;
      const band = bandOf(p.key), firstOfBand = !!band && (i === 0 || bandOf(points[i - 1].key)?.id !== band.id);
      const backdrop = band ? <View pointerEvents="none" testID={`${testID}-band-${band.id}-${p.key}`}
        style={[{ position: 'absolute', top: 0, bottom: 0, left: -(n > 20 ? 1 : 3), right: -(n > 20 ? 1 : 3) }, { backgroundColor: band.current ? colors.primary : colors.border, opacity: band.current ? 0.14 : 0.45 }]} /> : null;
      const tag = firstOfBand ? <AppText numberOfLines={1} variant="caption" style={[styles.band, { color: band!.current ? colors.primary : colors.textMuted }]}>{band!.label}</AppText> : null;
      const selected = inspection?.selectedKey === p.key;
      const body = <><View style={[styles.plot, { height: plotHeight }, selected && { borderColor: colors.primary, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.inner }]}>{backdrop}{tag}{mark}</View>
        <AppText muted numeric variant="caption" numberOfLines={inspection ? undefined : 1} style={[styles.date, { width: inspection ? Math.max(brandTokens.layout.minTouch, width / n - spacing.sm) : Math.max(44, width / 5) }]}>{labeled(i) ? p.label : ''}</AppText></>;
      return inspection
        ? <Pressable key={p.key} testID={`${testID}-${p.key}-${kind}`} accessibilityRole="button" accessibilityLabel={a11y}
          accessibilityState={{ selected }} accessibilityHint="Tocá para ver el detalle. Tocá otra vez para quitar la selección."
          onPress={() => inspection.onSelect(p.key)} style={[styles.slot, { minWidth: brandTokens.layout.minTouch, paddingHorizontal: spacing.xs }]}>{body}</Pressable>
        : p.onPress && p.value !== null
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
  value: { position: 'absolute', left: -24, right: -24, textAlign: 'center' },
  date: { alignSelf: 'center', textAlign: 'center' },
  band: { position: 'absolute', top: 2, left: 2, width: 120, zIndex: 1 },
  target: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', opacity: 0.6, zIndex: 1 },
});
