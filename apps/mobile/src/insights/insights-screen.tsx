import { ReturnToProgress } from './return-to-progress';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsDays, fetchInsightsRelations, fetchInsightsSummaryBefore, fetchSessionTemporal, type DayFact, type InsightsSummary, type PartialDayFact, type PartialRelationSummary, type RelationSummary, type SessionFact } from '@/api/performance-insights';
import { LinkRow, AppIcon, AppSheet, AppText, Button, ChipGroup, ExampleFrame, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import type { AppIconName } from '@/design-system/icon-names';
import { haptics } from '@/platform/haptics';
import { useProgressResource } from '@/progress/use-progress-resource';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { EXPLAIN_DOWN, FAMILY_OPTIONS, LANE_TITLE, NUTRITION_SCOPE, contextRows, feelingRows, outsideText, preStartNote, preStartRows, withoutComparison, type Counts, dayLabel, dayLanes, daySessions, referenceText, sessionLanes, feelingClockNote, nutritionRows, sessionName, sessionTime, exerciseSentence, focusOf, heroCaption, heroOf, joinDays, nextDate, nothingComparable, readingRows, reasonDetail, reasonText, relationGroups, relationName, relationState, sameRead, statusArrow, statusText, type ContextRow, type DayLanes, type FamilyFilter, type Lane } from './insights-model';
import { InsightRow } from './insight-row';
import { arrivalFacts, exerciseChangeValue, formatPct, joinedChange, sessionHero, shownText } from './comparison-change';
import { ArrivalLinks, ArrivalSheetContent, FoodBlock, rowChangeOf, timelineLabel } from './comparison-arrival';
import { ExerciseEntry, GroupTitle, Legend, OrderMenu, SingleGroup, groupsOf, type ListEntry } from './exercise-list';
import { ArrivalGrid, ArrivalTimeline, ChangeTally, DivergingRow, Kicker, MethodLine, SessionChart, type StripSession } from './comparison-parts';
import { OwnTramosView } from './own-tramos-view';
import { ownSessionOf, useOwnPerformance } from './own-parts';
import { exerciseLine, ownSpoken } from './own-model';
import { usePeriodReturn } from './use-period-return';
import { withProgressOrigin,progressOriginParams,dayWeightHref, explorationHref, insightsEvidenceHref, insightsOriginOf, metricTrendHref, nutritionDayHref, validSession, type InsightsOrigin } from './navigation';
import { useInsightsRouter } from './insights-router';

type View_ = 'days' | 'exercises' | 'relation';
const VIEWS = [{ value: 'days', label: 'Sesiones' }, { value: 'exercises', label: 'Ejercicios' }, { value: 'relation', label: 'Cómo llegaste' }] as const;
const loadRelations = (client: MobileApiClient, signal: AbortSignal) => fetchInsightsRelations(client, signal);

/** Label and value on one line; with large text they stack and wrap instead of squeezing (IDENTIDAD.md § Dynamic Type). */
export function FactRow({ label, value, spoken, arrow, detail }: { label: string; value: string | number; spoken?: string; arrow?: string; detail?: string }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  return <View accessible accessibilityLabel={spoken ?? `${label}: ${value}${detail ? `. ${detail}` : ''}`} style={[styles.fact, stacked && styles.factStacked, { borderColor: colors.border }]}>
    <View style={!stacked ? styles.flex : undefined}>
      <AppText>{arrow ? `${arrow}  ` : ''}{label}</AppText>
      {detail ? <AppText muted variant="footnote">{detail}</AppText> : null}
    </View>
    <AppText muted numeric style={!stacked ? styles.factValue : undefined}>{value}</AppText>
  </View>;
}
/** Recorded context. A metric opens its own trends, on the month of that day. */
function ContextList({ rows, date, onMetric, onBody }: { rows: readonly ContextRow[]; date?: string; onMetric?: (metricId: string, date: string) => void; onBody?: (date: string) => void }) {
  return <>{rows.map(row => row.metricId && date && onMetric
    ? <InsightRow key={row.key} label={row.label} value={row.value} spoken={`${row.label}: ${row.value}. Ver tendencias`} onPress={() => onMetric(row.metricId!, date)} />
    : row.body && date && onBody ? <InsightRow key={row.key} label={row.label} value={row.value} spoken={`${row.label}: ${row.value}. Ver en Cuerpo`} onPress={() => onBody(date)} />
    : <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} spoken={row.spoken} />)}</>;
}
const Section = ({ title }: { title: string }) => <AppText muted variant="footnote" style={styles.section} accessibilityRole="header">{title}</AppText>;

type DayActions = { onMetric: (metricId: string, date: string) => void; onNutrition: (date: string) => void; onBody: (date: string) => void };
/** What belongs to the whole day, shown once: never repeated under each session as if each had its own. */
function DayShared({ day, metrics, onMetric, onNutrition, onBody }: { day: DayLanes; metrics: InsightsSummary['metrics'] } & DayActions) {
  const rows = contextRows(day.strict, metrics), shared = day.strict.sessions.length;
  return <View testID="insights-day-shared">
    <Section title="Todo el día · alimentación registrada" />
    {shared > 1 ? <AppText muted variant="footnote" numeric testID="insights-day-shared-note">Se registra por día: es lo mismo para las {shared} sesiones.</AppText> : null}
    <ContextList rows={nutritionRows(day.strict)} />
    <AppText muted variant="caption" style={styles.note}>{NUTRITION_SCOPE}</AppText>
    <InsightRow label="Ver Nutrición de ese día" spoken={`Ver Nutrición del ${dayLabel(day.date)}`} onPress={() => onNutrition(day.date)} />
    {rows.length ? <><Section title="Todo el día · métricas" /><ContextList rows={rows} date={day.date} onMetric={onMetric} onBody={onBody} /></> : null}
  </View>;
}

/** Each row opens the evidence of its own comparison: read when that detail opens, never one read per row here. */
function ExerciseRows({ lane, session, partial, router, revision, origin, explain = false, diverging = false }: { lane: Lane; session: SessionFact; partial: PartialDayFact['sessions'][number] | undefined; router: ReturnType<typeof useRouter>; revision: string; origin: InsightsOrigin; explain?: boolean; diverging?: boolean }) {
  const rows = lane === 'strict' ? session.exercises.map(row => ({ id: row.exerciseId, name: row.name, status: row.status as string, reason: row.reason, age: row.referenceAgeDays, date: row.referenceDate, reference: row.referenceSessionId, change: row.change }))
    : (partial?.exercises ?? []).map(row => ({ id: row.exerciseId, name: row.name, status: row.reading as string, reason: row.reason, age: row.referenceAgeDays, date: row.referenceDate, reference: row.referenceSessionId, change: row.change }));
  // A comparison names its compatible reference; a row without one says why it was not compared.
  const explained = new Set<string>();
  // Días más claros · With three or more equal exercises, they wait in one row that opens: what moved comes first.
  const [showSame, setShowSame] = useState(false);
  const same = diverging ? rows.filter(row => { const mark = rowChangeOf(row.change, lane, row.status); return mark.kind === 'same' || (mark.kind === 'pct' && mark.pct === 0); }) : [];
  const grouped = same.length >= 3 && !showSame;
  const shown = grouped ? rows.filter(row => !same.includes(row)) : rows;
  const group = grouped ? <SameGroup key="same" names={same.map(row => row.name || 'Ejercicio')} onOpen={() => { haptics.selection(); setShowSame(true); }} /> : null;
  return <>{shown.map(row => {
    const explanation = explain && !explained.has(row.reason) ? reasonDetail(lane, row.reason) : null;
    explained.add(row.reason);
    const reference = referenceText(row.age, row.date);
    const unclassifiedReference = explain && !statusArrow(row.status) ? reference : null;
    const detail = statusArrow(row.status) ? reference : [reasonText(lane, row.reason), unclassifiedReference, explanation].filter(Boolean).join('. ');
    // #533 · The measured change when there is one; a load signal as «↑ Peso»; otherwise the reading it had.
    const measured = exerciseChangeValue(row.change), recorded = shownText(row.change);
    const spoken = `${exerciseSentence(lane, row.name, row.status, row.reason, row.age, row.date)}${measured ? `, ${measured.spoken}` : ''}${unclassifiedReference ? `. ${unclassifiedReference}` : ''}${explanation ? `. ${explanation}` : ''}. Ver evidencia y series`;
    const open = () => router.push(insightsEvidenceHref({ session: session.sessionId, exercise: row.id, lane, reference: row.reference, result: row.status, revision }, origin));
    // #comparaciones-claras · The session's list: a bar that grows to one side, the recorded values under the name.
    if (diverging) return <DivergingRow key={row.id} name={row.name || 'Ejercicio'} detail={recorded ?? (statusArrow(row.status) ? null : reasonText(lane, row.reason))}
      change={rowChangeOf(row.change, lane, row.status)} spoken={spoken} onPress={open} />;
    return <InsightRow key={row.id} label={row.name || 'Ejercicio'} detail={recorded ?? detail ?? undefined}
      value={measured?.value ?? `${statusArrow(row.status)} ${statusText(lane, row.status)}`} spoken={`${exerciseSentence(lane, row.name, row.status, row.reason, row.age, row.date)}${measured ? `, ${measured.spoken}` : ''}${unclassifiedReference ? `. ${unclassifiedReference}` : ''}${explanation ? `. ${explanation}` : ''}. Ver evidencia y series`}
      onPress={() => router.push(insightsEvidenceHref({ session: session.sessionId, exercise: row.id, lane, reference: row.reference, result: row.status, revision }, origin))} />;
  })}{group}</>;
}
/** «9 iguales»: the equal exercises in one row, their names in a line; tapping shows each of them. */
function SameGroup({ names, onOpen }: { names: readonly string[]; onOpen: () => void }) {
  const reduced = useReduceMotion();
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${names.length} ejercicios quedaron iguales: ${names.join(', ')}. Ver cada uno`} onPress={onOpen} testID="comparisons-same-group"
    style={({ pressed }) => [styles.sameRow, pressedStyle(pressed, reduced)]}>
    <View style={styles.flex}>
      <AppText variant="subheadline" style={{ fontWeight: '600' }}>{`${names.length} iguales`}</AppText>
      <AppText muted variant="caption" numberOfLines={1}>{names.join(', ')}</AppText>
    </View>
    <View style={[styles.sameMark, { borderColor: colors.textMuted }]} />
  </Pressable>;
}


/** The routines of the days read, newest first: «Todas» and then each one by the name of its latest session. */
function routinesOf(days: readonly DayLanes[]) {
  const seen = new Map<string, string>();
  for (const day of days) for (const session of day.strict.sessions) if (session.routineId && !seen.has(session.routineId)) seen.set(session.routineId, session.routineName ?? sessionName(session));
  return [{ value: 'all', label: 'Todas' }, ...[...seen].map(([value, label]) => ({ value, label }))];
}
type ExerciseOrder = 'recent' | 'name' | 'records';
const ORDERS = [{ value: 'recent', label: 'Recientes' }, { value: 'name', label: 'Nombre' }, { value: 'records', label: 'Más registros' }] as const;
/**
 * #533 · One list: each exercise once, in the method that compared it (the strict one when it compared something there, the
 * partial one otherwise), with that method named on the row. Filtered by routine and ordered without another read.
 */
export function exerciseList(model: InsightsSummary, routine: string, order: ExerciseOrder) {
  const partial = new Map(model.partial.exercises.map(row => [row.exerciseId, row]));
  const rows = model.facts.exercises.map(row => {
    const other = partial.get(row.exerciseId);
    return row.improved + row.observedStable + row.declined === 0 && other ? { lane: 'partial' as const, row: other, routineIds: row.routineIds } : { lane: 'strict' as const, row, routineIds: row.routineIds };
  }).filter(entry => routine === 'all' || (entry.routineIds ?? []).includes(routine));
  if (order === 'name') rows.sort((a, b) => (a.row.name || '').localeCompare(b.row.name || '', 'es-AR'));
  if (order === 'records') rows.sort((a, b) => b.row.exposures - a.row.exposures || (a.row.name || '').localeCompare(b.row.name || '', 'es-AR'));
  return rows;
}
function Exercises({ model, router, routine, routines, onRoutine, order, onOrder }: { model: InsightsSummary; router: ReturnType<typeof useRouter>; routine: string; routines: readonly { value: string; label: string }[]; onRoutine: (value: string) => void; order: ExerciseOrder; onOrder: (value: ExerciseOrder) => void }) {
  const { firstDate, lastDate } = model.history;
  if (!model.facts.totals.comparable && !model.partial.totals.total) return <AppText muted>{nothingComparable(model)}</AppText>;
  const rows = exerciseList(model, routine, order);
  const groups = groupsOf(rows);
  const open = (id: string) => router.push({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id } });
  const entries = (list: readonly ListEntry[]) => list.map(entry => <ExerciseEntry key={entry.row.exerciseId} {...entry} onPress={() => open(entry.row.exerciseId)} />);
  const compared = rows.length - groups.single.length;
  return <>
    {routines.length > 2 ? <ChipGroup accessibilityLabel="Filtrar por rutina" value={routine} options={routines} onChange={onRoutine} /> : null}
    <View style={styles.listHead}>
      {/* #518 · What each count is over: the completed sessions read, with their dates when the read says them. */}
      <AppText muted variant="footnote" numeric style={styles.flex} testID="insights-exercises-period">{rows.length} {rows.length === 1 ? 'ejercicio' : 'ejercicios'}{firstDate && lastDate ? ` · ${shortRange(firstDate, lastDate)}` : ''}</AppText>
      <OrderMenu value={order} options={ORDERS} onChange={onOrder} />
    </View>
    {compared ? <Legend /> : null}
    <View testID="insights-exercises">
      {order === 'recent' ? <>
        {groups.changed.length ? <><GroupTitle>Cambiaron la última vez</GroupTitle>{entries(groups.changed)}</> : null}
        {groups.same.length ? <><GroupTitle>Igual que la vez anterior</GroupTitle>{entries(groups.same)}</> : null}
        {groups.none.length ? <><GroupTitle>Sin comparar la última vez</GroupTitle>{entries(groups.none)}</> : null}
      </> : entries(rows.filter(entry => entry.row.exposures > 1))}
      <SingleGroup entries={groups.single} onOpen={open} />
      {!rows.length ? <AppText muted>Esta rutina todavía no tiene ejercicios comparados.</AppText> : null}
    </View>
    {rows.length ? <MethodLine lanes={rows.some(entry => entry.lane === 'partial') ? ['partial'] : ['strict']} /> : null}
  </>;
}
const shortDay = (date: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '');
const shortRange = (from: string, to: string) => from === to ? shortDay(to) : `${shortDay(from)} al ${shortDay(to)}`;

/** #533 · From one session to how its routine's sessions arrived: Cómo llegaste, focused on that routine. */
function RelationLink({ session, router }: { session: SessionFact; router: ReturnType<typeof useRouter> }) {
  if (!session.routineId) return null;
  const name = session.routineName ?? sessionName(session);
  return <IconRow icon="progress" accent label={`Otras sesiones de ${name}`} detail="Cómo llegaste a las que subieron y a las que bajaron" spoken={`Ver otras sesiones de ${name} en Cómo llegaste`}
    onPress={() => router.setParams({ view: 'relation', routine: session.routineId!, session: undefined, date: undefined, fromSession: undefined })} />;
}

/** #518 · One method's result: the clear count (the screen's one hero), the arrows, and what stayed outside, said apart. */
function LaneResult({ lane, counts, hero }: { lane: Lane; counts: Counts; hero: boolean }) {
  const spoken = `${counts.comparable} de ${counts.total} ${heroCaption(lane)}`;
  return <View style={styles.block} testID={`insights-result-${lane}`}>
    <AppText numeric variant={hero ? 'heroNumber' : 'title2'} accessibilityLabel={spoken}>{counts.comparable} de {counts.total}</AppText>
    <AppText muted>{heroCaption(lane)}</AppText>
    {/* #533 · The three directions in one row: the number with its arrow, the word under it. */}
    <View style={styles.counts} accessible accessibilityLabel={readingRows(lane, counts).slice(0, 3).map(row => row.spoken).join('. ')} testID={`insights-counts-${lane}`}>
      {readingRows(lane, counts).slice(0, 3).map(row => <View key={row.label} style={styles.countCell}>
        <AppText variant="title2" numeric>{row.arrow} {row.value}</AppText>
        <AppText muted variant="caption">{row.label}</AppText>
      </View>)}
    </View>
    {outsideText(counts).map(line => <AppText key={line} muted variant="footnote" testID="insights-outside">{line}</AppText>)}
    {counts.down ? <AppText muted variant="footnote">{EXPLAIN_DOWN}</AppText> : null}
  </View>;
}

/**
 * #518 · Feelings, meals and metrics, folded under the result. Opening it is local state: it asks for nothing. Per session,
 * only meals with a checkable time before it started; the whole day once, said to be the day's.
 */
function ContextFold({ day, sessions, model, router, origin, sessionId, actions }: { day: DayLanes; sessions: readonly SessionFact[]; model: InsightsSummary; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; sessionId?: string } & { actions: DayActions }) {
  const { colors } = useOwnlevelTheme();
  const [open, setOpen] = useState(false);
  const clock = feelingClockNote(sessions);
  // Días más claros · One row; everything recorded opens in a sheet, so the screen keeps one reading.
  const go = (run: () => void) => { setOpen(false); run(); };
  const goActions: DayActions = { onMetric: (id, date) => go(() => actions.onMetric(id, date)), onNutrition: date => go(() => actions.onNutrition(date)), onBody: date => go(() => actions.onBody(date)) };
  return <View testID="insights-context">
    <IconRow icon="note" accent label="Todo lo registrado ese día" detail="Sensaciones, comidas, métricas y peso" spoken="Todo lo registrado ese día: sensaciones, comidas, métricas y peso"
      testID="insights-context-toggle" expanded={open} onPress={() => setOpen(true)} />
    {open ? <AppSheet onClose={() => setOpen(false)} closeLabel="Cerrar" testID="insights-context-sheet" style={{ backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.sheet}>
        <View style={styles.detail} testID="insights-context-open">
          <Heading level={2}>Todo lo registrado</Heading>
          {sessions.map(session => { const note = preStartNote(session); return <View key={session.sessionId} testID={`insights-before-${session.sessionId}`}>
            {sessions.length > 1 ? <AppText variant="headline" style={styles.section}>{sessionName(session)} · {sessionTime(session)}</AppText> : null}
            <Section title="Sensaciones" />
            <ContextList rows={feelingRows(session)} />
            <Section title="Antes de esta sesión · comidas con hora en las 3 h previas" />
            <ContextList rows={preStartRows(session)} />
            {note ? <AppText muted variant="footnote" style={styles.note} testID="insights-window-undetermined">{note}</AppText> : null}
          </View>; })}
          {clock ? <AppText muted variant="caption">{clock}</AppText> : null}
          <InsightRow label="Ver horarios y comidas registradas" detail="Inicio, final y registros previos y posteriores de ese día. No explican el resultado."
            spoken={`Ver horarios y comidas registradas del ${dayLabel(day.date)}, incluidas las otras sesiones de ese día`}
            onPress={() => go(() => router.push({ pathname: '/(tabs)/train/insights/temporal', params: { ...origin, date: day.date, ...(sessionId ? { session: sessionId } : {}), revision: model.sourceRevision } }))} />
          <DayShared day={day} metrics={model.metrics} {...goActions} />
        </View>
      </ScrollView>
    </AppSheet> : null}
  </View>;
}

/** Días más claros · A row with its icon and one line: the same shape for every way out of the screen. */
function IconRow({ icon, label, detail, spoken, onPress, accent = false, expanded, testID }: { icon: AppIconName; label: string; detail: string; spoken: string; onPress: () => void; accent?: boolean; expanded?: boolean; testID?: string }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  return <Pressable accessibilityRole="button" accessibilityLabel={spoken} accessibilityState={expanded === undefined ? undefined : { expanded }} testID={testID}
    onPress={() => { haptics.selection(); onPress(); }} style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
    <AppIcon color={accent ? colors.primary : colors.textMuted} name={icon} size={20} />
    <View style={styles.flex}>
      <AppText variant="headline">{label}</AppText>
      <AppText muted variant="footnote">{detail}</AppText>
    </View>
    <AppIcon color={colors.textMuted} name={expanded ? 'chevronDown' : 'chevronRight'} size={15} />
  </Pressable>;
}

/** The reference of most compared exercises, for «frente al sábado 14»; several different ones say «la vez anterior». */
function referenceOf(session: SessionFact, partial: PartialDayFact['sessions'][number] | undefined) {
  const dates = [...session.exercises.map(row => row.referenceDate), ...(partial?.exercises ?? []).map(row => row.referenceDate)].filter((date): date is string => !!date);
  const unique = [...new Set(dates)];
  if (unique.length !== 1) return 'Frente a la vez anterior';
  const text = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${unique[0]}T12:00:00Z`));
  return `Frente al ${text}`;
}

/**
 * «Comparaciones más claras» · One session, read straight on the background: the number, the three directions in words, a mark
 * per exercise and «Cómo llegaste» as a line that opens its detail. The method's words stay one tap away.
 */
function SessionComparison({ session, day, partial, model, router, origin, explain = false }: { session: SessionFact; day: DayLanes; partial: PartialDayFact['sessions'][number] | undefined; model: InsightsSummary; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; explain?: boolean }) {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const [open, setOpen] = useState(false);
  const lanes = sessionLanes(session, partial ?? null);
  const change = joinedChange(session.change, partial?.change ?? undefined);
  const hero = sessionHero(change);
  // «Rendimiento frente a lo tuyo» comes with the summary; its exercises are read only when asked for (the read Cómo llegaste shares).
  const own = session.own, ownPct = own?.pct ?? null;
  const [ownOpen, setOwnOpen] = useState(false);
  const ownRead = useOwnPerformance(client, null, ownOpen);
  const ownDetail = ownSessionOf(ownRead.data, session.sessionId);
  const name = sessionName(session);
  const start = session.startedAt ? Date.parse(session.startedAt) : NaN;
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchSessionTemporal(c, day.date, signal), [day.date]);
  // Opening the screen is one read: the meals of the window are read only when the detail opens.
  const temporal = useProgressResource(open && Number.isFinite(start) ? client : null, `performance-insights|session-temporal|${day.date}`, load);
  const entry = temporal.data?.sessions.find(row => row.sessionId === session.sessionId);
  const facts = arrivalFacts(session, day.strict, model.metrics);
  const sleep = facts.find(fact => fact.key === 'sleep')?.value ?? null;
  // On the screen, the line has what the summary already says: the last meal with a checked time, and whether others had none.
  const last = session.context.preStart?.lastExplicitMeal;
  const meals = last?.state === 'recorded' && last.hours !== null && Number.isFinite(start) ? [{ at: start - last.hours * 3_600_000, calories: null }] : [];
  const uncertain: 'some' | 0 = last && (last.untimedInScope || last.unverifiedInScope) ? 'some' : 0;
  const lastText = facts.find(fact => fact.key === 'last-meal')?.value ?? (meals.length ? 'con hora' : null);
  const tally = lanes.reduce((sum, { counts }) => ({ up: sum.up + counts.up, same: sum.same + counts.same, down: sum.down + counts.down }), { up: 0, same: 0, down: 0 });
  const rowOrigin = { ...origin, date: day.date, revision: model.sourceRevision };
  const links = [
    ...(session.routineId ? [{ label: `Otras sesiones de ${session.routineName ?? name}`, spoken: `Ver otras sesiones de ${session.routineName ?? name} en Cómo llegaste`, onPress: () => { setOpen(false); haptics.selection(); router.setParams({ view: 'relation', routine: session.routineId!, session: undefined, date: undefined, fromSession: undefined }); } }] : []),
    { label: 'Ver horarios y comidas', spoken: `Ver horarios y comidas del ${dayLabel(day.date)}`, onPress: () => { setOpen(false); router.push({ pathname: '/(tabs)/train/insights/temporal', params: { ...origin, date: day.date, session: session.sessionId, revision: model.sourceRevision } }); } },
  ];
  const previousLine = `Frente a la vez anterior: ${hero ? `${hero.value} · ` : ''}${tally.up} ${tally.up === 1 ? 'subió' : 'subieron'}, ${tally.same} igual, ${tally.down} ${tally.down === 1 ? 'bajó' : 'bajaron'}`;
  return <View style={styles.block} testID="comparisons-session">
    {own && ownPct !== null ? <>
      <View style={styles.heroLine} testID="comparisons-own-hero">
        <AppText numeric variant="heroNumber" accessibilityLabel={ownSpoken(ownPct)}>{formatPct(ownPct)}</AppText>
        <AppText muted variant="subheadline" style={styles.heroSay} numeric>{`frente a lo tuyo\nen ${own.compared} de ${own.total} ejercicios`}</AppText>
      </View>
      <AppText muted variant="footnote" numeric testID="comparisons-previous-line">{previousLine}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver cada ejercicio frente a lo tuyo`} testID="comparisons-own-open" onPress={() => { haptics.selection(); setOwnOpen(true); }}>
        <AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Cada ejercicio frente a lo tuyo ›</AppText>
      </Pressable>
      <Kicker>Frente a la vez anterior</Kicker>
    </> : <>
      {hero ? <View style={styles.heroLine} testID="comparisons-change-hero">
        <AppText numeric variant="heroNumber" accessibilityLabel={hero.spoken}>{hero.value}</AppText>
        <AppText muted variant="subheadline" style={styles.heroSay}>{`reps con\nel mismo peso`}</AppText>
      </View> : null}
      {hero ? <ChangeTally {...tally} testID="comparisons-tally" /> : null}
    </>}
    {lanes.map(({ lane, counts }, index) => <View key={lane} style={styles.block} testID={`insights-session-lane-${lane}`}>
      {!hero ? <LaneResult lane={lane} counts={counts} hero={index === 0} /> : null}
      {lanes.length > 1 ? <Kicker>{LANE_TITLE[lane]}</Kicker> : null}
      {/* With the number on top, each method keeps its own denominator in one quiet line with «Cómo comparamos»: never added to the other. */}
      {hero ? <MethodLine lanes={[lane]} testID={lane === 'partial' ? 'insights-partial-limit' : `comparisons-method-${lane}`} leadTestID={`insights-counts-${lane}`}
        lead={`${counts.comparable} de ${counts.total} comparados`} leadLabel={[`${counts.comparable} de ${counts.total} ${heroCaption(lane)}`, ...outsideText(counts)].join('. ')} />
        : <>
          <View style={[styles.rule, { backgroundColor: colors.border }]} />
          {lane === 'partial' ? <MethodLine lanes={['partial']} testID="insights-partial-limit" /> : null}
        </>}
      <View>
        <ExerciseRows diverging explain={explain} lane={lane} session={session} partial={partial} router={router} revision={model.sourceRevision} origin={rowOrigin} />
      </View>
    </View>)}
    {hero || lanes.some(row => row.lane === 'partial') ? null : <MethodLine lanes={['strict']} />}
    <View style={styles.block}>
      <View style={styles.kickerLine}>
        <Kicker>Cómo llegaste</Kicker>
        {Number.isFinite(start) ? <AppText variant="footnote" style={{ color: colors.primary }} accessibilityElementsHidden importantForAccessibility="no">Ver detalle</AppText> : null}
      </View>
      {Number.isFinite(start) ? <ArrivalTimeline start={start} meals={meals} uncertain={uncertain} sleep={sleep} onPress={() => setOpen(true)} label={timelineLabel(meals.length, uncertain, sleep, meals.length ? lastText : null)} />
        : <ArrivalGrid title={false} facts={facts} />}
    </View>
    <FoodBlock session={session} day={day.strict} />
    {ownOpen ? <AppSheet onClose={() => setOwnOpen(false)} closeLabel="Cerrar" testID="comparisons-own-sheet" style={{ backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.sheet}>
        <Heading level={2}>Frente a lo tuyo</Heading>
        <AppText muted variant="footnote">Lo tuyo es tu nivel de las 5 veces anteriores de cada ejercicio.</AppText>
        {ownDetail ? <View testID="comparisons-own-exercises">
          {ownDetail.exercises.map((exercise, index) => <View key={`${exercise.exerciseId}-${index}`} style={[styles.ownRow, { borderColor: colors.border }]} accessible
            accessibilityLabel={`${exercise.name}: ${exercise.pct === null ? 'sin lo tuyo todavía' : ownSpoken(exercise.pct)}. ${exerciseLine(exercise)}`}>
            <View style={styles.flex}>
              <AppText variant="subheadline" style={styles.ownName} numberOfLines={1}>{exercise.name}</AppText>
              <AppText muted variant="footnote" numeric>{exerciseLine(exercise)}</AppText>
            </View>
            <AppText variant="headline" numeric muted={exercise.pct === null || exercise.pct <= 0}>{exercise.pct === null ? '—' : formatPct(exercise.pct)}</AppText>
          </View>)}
        </View> : ownRead.state.status === 'loading' ? <SkeletonBlock height={160} />
          : <InlineUnavailable message="No pudimos traer los ejercicios." actionLabel="Reintentar" onAction={() => void ownRead.refresh()} />}
      </ScrollView>
    </AppSheet> : null}
    {open ? <AppSheet onClose={() => setOpen(false)} closeLabel="Cerrar" testID="comparisons-arrival-detail" style={{ backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.sheet}>
        <Heading level={2}>Cómo llegaste</Heading>
        <ArrivalSheetContent session={session} day={day.strict} metrics={model.metrics} name={name} start={Number.isFinite(start) ? start : null} temporal={entry} sleep={sleep} fallback={{ meals, uncertain }}>
          <ArrivalLinks links={links} />
        </ArrivalSheetContent>
      </ScrollView>
    </AppSheet> : null}
    <RelationLink session={session} router={router} />
  </View>;
}

/** Días más claros · Who and when in one small line, the session's name as the title. Tapping the name opens the session. */
function SessionTitle({ session, day, partial, router }: { session: SessionFact; day: DayLanes; partial: PartialDayFact['sessions'][number] | undefined; router: ReturnType<typeof useRouter> }) {
  const reduced = useReduceMotion();
  const name = sessionName(session), time = sessionTime(session);
  return <View style={styles.titleBlock}>
    <Kicker>{`${dayLabel(day.date).split(',')[0]} ${Number(day.date.slice(8, 10))} · ${time.split('–')[0]!.replace('Desde ', '')} · ${referenceOf(session, partial).toLocaleLowerCase('es-AR').replace('frente a la vez anterior', 'frente a la anterior')}`}</Kicker>
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir sesión ${name}, ${dayLabel(day.date)} de ${day.date.slice(0, 4)}, ${time}`}
      onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: session.sessionId } })} style={({ pressed }) => pressedStyle(pressed, reduced)}>
      <Heading level={1}>{name}</Heading>
    </Pressable>
  </View>;
}

/** #518 · The chosen session: what and when, its result per method, its exercises to open, then the folded context. */
function SessionReading({ focus, model, router, origin, actions, onOther }: { focus: NonNullable<ReturnType<typeof focusOf>>; model: InsightsSummary; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; actions: DayActions; onOther: (sessionId: string) => void }) {
  const others = daySessions(focus.day.strict).sessions.filter(row => row.sessionId !== focus.session.sessionId);
  const none = withoutComparison(focus.session, focus.partial);
  return <View style={styles.block} testID="insights-session">
    <SessionTitle session={focus.session} day={focus.day} partial={focus.partial ?? undefined} router={router} />
    {others.length ? <View testID="insights-day-others">
      <AppText muted variant="footnote" numeric>{others.length + 1} sesiones ese día. Cada una tiene su resultado; lo registrado todo el día es el mismo.</AppText>
      {others.map(other => <InsightRow key={other.sessionId} label={`Ver ${sessionName(other)}`} detail={sessionTime(other)} spoken={`Ver la otra sesión de ese día: ${sessionName(other)}, ${sessionTime(other)}`} onPress={() => onOther(other.sessionId)} />)}
    </View> : null}
    {none ? <View style={styles.block} testID="insights-session-none"><Heading level={2}>Todavía sin comparaciones</Heading><AppText muted>{none}</AppText></View> : null}
    {<SessionComparison explain session={focus.session} day={focus.day} partial={focus.partial ?? undefined} model={model} router={router} origin={origin} />}
    <ContextFold day={focus.day} sessions={[focus.session]} model={model} router={router} origin={origin} sessionId={focus.session.sessionId} actions={actions} />
  </View>;
}

/** #518 · Without a chosen session: the latest day with a clear result, read the same way, every session of it in order. */
function DayReading({ hero, model, router, origin, actions }: { hero: NonNullable<ReturnType<typeof heroOf>>; model: InsightsSummary; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; actions: DayActions }) {
  const { day } = hero;
  const { sessions, orderKnown } = daySessions(day.strict);
  const lanes = [hero.lane, ...dayLanes(day).filter(lane => lane !== hero.lane)];
  const rowOrigin = { ...origin, date: day.date };
  // #533 · One session that day: its measured change leads, and how the person arrived at it comes right after.
  const single = sessions.length === 1 ? sessions[0]! : null;
  const change = single ? sessionHero(joinedChange(single.change, day.partial?.sessions.find(row => row.sessionId === single.sessionId)?.change)) : null;
  // The session leads with a number: its change against the previous time, or its performance against «lo tuyo».
  const leads = !!single && (!!change || (single.own?.pct ?? null) !== null);
  return <>
    <View style={styles.block} testID="insights-hero">
      {leads && single ? <SessionTitle session={single} day={day} partial={day.partial?.sessions.find(row => row.sessionId === single.sessionId)} router={router} />
        : <Heading level={1}>{dayLabel(day.date)}{day.openDay ? ' · en curso' : ''}</Heading>}
      {sessions.length > 1 ? <AppText muted variant="footnote" numeric testID="insights-day-order">{orderKnown ? `${sessions.length} sesiones, en el orden en que empezaron.` : `${sessions.length} sesiones. No sabemos en qué orden fueron.`}</AppText> : null}
      {leads && single ? null : sessions.map(session => { const name = sessionName(session), time = sessionTime(session); return <InsightRow key={session.sessionId} heading label={name} detail={time} spoken={`Abrir sesión ${name}, ${time}`}
        onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: session.sessionId } })} />; })}
      {leads && single ? <SessionComparison session={single} day={day} partial={day.partial?.sessions.find(row => row.sessionId === single.sessionId)} model={model} router={router} origin={origin} /> : null}
      {leads && single ? null : lanes.map((lane, index) => { const counts = lane === 'strict' ? day.strictCounts : day.partialCounts; if (!counts?.total) return null; return <View key={lane} style={styles.block} testID={`insights-day-lane-${lane}`}>
        {lanes.length > 1 ? <Heading level={2}>{LANE_TITLE[lane]}</Heading> : null}
        <LaneResult lane={lane} counts={counts} hero={index === 0} />
        {lane === 'partial' ? <MethodLine lanes={['partial']} testID="insights-partial-limit" /> : null}
        <Section title="Ejercicios · tocá uno para ver tus series" />
        {sessions.map(session => <View key={session.sessionId}>
          {sessions.length > 1 ? <AppText muted variant="footnote">{sessionName(session)} · {sessionTime(session)}</AppText> : null}
          <ExerciseRows lane={lane} session={session} partial={day.partial?.sessions.find(row => row.sessionId === session.sessionId)} router={router} revision={model.sourceRevision} origin={rowOrigin} />
        </View>)}
      </View>; })}
    </View>
    <View testID="insights-hero-context">
      <ContextFold day={day} sessions={sessions} model={model} router={router} origin={origin} actions={actions} />
    </View>
  </>;
}

function RelationList({ lane, title, items, metrics, family, router, evaluated }: { lane: Lane; title: string; items: readonly (RelationSummary | PartialRelationSummary)[]; metrics: InsightsSummary['metrics']; family: FamilyFilter; router: ReturnType<typeof useRouter>; evaluated: number }) {
  const relationOrigin=progressOriginParams(useLocalSearchParams());
  const [showWaiting, setShowWaiting] = useState(false);
  const groups = relationGroups([...items], family);
  const row = (item: RelationSummary | PartialRelationSummary) => <InsightRow key={item.id} label={relationName(item, metrics)} value={relationState(item)}
    spoken={`${relationName(item, metrics)}: ${relationState(item)}${lane === 'partial' ? ', con contexto parcial' : ''}`}
    onPress={() => router.push({ pathname: '/(tabs)/train/insights/[relation]', params: { ...relationOrigin,relation: item.id } })} />;
  return <View style={styles.block}>
    <Section title={title} />
    {groups.readable.map(row)}
    {groups.waiting.length ? <InsightRow muted label="Todavía sin datos suficientes" value={groups.waiting.length} expanded={showWaiting} spoken={`${groups.waiting.length} relaciones todavía sin datos suficientes`} onPress={() => setShowWaiting(current => !current)} /> : null}
    {showWaiting ? groups.waiting.map(row) : null}
    <AppText muted variant="caption">Evaluamos {evaluated} relaciones y te mostramos todas, también las que no dieron nada. {lane === 'partial' ? 'Una coincidencia no dice por qué pasó.' : 'Una relación no dice por qué pasó.'}</AppText>
  </View>;
}

/** Its own read, only once asked for: the relations are what costs, and they are never at the top. */
function Relations({ client, family, onFamily, router, facts, onStale }: { client: MobileApiClient | null; family: FamilyFilter; onFamily: (next: FamilyFilter) => void; router: ReturnType<typeof useRouter>; facts: InsightsSummary; onStale: () => void }) {
  const { state, data, refresh } = useProgressResource(client, 'performance-insights|relations', loadRelations);
  const stale = !!data && !sameRead(data, facts);
  const pair = stale ? `${data.sourceRevision}|${facts.sourceRevision}` : null, handled = useRef<string | null>(null);
  // Never next to facts of another read. Both get read again, once per pair, until they agree.
  useEffect(() => { if (pair && handled.current !== pair) { handled.current = pair; void refresh(); onStale(); } }, [pair, refresh, onStale]);
  if (stale && state.status === 'ready') return <View testID="relations-changed" style={styles.block}><AppText muted variant="footnote" accessibilityLiveRegion="polite">Tus datos cambiaron. Estamos actualizando las relaciones.</AppText><SkeletonBlock height={132} /></View>;
  if (state.status === 'loading' && !data) return <View testID="relations-loading" style={styles.block}><SkeletonBlock height={44} /><SkeletonBlock height={132} /></View>;
  if (!data || data.integrity !== 'valid' || data.partial.integrity !== 'valid') return <InlineUnavailable message="No pudimos traer las relaciones." actionLabel="Reintentar" onAction={() => void refresh()} />;
  return <View style={styles.block}>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <ChipGroup accessibilityLabel="Filtrar relaciones" value={family} options={FAMILY_OPTIONS} onChange={onFamily} />
    {data.strict.outcomeDays ? <RelationList lane="strict" title={LANE_TITLE.strict} items={data.strict.items} metrics={data.metrics} family={family} router={router} evaluated={data.strict.candidatesEvaluated} /> : null}
    {data.partial.outcomeDays ? <RelationList lane="partial" title={LANE_TITLE.partial} items={data.partial.items} metrics={data.metrics} family={family} router={router} evaluated={data.partial.candidatesEvaluated} /> : null}
  </View>;
}

/** Entrenar → Insights: result, context, relations and evidence, in that order. One read when it opens, nothing computed here. */
export function InsightsScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const router = useInsightsRouter();
  const params = useLocalSearchParams();
  const view: View_ = (params.view === 'exercises' || params.view === 'relation') && !validSession(params.session) ? params.view : 'days';
  const family = (FAMILY_OPTIONS.find(option => option.value === params.family)?.value ?? 'all') as FamilyFilter;
  const relationsOpen = params.relations === '1';
  const origin = insightsOriginOf(params);
  const focusId = validSession(params.session) ? params.session : null, focusDate = origin.date ?? null;
  const before=origin.before;
  const loadSummary=useCallback((c:MobileApiClient,signal:AbortSignal)=>fetchInsightsSummaryBefore(c,before,signal),[before]);
  const { state, data, refresh } = useProgressResource(client, `performance-insights${before?`|before|${before}`:''}`, loadSummary);
  usePeriodReturn(refresh);
  // #518 · The read this screen first showed. Coming back (from evidence, Nutrition, a session) reads again; if the records
  // changed meanwhile, the screen says so once and shows the new reading, never the two mixed.
  const [firstRevision, setFirstRevision] = useState<string | null>(null);
  if (data && firstRevision === null) setFirstRevision(data.sourceRevision);
  const changedWhileOpen = !!data && firstRevision !== null && data.sourceRevision !== firstRevision;
  const [more, setMore] = useState<{ base: InsightsSummary; days: DayFact[]; partial: PartialDayFact[]; next: string | null } | null>(null);
  const [morePhase, setMorePhase] = useState<'idle' | 'loading' | 'failed'>('idle');
  // A refresh of the same read keeps what was already paged. Another read never joins it, and the person is told.
  const extra = more && data && sameRead(more.base, data) ? more : null;
  const pagesDropped = !!more && !!data && !extra;
  const days = useMemo(() => data ? joinDays([...data.facts.days, ...(extra?.days ?? [])], [...data.partial.days, ...(extra?.partial ?? [])]) : [], [data, extra]);
  const next = extra ? extra.next : data?.facts.page.nextBefore ?? null;
  // Each page runs a whole read on the server, so it follows a tap and never a scroll.
  const loadMore = async () => {
    if (!client || !data || !next || morePhase === 'loading') return;
    setMorePhase('loading');
    const result = await fetchInsightsDays(client, next);
    if (result.status !== 'ok') { setMorePhase('failed'); return; }
    // Something changed since this list was read: its days must not be joined with newer ones.
    if (!sameRead(result.data, data)) { setMore({ base: data, days: extra?.days ?? [], partial: extra?.partial ?? [], next }); setMorePhase('idle'); void refresh(); return; }
    setMore({ base: data, days: [...(extra?.days ?? []), ...result.data.facts.days], partial: [...(extra?.partial ?? []), ...result.data.partial.days], next: result.data.facts.page.nextBefore });
    setMorePhase('idle');
  };
  // The finished session may be older than the first page. Its day alone is asked for and shown apart: it never joins the list.
  const onPage = useMemo(() => focusId ? focusOf(days, focusId) : null, [days, focusId]);
  const readSettled = state.status === 'ready' && !state.refreshing;
  const needsDay = !!focusId && !!focusDate && !onPage && !!next && readSettled && focusDate < (days.at(-1)?.date ?? '');
  const [focusPage, setFocusPage] = useState<{ key: string; phase: 'failed' | 'ready'; days: DayLanes[] } | null>(null);
  const [focusAttempt, setFocusAttempt] = useState(0);
  const focusKey = data && needsDay ? `${focusId}|${focusDate}|${data.sourceRevision}|${data.today}|${focusAttempt}` : null;
  useEffect(() => {
    if (!focusKey || !client || !data || !focusDate) return;
    let live = true;
    void fetchInsightsDays(client, nextDate(focusDate), undefined, 1).then(result => {
      if (!live) return;
      if (result.status !== 'ok') { setFocusPage({ key: focusKey, phase: 'failed', days: [] }); return; }
      if (!sameRead(result.data, data)) { void refresh(); return; }
      setFocusPage({ key: focusKey, phase: 'ready', days: joinDays(result.data.facts.days, result.data.partial.days) });
    });
    return () => { live = false; };
  }, [client, data, focusDate, focusKey, refresh]);
  const shownFocusPage = focusPage && focusPage.key === focusKey ? focusPage : null;
  const focus = onPage ?? (focusId && shownFocusPage ? focusOf(shownFocusPage.days, focusId) : null);
  const focusLoading = !!focusId && !focus && (!readSettled || (needsDay && !shownFocusPage));
  const focusFailed = !!focusId && !focus && needsDay && shownFocusPage?.phase === 'failed';
  const openMetric = (metricId: string, date: string) => { haptics.selection(); router.push(metricTrendHref(metricId, date, { ...origin, date, ...(origin.fromSession && data ? { revision: data.sourceRevision } : {}) })); };
  const openNutrition = (date: string) => { haptics.selection(); router.push(nutritionDayHref(date, { ...origin, date, ...(origin.fromSession && data ? { revision: data.sourceRevision } : {}) })); };
  const openBody = (date: string) => { haptics.selection(); router.push(dayWeightHref(date, { ...origin, date, ...(origin.fromSession && data ? { revision: data.sourceRevision } : {}) })); };
  const actions: DayActions = { onMetric: openMetric, onNutrition: openNutrition, onBody: openBody };
  // Another session of the same day: its own reading on top of this one, so Back comes here.
  const openOther = (sessionId: string) => { haptics.selection(); if (focus) router.push({ pathname: '/(tabs)/train/insights', params: { ...progressOriginParams(params), session: sessionId, date: focus.day.date } }); };
  const setView = (value: View_) => { haptics.selection(); router.setParams({ view: value, session: undefined, date: undefined }); };
  const setFamily = (value: FamilyFilter) => { haptics.selection(); router.setParams({ family: value }); };
  const toggleRelations = () => { haptics.selection(); router.setParams({ relations: relationsOpen ? '0' : '1' }); };
  const refreshControl = <RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />;
  const returnToSession = origin.fromSession && focusId ? <LinkRow kind="back" label="Volver a la sesión" onPress={() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/(tabs)/train/history/[id]', params: { id: focusId } });
  }} /> : null;
  const scroll = (children: React.ReactNode) => <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} testID="insights-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} refreshControl={refreshControl}><ReturnToProgress/>{children}{returnToSession}</ScrollView>;

  if (state.status === 'loading' && !data) return scroll(<View testID="insights-loading" style={styles.block}><SkeletonBlock height={44} /><SkeletonBlock height={120} /><SkeletonBlock height={176} /><SkeletonBlock height={220} /></View>);
  const failed = <UnavailableState title="Uy, no pudimos leer tus datos" description="Tranqui: está todo guardado." action={<Button label="Reintentar" onPress={() => void refresh()} />} />;
  // Contradictory rows are not an empty history: it is shown like a failed read.
  if (!data || data.integrity !== 'valid' || data.partial.integrity !== 'valid') return scroll(failed);
  if (data.history.sessions === 0 && !focusId) return scroll(<View style={styles.block} testID="insights-empty">
    <Heading level={2}>Todavía no hay sesiones</Heading>
    <AppText muted>Con dos entrenamientos del mismo ejercicio empieza a compararse.</AppText>
    <ExampleFrame><AppText muted variant="title1" numeric>4 de 6</AppText><AppText muted variant="footnote">ejercicios comparables</AppText></ExampleFrame>
  </View>);

  // #533 · Routine filter of Días: a client-side cut of the days already read, never another request.
  const routineOptions = routinesOf(days);
  const routine = typeof params.routine === 'string' && routineOptions.some(option => option.value === params.routine) ? params.routine : 'all';
  const shownDays = routine === 'all' ? days : days.filter(day => day.strict.sessions.some(session => session.routineId === routine));
  const strip: StripSession[] = shownDays.flatMap(day => day.strict.sessions.filter(session => routine === 'all' || session.routineId === routine).map(session => ({
    sessionId: session.sessionId, date: day.date, label: sessionName(session), routine: session.routineName ?? sessionName(session),
    pct: joinedChange(session.change, day.partial?.sessions.find(row => row.sessionId === session.sessionId)?.change)?.pct ?? null })));
  const setRoutine = (value: string) => { haptics.selection(); router.setParams({ routine: value === 'all' ? undefined : value }); };
  // A day chosen by the route (coming back from another screen) leads; otherwise the latest with a clear result.
  const chosenDay = !focusId && focusDate ? shownDays.filter(day => day.date === focusDate) : [];
  const hero = focusId ? null : heroOf(chosenDay) ?? heroOf(shownDays);
  // Días más claros · The chart stays on top while choosing sessions; a session opened from its own finish keeps its quiet screen.
  const chrome = !focusId || !origin.fromSession;
  const selectedSession = focusId ?? (hero?.day.strict.sessions.length === 1 ? hero.day.strict.sessions[0]!.sessionId : null);
  return scroll(<>
    {origin.explore&&origin.asOf&&origin.week?<LinkRow kind="back" label={origin.compare ? 'Volver a comparar semanas' : 'Volver a la semana'} onPress={()=>router.navigate(explorationHref(origin.asOf!,origin.week,origin.revision,origin))}/>:null}
    {origin.explore&&origin.revision&&origin.revision!==data.sourceRevision?<AppText>Los registros cambiaron desde la semana. Esta lectura completa está actualizada.</AppText>:null}
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    {origin.fromSession && origin.revision && origin.revision !== data.sourceRevision ? <AppText muted testID="insights-session-revised">Los registros cambiaron desde el origen. Esta lectura completa está actualizada.</AppText>
      : changedWhileOpen ? <AppText muted accessibilityLiveRegion="polite" testID="insights-revised-now">Tus registros cambiaron mientras mirabas. Esta lectura está actualizada.</AppText> : null}
    {chrome ? <ExerciseSegmented accessibilityLabel="Ver por sesiones, ejercicios o cómo llegaste" value={view} options={VIEWS} onChange={setView} /> : null}
    {view === 'relation' ? <OwnTramosView client={client} metrics={data.metrics} router={router} origin={origin} initialRoutine={routine === 'all' ? null : routine}
      evaluated={data.relations.partial.outcomeDays ? data.relations.partial.candidatesEvaluated : data.relations.strict.candidatesEvaluated}
      onStatistics={() => router.setParams({ view: 'days', relations: '1' })} />
    : view === 'exercises' ? <Exercises model={data} router={router} routine={routine} routines={routineOptions} onRoutine={setRoutine}
      order={ORDERS.find(option => option.value === params.order)?.value ?? 'recent'} onOrder={value => { haptics.selection(); router.setParams({ order: value === 'recent' ? undefined : value }); }} /> : <>
      {/* Días más claros · The chart of sessions, the chosen one read top to bottom, then one row for each way out. */}
      {chrome ? <>
        {routineOptions.length > 2 ? <ChipGroup accessibilityLabel="Filtrar por rutina" value={routine} options={routineOptions} onChange={setRoutine} /> : null}
        <SessionChart sessions={strip} selected={selectedSession} onEarlier={next ? () => void loadMore() : undefined} loadingEarlier={morePhase === 'loading'}
          onSelect={session => router.setParams({ session: session.sessionId, date: session.date })} />
        {morePhase === 'failed' ? <InlineUnavailable message="No pudimos traer más días." actionLabel="Reintentar" onAction={() => void loadMore()} /> : null}
        {pagesDropped ? <AppText muted variant="footnote" accessibilityLiveRegion="polite" testID="insights-changed">Tus datos cambiaron, así que actualizamos la lista.</AppText> : null}
      </> : null}
      {focus ? <SessionReading focus={focus} model={data} router={router} origin={origin} actions={actions} onOther={openOther} />
        : focusLoading ? <View testID="insights-session-loading" style={styles.block}><SkeletonBlock height={120} /><SkeletonBlock height={176} /></View>
        : focusFailed ? <InlineUnavailable message="No pudimos traer los hechos de esta sesión." actionLabel="Reintentar" onAction={() => setFocusAttempt(current => current + 1)} />
        : focusId ? <View style={styles.block} testID="insights-session-absent">
          <Heading level={2}>Esta sesión todavía no aparece</Heading>
          <AppText muted>Esta lectura no la incluye. Puede haber cambiado o haberse eliminado. Podés actualizar o volver al detalle.</AppText>
          <Button label="Actualizar" variant="secondary" onPress={() => void refresh()} />
        </View>
        : hero ? <DayReading hero={hero} model={data} router={router} origin={origin} actions={actions} /> : <View style={styles.block} testID="insights-nothing">
          <Heading level={2}>Todavía sin comparaciones</Heading>
          <AppText muted>{nothingComparable(data)}</AppText>
        </View>}
      {chrome ? <View>
        <Kicker>Para mirar más</Kicker>
        <IconRow icon="progress" accent label="Tu rendimiento" detail="Cada semana frente a lo tuyo" spoken="Tu rendimiento: cada semana frente a lo tuyo, por rutina"
          onPress={() => router.push(withProgressOrigin('/(tabs)/train/insights/own',origin))} />
        {/* Its own read, on a tap: the last three whole months, facts only. */}
        <IconRow icon="calendar" label="Últimos 3 meses" detail="Entrenos, sensaciones, comidas y peso" spoken="Últimos 3 meses: entrenamiento, sensaciones, comidas y peso, con sus fechas"
          onPress={() => router.push(withProgressOrigin('/(tabs)/train/insights/period',origin))} />
        <IconRow icon="activity" label="Cómo terminaste" detail="Energía y fatiga al terminar" spoken="Cómo terminaste: energía y fatiga al terminar, según cómo empezaste"
          onPress={() => router.push(withProgressOrigin('/(tabs)/train/insights/feelings',origin))} />
        {data.relations.strict.outcomeDays || data.relations.partial.outcomeDays ? <>
          <IconRow icon="search" label="Relaciones estadísticas" detail="Lo que coincidió en todo tu historial" expanded={relationsOpen} onPress={toggleRelations}
            spoken={`Relaciones estadísticas, ${data.relations.partial.outcomeDays ? data.relations.partial.candidatesEvaluated : data.relations.strict.candidatesEvaluated} relaciones`} />
          {/* Its own read, only once asked for. */}
          {relationsOpen ? <Relations client={client} family={family} onFamily={setFamily} router={router} facts={data} onStale={refresh} /> : null}
        </> : null}
      </View> : <InsightRow label="Ver todas las sesiones" spoken="Ver todas las sesiones en Comparaciones" onPress={() => router.setParams({ session: undefined, fromSession: undefined, view: undefined })} />}
    </>}
  </>);
}

const styles = StyleSheet.create({
  titleBlock: { gap: spacing.xs },
  sameRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  sameMark: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, marginRight: 43 },
  kickerLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLine: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', columnGap: spacing.md },
  heroSay: { paddingBottom: 8 },
  ownRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  ownName: { fontWeight: '600' },
  rule: { height: StyleSheet.hairlineWidth },
  sheet: { gap: spacing.lg, padding: brandTokens.layout.screenPadding, paddingBottom: spacing.xxl },
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detail: { gap: spacing.md, paddingBottom: spacing.md },
  flex: { flex: 1, flexShrink: 1 },
  section: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  fact: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  factStacked: { alignItems: 'flex-start', flexDirection: 'column', gap: 2 },
  factValue: { flexShrink: 1, textAlign: 'right' },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  strip: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  stripSlot: { flex: 1, justifyContent: 'flex-end' },
  coverage: { paddingTop: spacing.sm },
  exerciseValue: { minWidth: 52, textAlign: 'right' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingVertical: spacing.xs },
  countCell: { minWidth: 72, gap: 2 },
  note: { paddingVertical: spacing.xs },
});
