import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { DayFact, InsightsSummary, PerformanceChange, SessionFact, SessionTemporalDay } from '@/api/performance-insights';
import { AppText, spacing, useOwnlevelTheme } from '@/design-system';
import { feelingTransition, type FeelingSide } from '@/training/feeling-transition';
import { arrivalFacts, foodFacts } from './comparison-change';
import { ArrivalGrid, ArrivalTimeline, Kicker, type RowChange, type TimelineMeal } from './comparison-parts';
import { InsightRow } from './insight-row';
import { statusArrow, statusText, type Lane } from './insights-model';

/**
 * «Comparaciones más claras» (bocetos/comparaciones-claras). What the session screen draws from data it already has: the change of
 * each exercise as a mark, and «Cómo llegaste» as a line from the night to the session. Nothing here is computed anew: the
 * percentages are the server's, the meals are the temporal view's, and a missing value stays missing.
 */
const STABLE = new Set(['observed_stable', 'same_record']);
export function rowChangeOf(change: PerformanceChange | undefined, lane: Lane, status: string): RowChange {
  if (change?.state === 'measured' && change.pct !== null) return { kind: 'pct', pct: change.pct };
  if (change?.state === 'no_amount_signal' && change.load?.unit === 'kg' && !!change.load.up !== !!change.load.down) return { kind: 'load', up: !!change.load.up };
  if (STABLE.has(status)) return { kind: 'same' };
  const arrow = statusArrow(status);
  return { kind: 'none', text: arrow ? `${arrow} ${statusText(lane, status)}` : 'Sin comparar' };
}

type TemporalSession = SessionTemporalDay['sessions'][number];
/** The meals of the twelve hours before: placed only with a checked time; the rest only counted. */
export function arrivalTimelineOf(temporal: TemporalSession | undefined) {
  const rows = temporal?.before.evidence?.rows ?? [];
  const meals: TimelineMeal[] = [];
  let uncertain = 0;
  for (const row of rows) {
    const at = row.at ? Date.parse(row.at) : NaN;
    if (row.timeEvidence === 'explicit' && Number.isFinite(at)) meals.push({ at, calories: row.calories });
    else uncertain += 1;
  }
  return { meals, uncertain };
}

const side = (feeling: SessionFact['context']['feelings'][keyof SessionFact['context']['feelings']]): FeelingSide => feeling ? { value: feeling.value } : 'missing';

/** The detail behind the line: the same line larger, the six facts, how the session ended and the whole day's food. */
export function ArrivalSheetContent({ session, day, metrics, name, start, temporal, sleep, fallback, children }: {
  session: SessionFact; day: DayFact; metrics: InsightsSummary['metrics']; name: string; start: number | null; temporal: TemporalSession | undefined; sleep: string | null;
  /** The line drawn from what the screen already had, while the meals of the window are read (or when they cannot be). */
  fallback: { meals: TimelineMeal[]; uncertain: number | 'some' }; children?: React.ReactNode;
}) {
  const { colors } = useOwnlevelTheme();
  const { meals, uncertain } = temporal ? arrivalTimelineOf(temporal) : fallback;
  const feelings = session.context.feelings;
  const after = (['energy', 'fatigue'] as const).filter(kind => feelings[`${kind}Pre`] || feelings[`${kind}Post`])
    .map(kind => feelingTransition(kind, side(feelings[`${kind}Pre`]), side(feelings[`${kind}Post`])));
  return <View style={styles.sheet} testID="comparisons-arrival-sheet">
    <Kicker>{`Antes de ${name}${start !== null ? ` · ${new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Cordoba' }).format(new Date(start))}` : ''}`}</Kicker>
    {start !== null ? <ArrivalTimeline big start={start} meals={meals} uncertain={uncertain} sleep={sleep} label={timelineLabel(meals.length, uncertain, sleep)} /> : null}
    <ArrivalGrid title={false} facts={arrivalFacts(session, day, metrics)} />
    {after.length ? <View style={styles.block} testID="comparisons-arrival-after">
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      <Kicker>Al terminar</Kicker>
      {after.map(row => <AppText key={row.label} accessibilityLabel={row.spoken}>{row.label} <AppText variant="headline">{row.value}</AppText></AppText>)}
    </View> : null}
    <View style={[styles.rule, { backgroundColor: colors.border }]} />
    <FoodBlock session={session} day={day} />
    {children}
  </View>;
}
/** «Comida»: 3 h antes, ayer and that day, each with its own day's target. Missing is «—», never 0. */
export function FoodBlock({ session, day }: { session: SessionFact; day: DayFact }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  return <View style={styles.block} testID="comparisons-food">
    <Kicker>Comida</Kicker>
    <View style={[styles.totals, fontScale > 1.3 && styles.stacked]}>
      {foodFacts(session, day).map(fact => <View key={fact.key} style={styles.total} accessible accessibilityLabel={fact.spoken} testID={`food-${fact.key}`}>
        <AppText muted variant="caption">{fact.label}</AppText>
        <AppText variant="headline" numeric style={!fact.value && { color: colors.textMuted }}>{fact.value ?? '—'}</AppText>
        {fact.caption ? <AppText muted variant="caption" numeric>{fact.caption}</AppText> : null}
      </View>)}
    </View>
  </View>;
}

export function timelineLabel(meals: number, uncertain: number | 'some', sleep: string | null, last?: string | null) {
  const food = last !== undefined ? (last ? `última comida con hora ${last} antes` : 'sin comidas con hora') : meals === 1 ? 'una comida con hora' : `${meals} comidas con hora`;
  return `Las 12 horas antes de entrenar: ${sleep ? `dormiste ${sleep}` : 'sueño sin registrar'}, ${food}${uncertain === 'some' ? ', y hay comidas sin hora comprobada' : uncertain ? ` y ${uncertain} sin hora comprobada` : ''}`;
}

export const ArrivalLinks = ({ links }: { links: readonly { label: string; spoken: string; onPress: () => void }[] }) =>
  <View>{links.map(link => <InsightRow key={link.label} label={link.label} spoken={link.spoken} onPress={link.onPress} />)}</View>;

const styles = StyleSheet.create({
  sheet: { gap: spacing.lg },
  block: { gap: spacing.sm },
  rule: { height: StyleSheet.hairlineWidth },
  totals: { flexDirection: 'row', gap: spacing.md },
  stacked: { flexDirection: 'column' },
  total: { flex: 1, gap: 1 },
});
