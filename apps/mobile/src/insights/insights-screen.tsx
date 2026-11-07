import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsDays, fetchInsightsRelations, fetchInsightsSummary, type DayFact, type InsightsSummary, type PartialDayFact, type PartialRelationSummary, type RelationSummary, type SessionFact } from '@/api/performance-insights';
import { AppIcon, AppText, Button, ChipGroup, ExampleFrame, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, motionDurations, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { useProgressResource } from '@/progress/use-progress-resource';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { EXPLAIN_DOWN, FAMILY_OPTIONS, LANE_TITLE, NUTRITION_SCOPE, PARTIAL_LIMIT, contextRows, dayLabel, dayLanes, daySessions, referenceText, sessionLanes, feelingClockNote, nutritionRows, sessionName, sessionRows, sessionTime, exerciseSentence, focusOf, heroCaption, heroOf, joinDays, nextDate, nothingComparable, primaryLane, readingRows, reasonText, relationGroups, relationName, relationState, sameRead, statusArrow, statusText, stripMarks, stripSummary, summarySpoken, summaryText, type ContextRow, type DayLanes, type FamilyFilter, type Lane } from './insights-model';
import { InsightRow } from './insight-row';
import { dayWeightHref, insightsEvidenceHref, insightsOriginOf, metricTrendHref, nutritionDayHref, validSession, type InsightsOrigin } from './navigation';

type View_ = 'days' | 'exercises';
const VIEWS = [{ value: 'days', label: 'Días' }, { value: 'exercises', label: 'Ejercicios' }] as const;
const STRIP = 72;
const loadSummary = (client: MobileApiClient, signal: AbortSignal) => fetchInsightsSummary(client, signal);
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
function DaySessions({ day, originId = null, router, exercises }: { day: DayLanes; originId?: string | null; router: ReturnType<typeof useRouter>; exercises?: (session: SessionFact) => React.ReactNode }) {
  const { sessions, orderKnown } = daySessions(day.strict);
  const clock = feelingClockNote(sessions);
  return <View style={styles.detail}>
    {sessions.length > 1 ? <AppText muted variant="footnote" numeric testID="insights-day-order">{orderKnown ? `${sessions.length} sesiones, en el orden en que empezaron.` : `${sessions.length} sesiones. No sabemos en qué orden fueron.`}</AppText> : null}
    {sessions.map(session => <SessionBlock key={session.sessionId} session={session} origin={session.sessionId === originId} router={router}>{exercises?.(session)}</SessionBlock>)}
    {clock ? <AppText muted variant="caption">{clock}</AppText> : null}
  </View>;
}
type DayActions = { onMetric: (metricId: string, date: string) => void; onNutrition: (date: string) => void; onBody: (date: string) => void };
/** What belongs to the whole day, shown once: never repeated under each session as if each had its own. */
function DayShared({ day, metrics, onMetric, onNutrition, onBody }: { day: DayLanes; metrics: InsightsSummary['metrics'] } & DayActions) {
  const rows = contextRows(day.strict, metrics);
  return <View testID="insights-day-shared">
    <Section title="Alimentación registrada ese día" />
    <ContextList rows={nutritionRows(day.strict)} />
    <AppText muted variant="caption" style={styles.note}>{NUTRITION_SCOPE}</AppText>
    <InsightRow label="Ver Nutrición de ese día" spoken={`Ver Nutrición del ${dayLabel(day.date)}`} onPress={() => onNutrition(day.date)} />
    {rows.length ? <><Section title="Métricas de ese día" /><ContextList rows={rows} date={day.date} onMetric={onMetric} onBody={onBody} /></> : null}
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
function ExerciseRows({ lane, session, partial, router, revision, origin }: { lane: Lane; session: SessionFact; partial: PartialDayFact['sessions'][number] | undefined; router: ReturnType<typeof useRouter>; revision: string; origin: InsightsOrigin }) {
  const rows = lane === 'strict' ? session.exercises.map(row => ({ id: row.exerciseId, name: row.name, status: row.status as string, reason: row.reason, age: row.referenceAgeDays, date: row.referenceDate, reference: row.referenceSessionId }))
    : (partial?.exercises ?? []).map(row => ({ id: row.exerciseId, name: row.name, status: row.reading as string, reason: row.reason, age: row.referenceAgeDays, date: row.referenceDate, reference: row.referenceSessionId }));
  // A comparison names its compatible reference; a row without one says why it was not compared.
  return <>{rows.map(row => <InsightRow key={row.id} label={row.name || 'Ejercicio'} detail={statusArrow(row.status) ? referenceText(row.age, row.date) ?? undefined : reasonText(lane, row.reason)}
    value={`${statusArrow(row.status)} ${statusText(lane, row.status)}`} spoken={exerciseSentence(lane, row.name, row.status, row.reason, row.age, row.date)}
    onPress={() => router.push(insightsEvidenceHref({ session: session.sessionId, exercise: row.id, lane, reference: row.reference, result: row.status, revision }, origin))} />)}</>;
}

function DayDetail({ day, model, router, origin, onMetric, onNutrition, onBody }: { day: DayLanes; model: InsightsSummary; router: ReturnType<typeof useRouter>; origin: InsightsOrigin } & DayActions) {
  const reduced = useReduceMotion();
  const lanes: Lane[] = dayLanes(day);
  return <Animated.View entering={reduced ? FadeIn.duration(motionDurations.fast) : FadeInDown.duration(motionDurations.base)} style={styles.detail}>
    <DaySessions day={day} router={router} exercises={session => lanes.map(lane => <View key={lane}>
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
  const limit = lane === 'partial' && counts.comparable ? ' con contexto parcial' : '';
  return <View>
    <InsightRow label={dayLabel(day.date)} value={value} expanded={open} detail={counts.comparable ? `↑ ${counts.up}  = ${counts.same}  ↓ ${counts.down}${limit ? ' · contexto parcial' : ''}` : undefined}
      spoken={`${dayLabel(day.date)}${day.openDay ? ', día en curso' : ''}: ${counts.comparable ? `${counts.comparable} de ${counts.total} comparables${limit}` : 'sin comparar'}`}
      onPress={() => { onSelect(open ? undefined : day.date); setOpen(!open); }} />
    {open ? <DayDetail day={day} model={model} router={router} origin={origin} onMetric={onMetric} onNutrition={onNutrition} onBody={onBody} /> : null}
  </View>;
}

function Exercises({ model, router }: { model: InsightsSummary; router: ReturnType<typeof useRouter> }) {
  const lanes = [
    ...(model.facts.totals.comparable ? [{ lane: 'strict' as const, rows: model.facts.exercises }] : []),
    ...(model.partial.totals.total ? [{ lane: 'partial' as const, rows: model.partial.exercises }] : []),
  ];
  if (!lanes.length) return <AppText muted>{nothingComparable(model)}</AppText>;
  return <>{lanes.map(({ lane, rows }) => <View key={lane} style={styles.block}>
    <Section title={LANE_TITLE[lane]} />
    {lane === 'partial' ? <AppText muted variant="footnote">{PARTIAL_LIMIT}</AppText> : null}
    {rows.map(row => <InsightRow key={row.exerciseId} label={row.name || 'Ejercicio'} detail={`${summaryText(lane, row)}  · ${row.exposures} veces`} spoken={summarySpoken(lane, row)}
      onPress={() => router.push({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: row.exerciseId } })} />)}
  </View>)}</>;
}

function RelationList({ lane, title, items, metrics, family, router, evaluated }: { lane: Lane; title: string; items: readonly (RelationSummary | PartialRelationSummary)[]; metrics: InsightsSummary['metrics']; family: FamilyFilter; router: ReturnType<typeof useRouter>; evaluated: number }) {
  const [showWaiting, setShowWaiting] = useState(false);
  const groups = relationGroups([...items], family);
  const row = (item: RelationSummary | PartialRelationSummary) => <InsightRow key={item.id} label={relationName(item, metrics)} value={relationState(item)}
    spoken={`${relationName(item, metrics)}: ${relationState(item)}${lane === 'partial' ? ', con contexto parcial' : ''}`}
    onPress={() => router.push({ pathname: '/(tabs)/train/insights/[relation]', params: { relation: item.id } })} />;
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
  const view: View_ = params.view === 'exercises' ? 'exercises' : 'days';
  const family = (FAMILY_OPTIONS.find(option => option.value === params.family)?.value ?? 'all') as FamilyFilter;
  const relationsOpen = params.relations === '1';
  const origin = insightsOriginOf(params);
  const focusId = validSession(params.session) ? params.session : null, focusDate = origin.date ?? null;
  const { state, data, refresh } = useProgressResource(client, 'performance-insights', loadSummary);
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
  const openMetric = (metricId: string, date: string) => { haptics.selection(); router.push(metricTrendHref(metricId, date, { ...origin, date })); };
  const openNutrition = (date: string) => { haptics.selection(); router.push(nutritionDayHref(date, { ...origin, date })); };
  const openBody = (date: string) => { haptics.selection(); router.push(dayWeightHref(date, { ...origin, date })); };
  const selectDay = (date: string | undefined) => router.setParams({ date });
  const setView = (value: View_) => { haptics.selection(); router.setParams({ view: value }); };
  const setFamily = (value: FamilyFilter) => { haptics.selection(); router.setParams({ family: value }); };
  const toggleRelations = () => { haptics.selection(); router.setParams({ relations: relationsOpen ? '0' : '1' }); };
  const refreshControl = <RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />;
  const scroll = (children: React.ReactNode) => <ScrollView testID="insights-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} refreshControl={refreshControl}>{children}</ScrollView>;

  if (state.status === 'loading' && !data) return scroll(<View testID="insights-loading" style={styles.block}><SkeletonBlock height={44} /><SkeletonBlock height={120} /><SkeletonBlock height={176} /><SkeletonBlock height={220} /></View>);
  const failed = <UnavailableState title="Uy, no pudimos leer tus datos" description="Tranqui: está todo guardado." action={<Button label="Reintentar" onPress={() => void refresh()} />} />;
  // Contradictory rows are not an empty history: it is shown like a failed read.
  if (!data || data.integrity !== 'valid' || data.partial.integrity !== 'valid') return scroll(failed);
  if (data.history.sessions === 0) return scroll(<View style={styles.block} testID="insights-empty">
    <Heading level={2}>Todavía no hay sesiones</Heading>
    <AppText muted>Con dos entrenamientos del mismo ejercicio empieza a compararse.</AppText>
    <ExampleFrame><AppText muted variant="title1" numeric>4 de 6</AppText><AppText muted variant="footnote">ejercicios comparables</AppText></ExampleFrame>
  </View>);

  const hero = focusId ? null : heroOf(days);
  const stripLane = focus?.lane ?? hero?.lane ?? primaryLane(data);
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <ExerciseSegmented accessibilityLabel="Ver por días o por ejercicios" value={view} options={VIEWS} onChange={setView} />
    {view === 'exercises' ? <Exercises model={data} router={router} /> : <>
      {focus ? <View style={styles.block} testID="insights-session">
        <AppText muted numeric>{dayLabel(focus.day.date)}{focus.day.openDay ? ' · en curso' : ''} · {sessionName(focus.session)} · {sessionTime(focus.session)}</AppText>
        {focus.counts.comparable ? <AppText numeric variant="heroNumber" accessibilityLabel={`${focus.counts.comparable} de ${focus.counts.total} ${heroCaption(focus.lane)}`}>{focus.counts.comparable} de {focus.counts.total}</AppText> : <Heading level={2}>Todavía sin comparaciones</Heading>}
        {focus.counts.comparable ? <AppText muted>{heroCaption(focus.lane)}</AppText> : null}
        {/* Without a comparison the results still count: mixed evidence and no comparison stay visible, with their method. */}
        {focus.counts.total ? <>
          {focus.counts.comparable ? null : <AppText muted numeric variant="footnote" testID="insights-session-denominator">0 de {focus.counts.total} {heroCaption(focus.lane)}</AppText>}
          {readingRows(focus.lane, focus.counts).map(row => <FactRow key={row.label} arrow={row.arrow} label={row.label} value={row.value} spoken={row.spoken} />)}
        </> : null}
        {focus.counts.down ? <AppText muted variant="footnote">{EXPLAIN_DOWN}</AppText> : null}
        {focus.lane === 'partial' ? <AppText muted variant="footnote" testID="insights-partial-limit">{PARTIAL_LIMIT}</AppText> : null}
        {/* Each method apart, with its own words and denominator: the first one's counts are above, a second one brings its own. */}
        {sessionLanes(focus.session, focus.partial).map(({ lane, counts }) => <View key={lane} testID={`insights-session-lane-${lane}`}>
          <Section title={LANE_TITLE[lane]} />
          {lane !== focus.lane ? <>
            <AppText muted numeric variant="footnote">{counts.comparable} de {counts.total} {heroCaption(lane)}</AppText>
            {readingRows(lane, counts).map(row => <FactRow key={row.label} arrow={row.arrow} label={row.label} value={row.value} spoken={row.spoken} />)}
            {lane === 'partial' ? <AppText muted variant="footnote">{PARTIAL_LIMIT}</AppText> : null}
          </> : null}
          <ExerciseRows lane={lane} session={focus.session} partial={focus.partial ?? undefined} router={router} revision={data.sourceRevision} origin={origin} />
        </View>)}
        <Section title={focus.day.strict.sessions.length > 1 ? 'Sesiones de ese día' : 'Esta sesión'} />
        <DaySessions day={focus.day} originId={focus.session.sessionId} router={router} />
        <DayShared day={focus.day} metrics={data.metrics} onMetric={openMetric} onNutrition={openNutrition} onBody={openBody} />
      </View> : focusLoading ? <View testID="insights-session-loading" style={styles.block}><SkeletonBlock height={120} /><SkeletonBlock height={176} /></View>
        : focusFailed ? <InlineUnavailable message="No pudimos traer los hechos de esta sesión." actionLabel="Reintentar" onAction={() => setFocusAttempt(current => current + 1)} />
        : focusId ? <View style={styles.block} testID="insights-session-absent">
          <Heading level={2}>Esta sesión todavía no aparece</Heading>
          <AppText muted>Está guardada, pero esta lectura no la incluye. Podés actualizar en un rato.</AppText>
          <Button label="Actualizar" variant="secondary" onPress={() => void refresh()} />
        </View> : null}
      {hero ? <View style={styles.block} testID="insights-hero">
        <AppText muted>{dayLabel(hero.day.date)}{hero.day.openDay ? ' · en curso' : ''}</AppText>
        <AppText numeric variant="heroNumber" accessibilityLabel={`${hero.counts.comparable} de ${hero.counts.total} ${heroCaption(hero.lane)}`}>{hero.counts.comparable} de {hero.counts.total}</AppText>
        <AppText muted>{heroCaption(hero.lane)}</AppText>
        {readingRows(hero.lane, hero.counts).map(row => <FactRow key={row.label} arrow={row.arrow} label={row.label} value={row.value} spoken={row.spoken} />)}
        {hero.counts.down ? <AppText muted variant="footnote">{EXPLAIN_DOWN}</AppText> : null}
        {hero.lane === 'partial' ? <AppText muted variant="footnote" testID="insights-partial-limit">{PARTIAL_LIMIT}</AppText> : null}
      </View> : focusId ? null : <View style={styles.block} testID="insights-nothing">
        <Heading level={2}>Todavía sin comparaciones</Heading>
        <AppText muted>{nothingComparable(data)}</AppText>
      </View>}
      {hero ? <View testID="insights-hero-context">
        <Section title={hero.day.strict.sessions.length > 1 ? 'Sesiones de ese día' : 'Esa sesión'} />
        <DaySessions day={hero.day} router={router} />
        <DayShared day={hero.day} metrics={data.metrics} onMetric={openMetric} onNutrition={openNutrition} onBody={openBody} />
      </View> : null}
      <Strip days={days} lane={stripLane} />
      <View>
        <Section title="Días" />
        {days.map(day => <DayRow key={day.date} day={day} model={data} router={router} origin={origin} selected={!focusId && focusDate === day.date} onSelect={selectDay} onMetric={openMetric} onNutrition={openNutrition} onBody={openBody} />)}
        {next ? <Button label={morePhase === 'loading' ? 'Cargando…' : 'Ver más días'} variant="secondary" disabled={morePhase === 'loading'} onPress={() => void loadMore()} /> : null}
        {morePhase === 'failed' ? <InlineUnavailable message="No pudimos traer más días." actionLabel="Reintentar" onAction={() => void loadMore()} /> : null}
        {pagesDropped ? <AppText muted variant="footnote" accessibilityLiveRegion="polite" testID="insights-changed">Tus datos cambiaron, así que actualizamos la lista.</AppText> : null}
        <AppText muted variant="caption" numeric style={styles.coverage}>{data.history.trainingDays} días entrenados en total</AppText>
      </View>
      {/* Its own read, on a tap: the end answers described, never next to the training results as if they were one. */}
      <InsightRow label="Cómo terminaste" detail="Energía y fatiga al terminar, según cómo empezaste" spoken="Cómo terminaste: energía y fatiga al terminar, según cómo empezaste"
        onPress={() => { haptics.selection(); router.push('/(tabs)/train/insights/feelings'); }} />
      {data.relations.strict.outcomeDays || data.relations.partial.outcomeDays ? <View style={styles.block}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: relationsOpen }} accessibilityLabel={`Para mirar con calma, ${data.relations.partial.outcomeDays ? data.relations.partial.candidatesEvaluated : data.relations.strict.candidatesEvaluated} relaciones`} onPress={toggleRelations}
          style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
          <Heading level={2} style={styles.flex}>Para mirar con calma</Heading>
          <AppIcon color={colors.textMuted} name={relationsOpen ? 'chevronDown' : 'chevronRight'} size={15} />
        </Pressable>
        {relationsOpen ? <Relations client={client} family={family} onFamily={setFamily} router={router} facts={data} onStale={refresh} /> : null}
      </View> : null}
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
