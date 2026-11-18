import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { MobileApiClient } from '@/api/client';
import { fetchOwnPerformance, type InsightsOwnView, type OwnFactor, type OwnSession } from '@/api/performance-insights';
import { AppText, spacing, useOwnlevelTheme } from '@/design-system';
import { useProgressResource } from '@/progress/use-progress-resource';
import { formatPct } from './comparison-change';
import { binLabel } from './own-model';

/** The same read for every screen of «lo tuyo»: one cache entry per routine (or all). */
export const ownKey = (routine: string | null) => `performance-insights|own|${routine ?? 'all'}`;
export function useOwnPerformance(client: MobileApiClient | null, routine: string | null, enabled = true) {
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchOwnPerformance(c, routine, signal), [routine]);
  return useProgressResource<InsightsOwnView>(enabled ? client : null, ownKey(routine), load);
}
export const ownSessionOf = (model: InsightsOwnView | undefined, sessionId: string): OwnSession | undefined => model?.sessions.find(row => row.sessionId === sessionId);

/** A factor's tramos in small: one bar per tramo from «lo tuyo» (0), a single series in the accent's soft tone. */
export function TramoBars({ factor }: { factor: OwnFactor }) {
  const { colors } = useOwnlevelTheme();
  const width = 112, height = 34, mid = height / 2, max = Math.max(1, ...factor.bins.map(bin => Math.abs(bin.mean ?? 0)));
  const slot = width / Math.max(1, factor.bins.length), bar = Math.min(26, slot - 8);
  return <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Line x1={0} y1={mid} x2={width} y2={mid} stroke={colors.border} strokeWidth={1} />
    {factor.bins.map((bin, index) => {
      const x = index * slot + (slot - bar) / 2;
      if (bin.mean === null) return <Rect key={index} x={x} y={mid - 7} width={bar} height={14} rx={3} fill="none" stroke={colors.textMuted} strokeOpacity={0.6} strokeDasharray="3 3" />;
      const h = Math.max(2, (Math.abs(bin.mean) / max) * (mid - 2));
      return <Rect key={index} x={x} y={bin.mean > 0 ? mid - h : mid} width={bar} height={h} rx={3} fill={colors.primary} fillOpacity={0.45} />;
    })}
  </Svg>;
}

/**
 * One factor's tramos in full: the mean of each tramo as a bar from «lo tuyo», every session behind it as a dot, and below each
 * tramo its limits and how many sessions. A tramo without its six sessions is a dashed slot, never a bar.
 */
export function TramoChart({ factor, sessions, label }: { factor: OwnFactor; sessions: readonly OwnSession[]; label: string }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(0);
  const height = 210, left = 40, top = 12, bottom = 150;
  const points = sessions.map((session, index) => ({ pct: session.pct, value: factor.values[index] ?? null })).filter((row): row is { pct: number; value: number } => row.pct !== null && row.value !== null);
  const inBin = (value: number, index: number) => {
    const bin = factor.bins[index]!;
    if (factor.kind === 'category') {
      if (factor.key === 'training_hour') return [value < 12, value >= 12 && value < 18, value >= 18][index] ?? false;
      return [value <= 2, value >= 3 && value <= 4, value >= 5][index] ?? false;
    }
    return (bin.from === null || value >= bin.from) && (bin.to === null || value < bin.to);
  };
  // The scale follows the tramos and nine in ten sessions: one far session sits at the edge instead of flattening the bars.
  const spread = points.map(point => Math.abs(point.pct)).sort((a, b) => a - b);
  const typical = spread.length ? spread[Math.min(spread.length - 1, Math.floor(spread.length * 0.9))]! : 0;
  const span = Math.max(3, Math.ceil(Math.max(typical, ...factor.bins.map(bin => Math.abs(bin.mean ?? 0) * 2))));
  const mid = (top + bottom) / 2, y = (pct: number) => mid - (Math.max(-span, Math.min(span, pct)) / span) * ((bottom - top) / 2);
  const slot = width ? (width - left) / factor.bins.length : 0;
  return <View accessible accessibilityRole="image" accessibilityLabel={label} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height }} testID="own-tramo-chart">
    {width ? <Svg width={width} height={height}>
      {[span, 0, -span].map(tick => <G key={tick}>
        <Line x1={left} y1={y(tick)} x2={width} y2={y(tick)} stroke={colors.border} strokeDasharray={tick === 0 ? '4 3' : '2 3'} strokeOpacity={tick === 0 ? 1 : 0.7} />
        <SvgText x={left - 4} y={y(tick) + 3} fontSize={10} fill={colors.textMuted} textAnchor="end">{tick === 0 ? 'lo tuyo' : formatPct(tick)}</SvgText>
      </G>)}
      {factor.bins.map((bin, index) => {
        const cx = left + slot * index + slot / 2, bar = Math.min(54, slot * 0.5);
        const dots = points.filter(point => inBin(point.value, index));
        return <G key={index}>
          {bin.mean === null ? <Rect x={cx - bar / 2} y={mid - 22} width={bar} height={44} rx={4} fill="none" stroke={colors.textMuted} strokeOpacity={0.6} strokeDasharray="3 3" />
            : <Rect x={cx - bar / 2} y={bin.mean > 0 ? y(bin.mean) : mid} width={bar} height={Math.max(2, Math.abs(y(bin.mean) - mid))} rx={4} fill={colors.primary} fillOpacity={0.45} />}
          {dots.map((point, j) => <Circle key={j} cx={cx - bar / 2 + 5 + ((j * 37) % Math.max(1, bar - 10))} cy={y(point.pct)} r={2.4} fill={colors.textMuted} fillOpacity={0.5} />)}
          {bin.mean !== null ? <SvgText x={cx} y={bin.mean > 0 ? y(bin.mean) - 6 : y(bin.mean) + 14} fontSize={12} fontWeight="700" fill={colors.text} textAnchor="middle">{formatPct(bin.mean)}</SvgText> : null}
          <SvgText x={cx} y={bottom + 22} fontSize={11} fill={colors.text} textAnchor="middle">{binLabel(factor, bin)}</SvgText>
          <SvgText x={cx} y={bottom + 37} fontSize={10} fill={colors.textMuted} textAnchor="middle">{`${bin.n} ${bin.n === 1 ? 'sesión' : 'sesiones'}`}</SvgText>
        </G>;
      })}
    </Svg> : null}
  </View>;
}

/** Twelve weeks over «lo tuyo»: the mean of each week's sessions; hollow with fewer than two, nothing without any. */
export function WeekBars({ weeks, label }: { weeks: InsightsOwnView['weeks']; label: string }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(0);
  const height = 140, mid = 66, span = Math.max(2, Math.ceil(Math.max(...weeks.map(week => Math.abs(week.mean ?? 0)))));
  const slot = width / Math.max(1, weeks.length), bar = Math.min(18, slot * 0.56), y = (value: number) => mid - (value / span) * (mid - 8);
  return <View accessible accessibilityRole="image" accessibilityLabel={label} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height }} testID="own-week-bars">
    {width ? <Svg width={width} height={height}>
      <Line x1={0} y1={mid} x2={width} y2={mid} stroke={colors.textMuted} strokeOpacity={0.5} strokeDasharray="3 3" />
      <SvgText x={width} y={mid + 13} fontSize={10} fill={colors.textMuted} textAnchor="end">lo tuyo</SvgText>
      {weeks.map((week, index) => {
        if (week.mean === null) return null;
        const x = index * slot + (slot - bar) / 2, h = Math.max(2, Math.abs(y(week.mean) - mid)), last = index === weeks.length - 1;
        return week.measured < 2 ? <Rect key={week.start} x={x + 0.75} y={(week.mean > 0 ? mid - h : mid) + 0.75} width={bar - 1.5} height={Math.max(1.5, h - 1.5)} rx={3} fill="none" stroke={colors.primary} strokeOpacity={0.6} strokeWidth={1.5} />
          : <Rect key={week.start} x={x} y={week.mean > 0 ? mid - h : mid} width={bar} height={h} rx={3} fill={colors.primary} fillOpacity={last ? 1 : 0.45} />;
      })}
    </Svg> : null}
    <View style={styles.ends}><AppText muted variant="caption" numeric>{shortWeek(weeks[0]?.start)}</AppText><AppText muted variant="caption" numeric>{shortWeek(weeks.at(-1)?.start)}</AppText></View>
  </View>;
}
const shortWeek = (date: string | undefined) => date ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '') : '';

/** «Cómo se calcula», the same four steps everywhere «lo tuyo» shows. */
export function OwnMethod({ tramos = false }: { tramos?: boolean }) {
  const { colors } = useOwnlevelTheme();
  const steps = [
    'De cada ejercicio tomamos tu mejor serie de la sesión.',
    'Peso y reps se convierten a un solo número (fuerza estimada), así 60 kg × 10 y 55 kg × 12 se pueden comparar. Sin peso, cuentan las reps.',
    'Lo tuyo es la serie del medio de las 5 veces anteriores de ese ejercicio. Hasta tener 3, el ejercicio no entra.',
    'La sesión es la mediana de sus ejercicios, con 2 o más. Un ejercicio raro no la mueve solo.',
    ...(tramos ? ['Cada dato se parte en tramos con tus propios valores. Un tramo necesita 6 sesiones, y «más» o «menos» aparece solo si la diferencia supera lo que tus sesiones varían normalmente.'] : []),
  ];
  return <View style={styles.method} testID="own-method">
    {steps.map((step, index) => <View key={index} style={styles.step}>
      <View style={[styles.stepNumber, { backgroundColor: colors.brandSubtle }]}><AppText variant="caption" numeric style={{ color: colors.primary }}>{index + 1}</AppText></View>
      <AppText style={styles.flex}>{step}</AppText>
    </View>)}
    <AppText muted variant="footnote">No cambia nada de lo que guardaste: es otra forma de leer tus series. Muestra qué coincidió, no por qué.</AppText>
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, flexShrink: 1 },
  ends: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' },
  method: { gap: spacing.md },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepNumber: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
