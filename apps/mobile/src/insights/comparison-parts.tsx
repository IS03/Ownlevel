import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { AppSheet, AppText, Heading, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { formatPct, type ArrivalFact } from './comparison-change';
import { LANE_TITLE, PARTIAL_LIMIT, type Lane } from './insights-model';

/**
 * #533 · The pieces Comparaciones shares between Días, Ejercicios and Relación. One series in the accent; the selected mark in the
 * full accent, the rest softer; no red or green on the user's data, and a gap stays a gap (IDENTIDAD.md § Gráficos).
 */

/** One session in the strip: its date, routine and measured change, or «—» when it has none. */
export type StripSession = { sessionId: string; date: string; label: string; routine: string; pct: number | null };
const shortDate = (date: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '');
export function SessionStrip({ sessions, selected, onSelect }: { sessions: readonly StripSession[]; selected: string | null; onSelect: (session: StripSession) => void }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  if (sessions.length < 2) return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} testID="comparisons-session-strip">
    {sessions.map(session => { const on = session.sessionId === selected; return <Pressable key={session.sessionId} accessibilityRole="button" accessibilityState={{ selected: on }}
      accessibilityLabel={`${session.routine}, ${shortDate(session.date)}: ${session.pct === null ? 'sin cambio medido' : formatPct(session.pct)}`}
      onPress={() => { haptics.selection(); onSelect(session); }} testID={`comparisons-strip-${session.sessionId}`}
      style={({ pressed }) => [styles.pill, { backgroundColor: on ? colors.brandSubtle : colors.surface }, pressedStyle(pressed, reduced)]}>
      <AppText variant="caption" numeric style={{ color: on ? colors.primary : colors.textMuted }}>{shortDate(session.date)}</AppText>
      <AppText variant="footnote" numberOfLines={1} style={{ color: on ? colors.primary : colors.text }}>{session.routine}</AppText>
      <AppText variant="headline" numeric style={{ color: on ? colors.primary : colors.text }}>{session.pct === null ? '—' : formatPct(session.pct)}</AppText>
    </Pressable>; })}
  </ScrollView>;
}

/** «Cómo llegaste»: a short grid. A missing fact reads «Sin registrar», never 0. With large text it becomes one column. */
export function ArrivalGrid({ facts }: { facts: readonly ArrivalFact[] }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale, width } = useWindowDimensions();
  const columns = fontScale > 1.3 ? 1 : width < 360 ? 2 : 3;
  return <View style={styles.block} testID="comparisons-arrival">
    <AppText variant="headline" accessibilityRole="header">Cómo llegaste</AppText>
    <View style={styles.grid}>
      {facts.map(fact => <View key={fact.key} accessible accessibilityLabel={fact.spoken} testID={`arrival-${fact.key}`}
        style={[styles.cell, { backgroundColor: colors.surface, width: `${100 / columns - (columns > 1 ? 2 : 0)}%` }]}>
        <AppText muted variant="caption">{fact.label}</AppText>
        <AppText variant={fact.value ? 'headline' : 'footnote'} numeric muted={!fact.value}>{fact.value ?? 'Sin registrar'}</AppText>
      </View>)}
    </View>
  </View>;
}

/**
 * The method's words, once per screen. The line says which comparison it is; the sheet holds what used to be repeated as
 * paragraphs. Nothing is hidden: it is one tap away and read by VoiceOver from the line itself.
 */
const STRICT_TEXT = 'Comparamos cada ejercicio con su vez anterior en la misma variante: mismo modo, unidad, implemento y configuración. Tomamos la mejor serie con cada peso que aparece en las dos sesiones. Si subiste de peso con las mismas repeticiones, lo mostramos como «↑ Peso» y no entra en el porcentaje.';
export function MethodLine({ lanes, testID = 'comparisons-method' }: { lanes: readonly Lane[]; testID?: string }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const [open, setOpen] = useState(false);
  const partial = lanes.includes('partial');
  const line = partial ? 'Contexto parcial. No sabemos si cambiaste agarre o banco.' : 'Misma variante y mejor serie con cada peso.';
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${line} Cómo comparamos`} onPress={() => { haptics.selection(); setOpen(true); }} testID={testID}
      style={({ pressed }) => [styles.method, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
      <AppText muted variant="footnote" style={styles.flex}>{line}</AppText>
      <AppText variant="footnote" style={{ color: colors.primary }}>Cómo comparamos</AppText>
    </Pressable>
    {open ? <AppSheet onClose={() => setOpen(false)} closeLabel="Cerrar" testID="comparisons-method-sheet" style={{ backgroundColor: colors.background }}>
      <View style={styles.sheet}>
        <Heading level={2}>Cómo comparamos</Heading>
        <AppText variant="headline">{LANE_TITLE.strict}</AppText>
        <AppText muted>{STRICT_TEXT}</AppText>
        <AppText variant="headline">{LANE_TITLE.partial}</AppText>
        <AppText muted testID="insights-partial-limit-sheet">{PARTIAL_LIMIT}</AppText>
        <AppText muted variant="footnote">El porcentaje de la sesión es el promedio de sus ejercicios comparados. Muestra lo que registraste, no por qué pasó.</AppText>
      </View>
    </AppSheet> : null}
  </>;
}

/** A small line of an exercise's recent changes, around zero. Fewer than two points draws nothing. */
export function Sparkline({ points, width = 72, height = 26 }: { points: readonly number[]; width?: number; height?: number }) {
  const { colors } = useOwnlevelTheme();
  if (points.length < 2) return <View style={{ width, height }} />;
  const max = Math.max(1, ...points.map(Math.abs)), step = (width - 6) / (points.length - 1), y = (value: number) => height / 2 - (value / max) * (height / 2 - 3);
  return <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={colors.border} strokeWidth={1} />
    {points.slice(1).map((value, index) => <Line key={index} x1={3 + index * step} y1={y(points[index]!)} x2={3 + (index + 1) * step} y2={y(value)} stroke={colors.primary} strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />)}
    <Circle cx={3 + (points.length - 1) * step} cy={y(points.at(-1)!)} r={3} fill={colors.primary} />
  </Svg>;
}

/** One bar per session, up or down from zero. A session without a measured change is a dashed slot, never a zero bar. */
export function ChangeBars({ values, selected, label }: { values: readonly (number | null)[]; selected?: number; label: string }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(0);
  const height = 96, mid = height / 2, max = Math.max(1, ...values.map(value => Math.abs(value ?? 0)));
  const slot = values.length ? width / values.length : 0, bar = Math.max(4, Math.min(18, slot - 6));
  return <View accessible accessibilityRole="image" accessibilityLabel={label} onLayout={event => setWidth(event.nativeEvent.layout.width)} testID="comparisons-change-bars" style={{ height }}>
    {width ? <Svg width={width} height={height}>
      <Line x1={0} y1={mid} x2={width} y2={mid} stroke={colors.border} strokeWidth={1} />
      {values.map((value, index) => {
        const x = index * slot + (slot - bar) / 2, on = index === selected;
        if (value === null) return <Rect key={index} x={x} y={mid - 8} width={bar} height={16} rx={3} fill="none" stroke={colors.textMuted} strokeDasharray="3 3" />;
        if (value === 0) return <Rect key={index} x={x} y={mid - 1.5} width={bar} height={3} rx={1.5} fill={colors.textMuted} />;
        const h = Math.max(3, (Math.abs(value) / max) * (mid - 4));
        return <Rect key={index} x={x} y={value > 0 ? mid - h : mid} width={bar} height={h} rx={3} fill={colors.primary} fillOpacity={on ? 1 : 0.45} />;
      })}
    </Svg> : null}
  </View>;
}

/** Two medians on one scale: the sessions that went up (filled) and down (hollow). A side with fewer than three values is absent. */
export function MedianPair({ up, down, min, max }: { up: number | null; down: number | null; min: number; max: number }) {
  const { colors } = useOwnlevelTheme();
  const width = 84, span = max - min || 1, x = (value: number) => 6 + ((value - min) / span) * (width - 12);
  return <Svg width={width} height={16} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Line x1={4} y1={8} x2={width - 4} y2={8} stroke={colors.border} strokeWidth={2} strokeLinecap="round" />
    {up !== null && down !== null ? <Line x1={x(Math.min(up, down))} y1={8} x2={x(Math.max(up, down))} y2={8} stroke={colors.primary} strokeOpacity={0.4} strokeWidth={2} /> : null}
    {down !== null ? <Circle cx={x(down)} cy={8} r={4} fill={colors.background} stroke={colors.textMuted} strokeWidth={2} /> : null}
    {up !== null ? <Circle cx={x(up)} cy={8} r={5} fill={colors.primary} /> : null}
  </Svg>;
}

/** One point per session: the factor's value across, the session's change up. The selected point is ringed. */
export function FactorScatter({ points, selected, label, onSelect }: { points: readonly { x: number; y: number; group: 'up' | 'same' | 'down' | 'other' }[]; selected?: number; label: string; onSelect?: (index: number) => void }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(0);
  const height = 180, pad = 12;
  const xs = points.map(point => point.x), ys = points.map(point => Math.abs(point.y));
  const minX = Math.min(...xs), maxX = Math.max(...xs), spanX = maxX - minX || 1, maxY = Math.max(1, ...ys);
  const px = (value: number) => pad + ((value - minX) / spanX) * (width - pad * 2), py = (value: number) => height / 2 - (value / maxY) * (height / 2 - pad);
  return <View accessible accessibilityRole="image" accessibilityLabel={label} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height }} testID="comparisons-factor-scatter">
    {width && points.length ? <Svg width={width} height={height}>
      <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={colors.border} strokeWidth={1} />
      {points.map((point, index) => <Circle key={index} cx={px(point.x)} cy={py(point.y)} r={5} onPress={onSelect ? () => onSelect(index) : undefined}
        fill={point.group === 'down' ? colors.background : point.group === 'up' ? colors.primary : colors.textMuted}
        stroke={point.group === 'down' ? colors.textMuted : 'none'} strokeWidth={2} />)}
      {selected !== undefined && points[selected] ? <Circle cx={px(points[selected]!.x)} cy={py(points[selected]!.y)} r={9} fill="none" stroke={colors.text} strokeWidth={1.5} /> : null}
    </Svg> : null}
  </View>;
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  flex: { flex: 1, flexShrink: 1 },
  strip: { gap: spacing.sm, paddingVertical: spacing.xs },
  pill: { minWidth: 76, minHeight: 44, borderRadius: brandTokens.radius.inner, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  cell: { minHeight: 56, borderRadius: brandTokens.radius.inner, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  method: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  sheet: { gap: spacing.md, padding: brandTokens.layout.screenPadding, paddingBottom: spacing.xxl },
});
