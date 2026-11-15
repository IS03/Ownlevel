import { ReturnToProgress } from './return-to-progress';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsDays, fetchInsightsRelations, fetchInsightsSummaryBefore, type DayFact, type InsightsSummary, type PartialDayFact, type PartialRelationSummary, type RelationSummary, type SessionFact } from '@/api/performance-insights';
import { AppIcon, AppText, Button, ChipGroup, ExampleFrame, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, motionDurations, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { useProgressResource } from '@/progress/use-progress-resource';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { EXPLAIN_DOWN, FAMILY_OPTIONS, LANE_TITLE, NUTRITION_SCOPE, PARTIAL_LIMIT, contextRows, exposuresText, feelingRows, outsideText, preStartNote, preStartRows, unclearCount, withoutComparison, type Counts, dayLabel, dayLanes, daySessions, referenceText, sessionLanes, feelingClockNote, nutritionRows, sessionName, sessionRows, sessionTime, exerciseSentence, focusOf, heroCaption, heroOf, joinDays, nextDate, nothingComparable, primaryLane, readingRows, reasonDetail, reasonText, relationGroups, relationName, relationState, sameRead, statusArrow, statusText, stripMarks, stripSummary, summarySpoken, summaryText, type ContextRow, type DayLanes, type FamilyFilter, type Lane } from './insights-model';
import { InsightRow } from './insight-row';
import { usePeriodReturn } from './use-period-return';
import { withProgressOrigin,progressOriginParams,dayWeightHref, explorationHref, insightsEvidenceHref, insightsOriginOf, metricTrendHref, nutritionDayHref, validSession, type InsightsOrigin } from './navigation';

type View_ = 'days' | 'exercises';
const VIEWS = [{ value: 'days', label: 'Días' }, { value: 'exercises', label: 'Ejercicios' }] as const;
const STRIP = 72;
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

/** One session: who it was and when, then what was recorded in it. Opening it goes to its read-only detail. */
function SessionBlock({ session, origin, router, children }: { session: SessionFact; origin: boolean; router: ReturnType<typeof useRouter>; children?: React.ReactNode }) {
  const name = sessionName(session), time = sessionTime(session);
  return <View style={styles.block} testID={`insights-day-session-${session.sessionId}`}>
    <InsightRow heading label={name} detail={origin ? `${time} · Esta sesión` : time} spoken={`Abrir sesión ${name}, ${time}${origin ? ', esta sesión' : ''}`}
      onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: session.sessionId } })} />
    <ContextList rows={sessionRows(session)} />
    {children}
  </View>;
}
/** Every session of the day. In the order they started only when that is known; otherwise the screen says it does not know. */
function DaySessions({ day, originId = null, router, exercises, revision, origin = {} }: { day: DayLanes; originId?: string | null; router: ReturnType<typeof useRouter>; exercises?: (session: SessionFact) => React.ReactNode; revision: string; origin?: InsightsOrigin }) {
  const { sessions, orderKnown } = daySessions(day.strict);
  const clock = feelingClockNote(sessions);
  return <View style={styles.detail}>
    {sessions.length > 1 ? <AppText muted variant="footnote" numeric testID="insights-day-order">{orderKnown ? `${sessions.length} sesiones, en el orden en que empezaron.` : `${sessions.length} sesiones. No sabemos en qué orden fueron.`}</AppText> : null}
    {sessions.map(session => <SessionBlock key={session.sessionId} session={session} origin={session.sessionId === originId} router={router}>{exercises?.(session)}</SessionBlock>)}
    {clock ? <AppText muted variant="caption">{clock}</AppText> : null}
    <InsightRow label="Ver horarios y comidas de estas sesiones" spoken={`Ver horarios y comidas de todas las sesiones del ${dayLabel(day.date)}`} onPress={() => router.push({ pathname: '/(tabs)/train/insights/temporal', params: { ...origin, date: day.date, revision, ...(originId ? { session: originId } : {}) } })} />
  </View>;
}
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

function Strip({ days, lane }: { days: readonly DayLanes[]; lane: Lane }) {
  const { colors } = useOwnlevelTheme();
  const marks = stripMarks(days, lane);
  if (marks.length < 2) return null;
  return <View style={styles.block}>
    <AppText variant="headline">{lane === 'strict' ? 'Por debajo de la última vez' : 'Con registro inferior'}</AppText>
    <View accessible accessibilityRole="image" accessibilityLabel={stripSummary(marks, lane)} style={styles.strip} testID="insights-strip">
      {marks.map(mark => <View key={mark.date} testID={`strip-${mark.kind}`} style={[styles.stripSlot, { height: STRIP }]}>
        {mark.kind === 'value' ? <View style={{ height: Math.max(3, STRIP * mark.share), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.primary }} />
          : mark.kind === 'zero' ? <View style={{ height: 2, backgroundColor: colors.textMuted }} /> : null}
      </View>)}
    </View>
    <AppText muted variant="caption">Línea en la base: ninguno. Hueco: ese día no hubo comparación.</AppText>
  </View>;
}

/** Each row opens the evidence of its own comparison: read when that detail opens, never one read per row here. */
function ExerciseRows({ lane, session, partial, router, revision, origin, explain = false }: { lane: Lane; session: SessionFact; partial: PartialDayFact['sessions'][number] | undefined; router: ReturnType<typeof useRouter>; revision: string; origin: InsightsOrigin; explain?: boolean }) {
  const rows = lane === 'strict' ? session.exercises.map(row => ({ id: row.exerciseId, name: row.name, status: row.status as string, reason: row.reason, age: row.referenceAgeDays, date: row.referenceDate, reference: row.referenceSessionId }))
    : (partial?.exercises ?? []).map(row => ({ id: row.exerciseId, name: row.name, status: row.reading as string, reason: row.reason, age: row.referenceAgeDays, date: row.referenceDate, reference: row.referenceSessionId }));
  // A comparison names its compatible reference; a row without one says why it was not compared.
  const explained = new Set<string>();
  return <>{rows.map(row => {
    const explanation = explain && !explained.has(row.reason) ? reasonDetail(lane, row.reason) : null;
    explained.add(row.reason);
    const reference = referenceText(row.age, row.date);
    const unclassifiedReference = explain && !statusArrow(row.status) ? reference : null;
    const detail = statusArrow(row.status) ? reference : [reasonText(lane, row.reason), unclassifiedReference, explanation].filter(Boolean).join('. ');
    return <InsightRow key={row.id} label={row.name || 'Ejercicio'} detail={detail ?? undefined}
      value={`${statusArrow(row.status)} ${statusText(lane, row.status)}`} spoken={`${exerciseSentence(lane, row.name, row.status, row.reason, row.age, row.date)}${unclassifiedReference ? `. ${unclassifiedReference}` : ''}${explanation ? `. ${explanation}` : ''}. Ver evidencia y series`}
      onPress={() => router.push(insightsEvidenceHref({ session: session.sessionId, exercise: row.id, lane, reference: row.reference, result: row.status, revision }, origin))} />;
  })}</>;
}

function DayDetail({ day, model, router, origin, onMetric, onNutrition, onBody }: { day: DayLanes; model: InsightsSummary; router: ReturnType<typeof useRouter>; origin: InsightsOrigin } & DayActions) {
  const reduced = useReduceMotion();
  const lanes: Lane[] = dayLanes(day);
  return <Animated.View entering={reduced ? FadeIn.duration(motionDurations.fast) : FadeInDown.duration(motionDurations.base)} style={styles.detail}>
    <DaySessions day={day} router={router} revision={model.sourceRevision} origin={origin} exercises={session => lanes.map(lane => <View key={lane}>
      <Section title={LANE_TITLE[lane]} />
      <ExerciseRows lane={lane} session={session} partial={day.partial?.sessions.find(row => row.sessionId === session.sessionId)} router={router} revision={model.sourceRevision} origin={{ ...origin, date: day.date }} />
    </View>)} />
    <DayShared day={day} metrics={model.metrics} onMetric={onMetric} onNutrition={onNutrition} onBody={onBody} />
  </Animated.View>;
}

function DayRow({ day, model, router, origin, selected, onSelect, onMetric, onNutrition, onBody }: { day: DayLanes; model: InsightsSummary; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; selected: boolean; onSelect: (date: string | undefined) => void } & DayActions) {
  const [open, setOpen] = useState(selected);
  // The selected day comes from the route: coming back to it finds it open.
  const [seen, setSeen] = useState(selected);
  if (seen !== selected) { setSeen(selected); if (selected) setOpen(true); }
  const lane: Lane = day.strictCounts.comparable > 0 || !day.partialCounts?.comparable ? 'strict' : 'partial';
  const counts = lane === 'strict' ? day.strictCounts : day.partialCounts!;
  const value = counts.comparable ? `${counts.comparable} de ${counts.total}` : 'Sin comparar';
  const limit = lane === 'partial' && counts.comparable ? ', con contexto parcial' : '';
  return <View>
    <InsightRow label={dayLabel(day.date)} value={value} expanded={open} detail={counts.comparable ? `↑ ${counts.up}  = ${counts.same}  ↓ ${counts.down}${limit ? ' · contexto parcial' : ''}` : undefined}
      spoken={`${dayLabel(day.date)}${day.openDay ? ', día en curso' : ''}: ${counts.comparable ? `${counts.comparable} de ${counts.total} con resultado claro${limit}` : 'sin comparar'}`}
      onPress={() => { onSelect(open ? undefined : day.date); setOpen(!open); }} />
    {open ? <DayDetail day={day} model={model} router={router} origin={origin} onMetric={onMetric} onNutrition={onNutrition} onBody={onBody} /> : null}
  </View>;
}

const longDate = (date: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
function Exercises({ model, router }: { model: InsightsSummary; router: ReturnType<typeof useRouter> }) {
  const { firstDate, lastDate } = model.history;
  const lanes = [
    ...(model.facts.totals.comparable ? [{ lane: 'strict' as const, rows: model.facts.exercises }] : []),
    ...(model.partial.totals.total ? [{ lane: 'partial' as const, rows: model.partial.exercises }] : []),
  ];
  if (!lanes.length) return <AppText muted>{nothingComparable(model)}</AppText>;
  return <>
    {/* #518 · What each count is over: the completed sessions read, with their dates when the read says them. */}
    <AppText muted variant="footnote" numeric testID="insights-exercises-period">Cada fila cuenta los registros de ese ejercicio en sesiones terminadas{firstDate && lastDate ? `, del ${longDate(firstDate)} al ${longDate(lastDate)}` : ''}, y cómo quedó cada uno frente a su vez anterior.</AppText>
    {lanes.map(({ lane, rows }) => <View key={lane} style={styles.block}>
    <Section title={LANE_TITLE[lane]} />
    {lane === 'partial' ? <AppText muted variant="footnote">{PARTIAL_LIMIT}</AppText> : null}
    {rows.map(row => { const unclear = unclearCount(lane, row); return <InsightRow key={row.exerciseId} label={row.name || 'Ejercicio'} detail={`${exposuresText(row.exposures)}\n${summaryText(lane, row)}${unclear > 0 ? `  · ${unclear} sin resultado claro` : ''}`} spoken={summarySpoken(lane, row)}
      onPress={() => router.push({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: row.exerciseId } })} />; })}
  </View>)}</>;
}

/** #518 · One method's result: the clear count (the screen's one hero), the arrows, and what stayed outside, said apart. */
function LaneResult({ lane, counts, hero }: { lane: Lane; counts: Counts; hero: boolean }) {
  const spoken = `${counts.comparable} de ${counts.total} ${heroCaption(lane)}`;
  return <View style={styles.block} testID={`insights-result-${lane}`}>
    <AppText numeric variant={hero ? 'heroNumber' : 'title2'} accessibilityLabel={spoken}>{counts.comparable} de {counts.total}</AppText>
    <AppText muted>{heroCaption(lane)}</AppText>
    {readingRows(lane, counts).slice(0, 3).map(row => <FactRow key={row.label} arrow={row.arrow} label={row.label} value={row.value} spoken={row.spoken} />)}
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
  const reduced = useReduceMotion();
  const [open, setOpen] = useState(false);
  const clock = feelingClockNote(sessions);
  return <View testID="insights-context">
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="Sensaciones, comidas y métricas" testID="insights-context-toggle"
      onPress={() => { haptics.selection(); setOpen(current => !current); }} style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
      <View style={styles.flex}>
        <AppText variant="headline">Sensaciones, comidas y métricas</AppText>
        <AppText muted variant="footnote">Antes de {sessions.length > 1 ? 'cada sesión' : 'la sesión'} y lo registrado todo el día</AppText>
      </View>
      <AppIcon color={colors.textMuted} name={open ? 'chevronDown' : 'chevronRight'} size={15} />
    </Pressable>
    {open ? <View style={styles.detail} testID="insights-context-open">
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
        onPress={() => router.push({ pathname: '/(tabs)/train/insights/temporal', params: { ...origin, date: day.date, ...(sessionId ? { session: sessionId } : {}), revision: model.sourceRevision } })} />
      <DayShared day={day} metrics={model.metrics} {...actions} />
    </View> : null}
  </View>;
}

/** #518 · The chosen session: what and when, its result per method, its exercises to open, then the folded context. */
function SessionReading({ focus, model, router, origin, actions, onOther }: { focus: NonNullable<ReturnType<typeof focusOf>>; model: InsightsSummary; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; actions: DayActions; onOther: (sessionId: string) => void }) {
  const lanes = sessionLanes(focus.session, focus.partial);
  const others = daySessions(focus.day.strict).sessions.filter(row => row.sessionId !== focus.session.sessionId);
  const none = withoutComparison(focus.session, focus.partial);
  return <View style={styles.block} testID="insights-session">
    <Heading level={1}>{sessionName(focus.session)}</Heading>
    <AppText muted numeric>{dayLabel(focus.day.date)} de {focus.day.date.slice(0, 4)} · {sessionTime(focus.session)}</AppText>
    {others.length ? <View testID="insights-day-others">
      <AppText muted variant="footnote" numeric>{others.length + 1} sesiones ese día. Cada una tiene su resultado; lo registrado todo el día es el mismo.</AppText>
      {others.map(other => <InsightRow key={other.sessionId} label={`Ver ${sessionName(other)}`} detail={sessionTime(other)} spoken={`Ver la otra sesión de ese día: ${sessionName(other)}, ${sessionTime(other)}`} onPress={() => onOther(other.sessionId)} />)}
    </View> : null}
    {none ? <View style={styles.block} testID="insights-session-none"><Heading level={2}>Todavía sin comparaciones</Heading><AppText muted>{none}</AppText></View> : null}
    {lanes.map(({ lane, counts }, index) => <View key={lane} style={styles.block} testID={`insights-session-lane-${lane}`}>
      <Heading level={2}>{LANE_TITLE[lane]}</Heading>
      <LaneResult lane={lane} counts={counts} hero={index === 0} />
      {lane === 'partial' ? <AppText muted variant="footnote" testID="insights-partial-limit">{PARTIAL_LIMIT}</AppText> : null}
      <Section title="Ejercicios · tocá uno para ver tus series" />
      <ExerciseRows explain lane={lane} session={focus.session} partial={focus.partial ?? undefined} router={router} revision={model.sourceRevision} origin={{ ...origin, revision: model.sourceRevision }} />
    </View>)}
    <ContextFold day={focus.day} sessions={[focus.session]} model={model} router={router} origin={origin} sessionId={focus.session.sessionId} actions={actions} />
  </View>;
}

/** #518 · Without a chosen session: the latest day with a clear result, read the same way, every session of it in order. */
function DayReading({ hero, model, router, origin, actions }: { hero: NonNullable<ReturnType<typeof heroOf>>; model: InsightsSummary; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; actions: DayActions }) {
  const { day } = hero;
  const { sessions, orderKnown } = daySessions(day.strict);
  const lanes = [hero.lane, ...dayLanes(day).filter(lane => lane !== hero.lane)];
  const rowOrigin = { ...origin, date: day.date };
  return <>
    <View style={styles.block} testID="insights-hero">
      <Heading level={1}>{dayLabel(day.date)}{day.openDay ? ' · en curso' : ''}</Heading>
      {sessions.length > 1 ? <AppText muted variant="footnote" numeric testID="insights-day-order">{orderKnown ? `${sessions.length} sesiones, en el orden en que empezaron.` : `${sessions.length} sesiones. No sabemos en qué orden fueron.`}</AppText> : null}
      {sessions.map(session => { const name = sessionName(session), time = sessionTime(session); return <InsightRow key={session.sessionId} heading label={name} detail={time} spoken={`Abrir sesión ${name}, ${time}`}
        onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: session.sessionId } })} />; })}
      {lanes.map((lane, index) => { const counts = lane === 'strict' ? day.strictCounts : day.partialCounts; if (!counts?.total) return null; return <View key={lane} style={styles.block} testID={`insights-day-lane-${lane}`}>
        {lanes.length > 1 ? <Heading level={2}>{LANE_TITLE[lane]}</Heading> : null}
        <LaneResult lane={lane} counts={counts} hero={index === 0} />
        {lane === 'partial' ? <AppText muted variant="footnote" testID="insights-partial-limit">{PARTIAL_LIMIT}</AppText> : null}
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
  const reduced = useReduceMotion();
  const router = useRouter();
  const params = useLocalSearchParams();
  const view: View_ = params.view === 'exercises' && !validSession(params.session) ? 'exercises' : 'days';
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
  const selectDay = (date: string | undefined) => router.setParams({ date });
  const setView = (value: View_) => { haptics.selection(); router.setParams({ view: value }); };
  const setFamily = (value: FamilyFilter) => { haptics.selection(); router.setParams({ family: value }); };
  const toggleRelations = () => { haptics.selection(); router.setParams({ relations: relationsOpen ? '0' : '1' }); };
  const refreshControl = <RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />;
  const returnToSession = origin.fromSession && focusId ? <Button label="Volver a la sesión" variant="quiet" onPress={() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/(tabs)/train/history/[id]', params: { id: focusId } });
  }} /> : null;
  const scroll = (children: React.ReactNode) => <ScrollView testID="insights-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} refreshControl={refreshControl}><ReturnToProgress/>{children}{returnToSession}</ScrollView>;

  if (state.status === 'loading' && !data) return scroll(<View testID="insights-loading" style={styles.block}><SkeletonBlock height={44} /><SkeletonBlock height={120} /><SkeletonBlock height={176} /><SkeletonBlock height={220} /></View>);
  const failed = <UnavailableState title="Uy, no pudimos leer tus datos" description="Tranqui: está todo guardado." action={<Button label="Reintentar" onPress={() => void refresh()} />} />;
  // Contradictory rows are not an empty history: it is shown like a failed read.
  if (!data || data.integrity !== 'valid' || data.partial.integrity !== 'valid') return scroll(failed);
  if (data.history.sessions === 0 && !focusId) return scroll(<View style={styles.block} testID="insights-empty">
    <Heading level={2}>Todavía no hay sesiones</Heading>
    <AppText muted>Con dos entrenamientos del mismo ejercicio empieza a compararse.</AppText>
    <ExampleFrame><AppText muted variant="title1" numeric>4 de 6</AppText><AppText muted variant="footnote">ejercicios comparables</AppText></ExampleFrame>
  </View>);

  const hero = focusId ? null : heroOf(days);
  const stripLane = focus?.lane ?? hero?.lane ?? primaryLane(data);
  return scroll(<>
    {origin.explore&&origin.asOf&&origin.week?<Button label={origin.compare ? 'Volver a comparar semanas' : 'Volver a la semana'} variant="secondary" onPress={()=>router.navigate(explorationHref(origin.asOf!,origin.week,origin.revision,origin))}/>:null}
    {origin.explore&&origin.revision&&origin.revision!==data.sourceRevision?<AppText>Los registros cambiaron desde la semana. Esta lectura completa está actualizada.</AppText>:null}
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    {origin.fromSession && origin.revision && origin.revision !== data.sourceRevision ? <AppText muted testID="insights-session-revised">Los registros cambiaron desde el origen. Esta lectura completa está actualizada.</AppText>
      : changedWhileOpen ? <AppText muted accessibilityLiveRegion="polite" testID="insights-revised-now">Tus registros cambiaron mientras mirabas. Esta lectura está actualizada.</AppText> : null}
    {!focusId ? <ExerciseSegmented accessibilityLabel="Ver por días o por ejercicios" value={view} options={VIEWS} onChange={setView} /> : null}
    {view === 'exercises' ? <Exercises model={data} router={router} /> : <>
      {/* #518 · First what and when, the result and the exercises; then the folded context; then the history and the rest. */}
      {focus ? <SessionReading focus={focus} model={data} router={router} origin={origin} actions={actions} onOther={openOther} />
        : focusLoading ? <View testID="insights-session-loading" style={styles.block}><SkeletonBlock height={120} /><SkeletonBlock height={176} /></View>
        : focusFailed ? <InlineUnavailable message="No pudimos traer los hechos de esta sesión." actionLabel="Reintentar" onAction={() => setFocusAttempt(current => current + 1)} />
        : focusId ? <View style={styles.block} testID="insights-session-absent">
          <Heading level={2}>Esta sesión todavía no aparece</Heading>
          <AppText muted>Esta lectura no la incluye. Puede haber cambiado o haberse eliminado. Podés actualizar o volver al detalle.</AppText>
          <Button label="Actualizar" variant="secondary" onPress={() => void refresh()} />
        </View> : null}
      {!focusId ? <>
        {hero ? <DayReading hero={hero} model={data} router={router} origin={origin} actions={actions} /> : <View style={styles.block} testID="insights-nothing">
          <Heading level={2}>Todavía sin comparaciones</Heading>
          <AppText muted>{nothingComparable(data)}</AppText>
        </View>}
        <View>
          <Section title="Historial" />
          {days.map(day => <DayRow key={day.date} day={day} model={data} router={router} origin={origin} selected={!focusId && focusDate === day.date} onSelect={selectDay} onMetric={openMetric} onNutrition={openNutrition} onBody={openBody} />)}
          {next ? <Button label={morePhase === 'loading' ? 'Cargando…' : 'Ver más días'} variant="secondary" disabled={morePhase === 'loading'} onPress={() => void loadMore()} /> : null}
          {morePhase === 'failed' ? <InlineUnavailable message="No pudimos traer más días." actionLabel="Reintentar" onAction={() => void loadMore()} /> : null}
          {pagesDropped ? <AppText muted variant="footnote" accessibilityLiveRegion="polite" testID="insights-changed">Tus datos cambiaron, así que actualizamos la lista.</AppText> : null}
          <AppText muted variant="caption" numeric style={styles.coverage}>{data.history.trainingDays} días entrenados en total</AppText>
        </View>
        {/* Below the history until #519 redesigns the charts of Progreso. */}
        <Strip days={days} lane={stripLane} />
        {/* Its own read, on a tap: the last three whole months, facts only. */}
        <InsightRow label="Últimos 3 meses" detail="Entrenamiento, sensaciones, comidas y peso, con sus fechas" spoken="Últimos 3 meses: entrenamiento, sensaciones, comidas y peso, con sus fechas"
          onPress={() => { haptics.selection(); router.push(withProgressOrigin('/(tabs)/train/insights/period',origin)); }} />
        <InsightRow label="Cómo terminaste" detail="Energía y fatiga al terminar, según cómo empezaste" spoken="Cómo terminaste: energía y fatiga al terminar, según cómo empezaste"
          onPress={() => { haptics.selection(); router.push(withProgressOrigin('/(tabs)/train/insights/feelings',origin)); }} />
        {data.relations.strict.outcomeDays || data.relations.partial.outcomeDays ? <View style={styles.block}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: relationsOpen }} accessibilityLabel={`Para mirar con calma, ${data.relations.partial.outcomeDays ? data.relations.partial.candidatesEvaluated : data.relations.strict.candidatesEvaluated} relaciones`} onPress={toggleRelations}
            style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
            <Heading level={2} style={styles.flex}>Para mirar con calma</Heading>
            <AppIcon color={colors.textMuted} name={relationsOpen ? 'chevronDown' : 'chevronRight'} size={15} />
          </Pressable>
          {/* Its own read, only once asked for. */}
          {relationsOpen ? <Relations client={client} family={family} onFamily={setFamily} router={router} facts={data} onStale={refresh} /> : null}
        </View> : null}
      </> : <InsightRow label="Ver todas las sesiones" spoken="Ver todas las sesiones en Comparaciones" onPress={() => router.setParams({ session: undefined, fromSession: undefined, view: undefined })} />}
    </>}
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
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
  note: { paddingVertical: spacing.xs },
});
