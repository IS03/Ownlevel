import { ChartBar, ChartSelectionRule } from '@/progress/chart-marks';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { AppIcon, AppSheet, AppText, Heading, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { formatPct, type ArrivalFact } from './comparison-change';
import { LANE_TITLE, PARTIAL_LIMIT, type Lane } from './insights-model';

/**
 * #533 · The pieces Comparaciones shares between Días, Ejercicios and Relación. One series in the accent; the selected mark in the
 * full accent, the rest softer; no red or green on the user's data, and a gap stays a gap (IDENTIDAD.md § Gráficos).
 */

/** One session in the strip: its date, routine and measured change, or «—» when it has none. */
export type StripSession = { sessionId: string; date: string; label: string; routine: string; pct: number | null };
export const shortDate = (date: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '');
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

/**
 * Días más claros · One bar per session, oldest on the left: up when the session went up, down when it went down, a dashed slot
 * when it has no measured change (never a zero bar). Tapping a bar chooses that session. Earlier sessions are read on a tap of
 * «Anteriores», never on scroll (each page is a whole read on the server).
 */
const BAR_W = 18, BAR_GAP = 6, CHART_H = 112, CHART_MID = 52;
export function SessionChart({ sessions, selected, onSelect, onEarlier, loadingEarlier = false }: {
  sessions: readonly StripSession[]; selected: string | null; onSelect: (session: StripSession) => void; onEarlier?: () => void; loadingEarlier?: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const ref = useRef<ScrollView>(null);
  const ordered = [...sessions].reverse();
  const max = Math.max(3, ...ordered.map(row => Math.abs(row.pct ?? 0)));
  const scale = (CHART_MID - 6) / max;
  if (!ordered.length) return null;
  return <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
    contentContainerStyle={styles.chartRow} testID="comparisons-session-strip">
    {onEarlier ? <Pressable accessibilityRole="button" accessibilityLabel="Ver sesiones anteriores" disabled={loadingEarlier} onPress={() => { haptics.selection(); onEarlier(); }} testID="comparisons-earlier"
      style={({ pressed }) => [styles.earlier, pressedStyle(pressed, reduced)]}>
      <AppIcon name="chevronLeft" size={15} color={colors.textMuted} />
      <AppText muted variant="caption">{loadingEarlier ? 'Cargando' : 'Anteriores'}</AppText>
    </Pressable> : null}
    {ordered.map((session, index) => {
      const on = session.sessionId === selected, pct = session.pct;
      const height = pct === null || pct === 0 ? 0 : Math.max(4, Math.abs(pct) * scale);
      const label = on || index === 0 || index === ordered.length - 1 || (ordered.length - 1 - index) % 4 === 0;
      return <Pressable key={session.sessionId} accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={`${session.routine}, ${shortDate(session.date)}: ${pct === null ? 'sin cambio medido' : formatPct(pct)}`}
        onPress={() => { haptics.selection(); onSelect(session); }} testID={`comparisons-strip-${session.sessionId}`}
        style={({ pressed }) => [styles.barSlot, pressedStyle(pressed, reduced)]}>
        <View style={styles.barArea}>
          <ChartSelectionRule selected={on} />
          <View style={[styles.zero, { backgroundColor: colors.border }]} />
          {pct === null ? <View style={[styles.bar, styles.none, { top: CHART_MID - 8, height: 16, borderColor: colors.textMuted }]} />
            : pct === 0 ? <View style={[styles.bar, { top: CHART_MID - 1.5, height: 3, backgroundColor: colors.textMuted }]} />
            : <ChartBar height={height} negative={pct < 0} style={[styles.bar, { top: pct > 0 ? CHART_MID - height : CHART_MID, opacity: on ? 1 : 0.4 }]} />}
        </View>
        <View style={[styles.dateTag, on && { backgroundColor: colors.brandSubtle }]}>
          <AppText variant="caption" numeric numberOfLines={1} style={{ color: on ? colors.primary : colors.textMuted, fontWeight: on ? '700' : '400' }}>{label ? shortDay(session.date) : ' '}</AppText>
        </View>
      </Pressable>;
    })}
  </ScrollView>;
}
const shortDay = shortDate;

/**
 * «Cómo llegaste»: numbers straight on the background, each with its small label. A missing fact is a grey «—» (VoiceOver says
 * «sin registrar»), never 0. With large text it becomes one column.
 */
export function ArrivalGrid({ facts, title = true }: { facts: readonly ArrivalFact[]; title?: boolean }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale, width } = useWindowDimensions();
  const columns = fontScale > 1.3 ? 1 : width < 360 ? 2 : 3;
  return <View style={styles.block} testID="comparisons-arrival">
    {title ? <Kicker>Cómo llegaste</Kicker> : null}
    <View style={styles.grid}>
      {facts.map(fact => <View key={fact.key} accessible accessibilityLabel={fact.spoken} testID={`arrival-${fact.key}`} style={[styles.cell, { width: `${100 / columns}%` }]}>
        <AppText variant="headline" numeric style={!fact.value && { color: colors.textMuted }}>{fact.value ?? '—'}</AppText>
        <AppText muted variant="caption">{fact.label}</AppText>
      </View>)}
    </View>
  </View>;
}

/** A small uppercase label over a block, as in the sketch: it names the block without a card around it. */
export function Kicker({ children }: { children: string }) {
  return <AppText muted variant="caption" accessibilityRole="header" style={styles.kicker}>{children}</AppText>;
}

/** The three directions in words, one line: «1 subió · 9 igual · 1 bajó». No «registro superior», no lane names. */
export function ChangeTally({ up, same, down, testID }: { up: number; same: number; down: number; testID?: string }) {
  const parts = [[up, up === 1 ? 'subió' : 'subieron'], [same, 'igual'], [down, down === 1 ? 'bajó' : 'bajaron']] as const;
  return <View style={styles.tally} accessible accessibilityLabel={parts.map(([n, word]) => `${n} ${word}`).join(', ')} testID={testID}>
    {parts.map(([n, word]) => <View key={word} style={styles.tallyCell}>
      <AppText variant="title2" numeric>{String(n)}</AppText>
      <AppText muted variant="footnote">{word}</AppText>
    </View>)}
  </View>;
}

/** What an exercise row draws on its right: a bar that grows right (up) or left (down) from the middle, a load step, or «igual». */
export type RowChange = { kind: 'pct'; pct: number } | { kind: 'load'; up: boolean } | { kind: 'same' } | { kind: 'none'; text: string };
const BAR_MAX = 25;
function DivergingMark({ change }: { change: RowChange }) {
  const { colors } = useOwnlevelTheme();
  const width = 96, mid = width / 2;
  if (change.kind === 'none') return <View style={[styles.mark, { width }]}><AppText muted variant="caption" numberOfLines={2} style={styles.markText}>{change.text}</AppText></View>;
  return <Svg width={width} height={22} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Line x1={mid} y1={0} x2={mid} y2={22} stroke={colors.border} strokeWidth={1} />
    {change.kind === 'same' || (change.kind === 'pct' && change.pct === 0) ? <Circle cx={mid} cy={11} r={4} fill="none" stroke={colors.textMuted} strokeWidth={1.5} /> : null}
    {change.kind === 'load' ? <SvgText x={change.up ? mid + 6 : mid - 6} y={15} fontSize={11} fontWeight="600" fill={colors.primary} textAnchor={change.up ? 'start' : 'end'}>{change.up ? '↑ peso' : '↓ peso'}</SvgText> : null}
    {change.kind === 'pct' && change.pct !== 0 ? (() => {
      const length = Math.max(4, (Math.min(BAR_MAX, Math.abs(change.pct)) / BAR_MAX) * (mid - 4)), up = change.pct > 0;
      const label = `${up ? '+' : '−'}${Math.round(Math.abs(change.pct)) || '<1'}`;
      return <>
        <Rect x={up ? mid : mid - length} y={8} width={length} height={6} rx={3} fill={colors.primary} fillOpacity={up ? 1 : 0.45} />
        <SvgText x={up ? width : 0} y={7} fontSize={11} fontWeight="600" fill={up ? colors.text : colors.textMuted} textAnchor={up ? 'end' : 'start'}>{label}</SvgText>
      </>;
    })() : null}
  </Svg>;
}
/** One exercise of the session: its name and what was recorded, and the change drawn on the right. The whole row opens its sets. */
export function DivergingRow({ name, detail, change, spoken, onPress }: { name: string; detail?: string | null; change: RowChange; spoken: string; onPress: () => void }) {
  const reduced = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  return <Pressable accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress}
    style={({ pressed }) => [styles.exRow, fontScale > 1.3 && styles.exRowStacked, pressedStyle(pressed, reduced)]}>
    <View style={styles.flex}>
      <AppText variant="subheadline" style={styles.exName} numberOfLines={fontScale > 1.3 ? undefined : 1}>{name}</AppText>
      {detail ? <AppText muted variant="caption" numeric>{detail}</AppText> : null}
    </View>
    <DivergingMark change={change} />
  </Pressable>;
}

/** A meal placed on the timeline: only with a time that can be checked. Its size is how much was eaten, when that is known. */
export type TimelineMeal = { at: number; calories: number | null };
const clock = (ms: number) => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Cordoba' }).format(new Date(ms));
const ago = (hours: number) => { const whole = Math.floor(hours), minutes = Math.round((hours - whole) * 60); return minutes === 60 ? `−${whole + 1} h` : minutes ? `−${whole} h ${String(minutes).padStart(2, '0')}` : `−${whole} h`; };
/**
 * From twelve hours before the session to its start, in one line: the meals with a checked time (bigger dot, more kcal) and the
 * session at the end. Sleep has no clock in the records, so it is named at the start of the line, never placed at an hour.
 * Meals without a checked time are counted, never drawn somewhere.
 */
export function ArrivalTimeline({ start, meals, uncertain, sleep, big = false, onPress, label }: { start: number; meals: readonly TimelineMeal[]; uncertain: number | 'some'; sleep: string | null; big?: boolean; onPress?: () => void; label: string }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const [width, setWidth] = useState(0);
  const span = 12 * 3_600_000, from = start - span, height = big ? 96 : 76, axis = height / 2 + 4, gym = 18;
  const x = (at: number) => ((at - from) / span) * (width - gym - 4);
  const known = meals.filter(meal => meal.at >= from && meal.at <= start);
  const last = known.reduce<TimelineMeal | null>((latest, meal) => (!latest || meal.at > latest.at ? meal : latest), null);
  const radius = (kcal: number | null) => kcal === null ? 4 : Math.max(4, Math.min(9, Math.sqrt(kcal) / 3));
  const body = <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height }}>
    {width ? <Svg width={width} height={height}>
      <SvgText x={0} y={12} fontSize={10} fill={colors.textMuted}>{sleep ? `Noche · ${sleep}` : 'Noche · sin registrar'}</SvgText>
      {big ? [0, 4, 8].map(h => <SvgText key={h} x={x(from + h * 3_600_000)} y={height - 4} fontSize={10} fill={colors.textMuted} textAnchor={h ? 'middle' : 'start'}>{clock(from + h * 3_600_000)}</SvgText>) : null}
      <Line x1={0} y1={axis} x2={width - gym} y2={axis} stroke={colors.border} strokeWidth={1} />
      {known.map((meal, index) => <Circle key={index} cx={x(meal.at)} cy={axis} r={radius(meal.calories)} fill={colors.primary} fillOpacity={meal === last ? 1 : 0.6} />)}
      {last ? <SvgText x={Math.min(x(last.at), width - gym - 30)} y={axis + 22} fontSize={10} fill={colors.textMuted} textAnchor="middle">{ago((start - last.at) / 3_600_000)}</SvgText> : null}
      <Rect x={width - gym} y={axis - 16} width={gym} height={32} rx={6} fill={colors.text} />
      <SvgText x={width} y={12} fontSize={10} fill={colors.textMuted} textAnchor="end">{clock(start)}</SvgText>
      {uncertain ? <SvgText x={0} y={axis + 22} fontSize={10} fill={colors.textMuted}>{uncertain === 'some' ? 'Hay comidas sin hora' : `${uncertain} ${uncertain === 1 ? 'comida' : 'comidas'} sin hora`}</SvgText> : null}
    </Svg> : null}
  </View>;
  if (!onPress) return <View accessible accessibilityRole="image" accessibilityLabel={label} testID="comparisons-timeline">{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Ver cómo llegaste`} onPress={() => { haptics.selection(); onPress(); }} testID="comparisons-timeline"
    style={({ pressed }) => pressedStyle(pressed, reduced)}>{body}</Pressable>;
}

/**
 * The method's words, once per screen. The line says which comparison it is; the sheet holds what used to be repeated as
 * paragraphs. Nothing is hidden: it is one tap away and read by VoiceOver from the line itself.
 */
const STRICT_TEXT = 'Comparamos cada ejercicio con su vez anterior en la misma variante: mismo modo, unidad, implemento y configuración. Tomamos la mejor serie con cada peso que aparece en las dos sesiones. Si subiste de peso con las mismas repeticiones, lo mostramos como «↑ Peso» y no entra en el porcentaje.';
export function MethodLine({ lanes, testID = 'comparisons-method', lead, leadLabel, leadTestID }: { lanes: readonly Lane[]; testID?: string; lead?: string; leadLabel?: string; leadTestID?: string }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const [open, setOpen] = useState(false);
  const partial = lanes.includes('partial');
  const line = partial ? lanes.includes('strict') ? 'Contexto completo y parcial' : 'Contexto parcial · variante sin registrar' : 'Contexto completo · misma variante';
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${lead ? `${leadLabel ?? lead}. ` : ''}${line}. ${partial ? 'No sabemos si cambiaste agarre o banco. ' : ''}Cómo comparamos`} onPress={() => { haptics.selection(); setOpen(true); }} testID={testID}
      style={({ pressed }) => [styles.method, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
      <View style={styles.flex}>
        {lead ? <AppText muted variant="footnote" numeric testID={leadTestID}>{lead}</AppText> : null}
        <AppText muted variant="caption" testID={`${testID}-context`}>{line}</AppText>
      </View>
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

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  flex: { flex: 1, flexShrink: 1 },
  strip: { gap: spacing.sm, paddingVertical: spacing.xs },
  chartRow: { flexDirection: 'row', alignItems: 'flex-start', gap: BAR_GAP, paddingVertical: spacing.xs, paddingRight: spacing.md },
  barSlot: { width: BAR_W + 22, alignItems: 'center', gap: 4 },
  barArea: { width: BAR_W, height: CHART_H - 20 },
  zero: { position: 'absolute', left: -BAR_GAP, right: -BAR_GAP - 16, top: CHART_MID, height: 1 },
  bar: { position: 'absolute', left: 0, width: BAR_W, borderRadius: 4 },
  none: { borderWidth: 1, borderStyle: 'dashed', backgroundColor: 'transparent' },
  dateTag: { borderRadius: 8, paddingHorizontal: 2, width: BAR_W + 40, alignItems: 'center' },
  earlier: { height: CHART_H - 20, justifyContent: 'center', alignItems: 'center', gap: 2, paddingRight: spacing.xs },
  pill: { minWidth: 76, minHeight: 44, borderRadius: brandTokens.radius.inner, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  cell: { gap: 1, paddingRight: spacing.sm },
  kicker: { letterSpacing: 0.8, fontWeight: '600', textTransform: 'uppercase' },
  tally: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs },
  tallyCell: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  exRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  exRowStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  exName: { fontWeight: '600' },
  mark: { justifyContent: 'center' },
  markText: { textAlign: 'right' },
  method: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  sheet: { gap: spacing.md, padding: brandTokens.layout.screenPadding, paddingBottom: spacing.xxl },
});

/**
 * The sets of the two sessions as slopes: the previous time on the left, this time on the right, one line per set in its order.
 * The line tilts by the change of reps at the same load; the set the comparison rests on is thicker and in the accent.
 */
export function SetSlopes({ pairs, before, now, label }: { pairs: readonly { key: string; number: number; before: string; now: string; used: boolean; change: number | null }[]; before: string; now: string; label: string }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(0);
  const row = 40, top = 26, height = top + pairs.length * row, left = 72, right = Math.max(left + 40, width - 88);
  const tilt = (change: number | null) => change === null ? 0 : Math.max(-14, Math.min(14, -change * 7));
  return <View accessible accessibilityRole="image" accessibilityLabel={label} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height }} testID="evidence-slopes">
    {width ? <Svg width={width} height={height}>
      <SvgText x={left} y={12} fontSize={11} fill={colors.textMuted} textAnchor="middle">{before}</SvgText>
      <SvgText x={right} y={12} fontSize={11} fill={colors.textMuted} textAnchor="middle">{now}</SvgText>
      <Line x1={left} y1={top - 4} x2={left} y2={height} stroke={colors.border} />
      <Line x1={right} y1={top - 4} x2={right} y2={height} stroke={colors.border} />
      {pairs.map((pair, index) => {
        const y = top + index * row + row / 2, end = y + tilt(pair.change);
        return <G key={pair.key}>
          <Line x1={left} y1={y} x2={right} y2={end} stroke={colors.primary} strokeOpacity={pair.used ? 1 : 0.45} strokeWidth={pair.used ? 3 : 2} strokeLinecap="round" />
          <SvgText x={left - 8} y={y + 4} fontSize={12} fill={colors.text} textAnchor="end">{pair.before}</SvgText>
          <SvgText x={right + 8} y={end + 4} fontSize={12} fill={colors.text}>{pair.change ? `${pair.now} · ${pair.change > 0 ? '+' : '−'}${Math.abs(pair.change)}` : pair.now}</SvgText>
          <SvgText x={(left + right) / 2} y={Math.min(y, end) - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle">{`serie ${pair.number}${pair.used ? ' · cuenta' : ''}`}</SvgText>
        </G>;
      })}
    </Svg> : null}
  </View>;
}
