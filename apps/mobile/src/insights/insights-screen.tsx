import { useMemo, useState } from 'react';
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
import { EXPLAIN_DOWN, FAMILY_OPTIONS, LANE_TITLE, PARTIAL_LIMIT, contextRows, dayLabel, exerciseSentence, heroCaption, heroOf, joinDays, nothingComparable, primaryLane, readingRows, reasonText, relationGroups, relationName, relationState, statusArrow, statusText, stripMarks, stripSummary, summarySpoken, summaryText, type DayLanes, type FamilyFilter, type Lane } from './insights-model';

type View_ = 'days' | 'exercises';
const VIEWS = [{ value: 'days', label: 'Días' }, { value: 'exercises', label: 'Ejercicios' }] as const;
const STRIP = 72;
const loadSummary = (client: MobileApiClient, signal: AbortSignal) => fetchInsightsSummary(client, signal);
const loadRelations = (client: MobileApiClient, signal: AbortSignal) => fetchInsightsRelations(client, signal);

/** Label and value on one line; with large text they stack and wrap instead of squeezing (IDENTIDAD.md § Dynamic Type). */
export function FactRow({ label, value, spoken, arrow }: { label: string; value: string | number; spoken?: string; arrow?: string }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  return <View accessible accessibilityLabel={spoken ?? `${label}: ${value}`} style={[styles.fact, stacked && styles.factStacked, { borderColor: colors.border }]}>
    <AppText style={!stacked ? styles.flex : undefined}>{arrow ? `${arrow}  ` : ''}{label}</AppText>
    <AppText muted numeric style={!stacked ? styles.factValue : undefined}>{value}</AppText>
  </View>;
}
const Section = ({ title }: { title: string }) => <AppText muted variant="footnote" style={styles.section} accessibilityRole="header">{title}</AppText>;

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

function ExerciseRows({ lane, session, partial, router }: { lane: Lane; session: SessionFact; partial: PartialDayFact['sessions'][number] | undefined; router: ReturnType<typeof useRouter> }) {
  const { colors } = useOwnlevelTheme();
  const rows = lane === 'strict' ? session.exercises.map(row => ({ id: row.exerciseId, name: row.name, status: row.status as string, reason: row.reason, age: row.referenceAgeDays }))
    : (partial?.exercises ?? []).map(row => ({ id: row.exerciseId, name: row.name, status: row.reading as string, reason: row.reason, age: row.referenceAgeDays }));
  return <>{rows.map(row => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={exerciseSentence(lane, row.name, row.status, row.reason, row.age)}
    onPress={() => router.push({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: row.id, ...(session.routineId ? { routineId: session.routineId } : {}) } })}
    style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.55 : 1 }]}>
    <View style={styles.flex}>
      <AppText numberOfLines={2}>{row.name || 'Ejercicio'}</AppText>
      {!statusArrow(row.status) ? <AppText muted variant="footnote">{reasonText(lane, row.reason)}</AppText> : null}
    </View>
    <AppText muted variant="subheadline" numeric>{statusArrow(row.status)} {statusText(lane, row.status)}</AppText>
    <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
  </Pressable>)}</>;
}

function DayDetail({ day, model, router }: { day: DayLanes; model: InsightsSummary; router: ReturnType<typeof useRouter> }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const lanes: Lane[] = [...(day.strictCounts.comparable > 0 ? ['strict' as const] : []), ...(day.partialCounts?.total ? ['partial' as const] : [])];
  return <Animated.View entering={reduced ? FadeIn.duration(motionDurations.fast) : FadeInDown.duration(motionDurations.base)} style={styles.detail}>
    {day.strict.sessions.map(session => <View key={session.sessionId} style={styles.block}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir sesión ${session.routineName ?? session.name ?? ''}`.trim()} onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: session.sessionId } })}
        style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.55 : 1 }]}>
        <AppText variant="headline" style={styles.flex}>{session.routineName ?? session.name ?? 'Sesión'}</AppText>
        <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
      </Pressable>
      {lanes.map(lane => <View key={lane}>
        <Section title={LANE_TITLE[lane]} />
        <ExerciseRows lane={lane} session={session} partial={day.partial?.sessions.find(row => row.sessionId === session.sessionId)} router={router} />
      </View>)}
    </View>)}
    <Section title="Alrededor de ese entrenamiento" />
    {contextRows(day.strict, model.metrics).map(row => <FactRow key={row.key} label={row.label} value={row.value} />)}
  </Animated.View>;
}

function DayRow({ day, model, router }: { day: DayLanes; model: InsightsSummary; router: ReturnType<typeof useRouter> }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const [open, setOpen] = useState(false);
  const lane: Lane = day.strictCounts.comparable > 0 || !day.partialCounts?.comparable ? 'strict' : 'partial';
  const counts = lane === 'strict' ? day.strictCounts : day.partialCounts!;
  const value = counts.comparable ? `${counts.comparable} de ${counts.total}` : 'Sin comparar';
  const limit = lane === 'partial' && counts.comparable ? ' con contexto parcial' : '';
  return <View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${dayLabel(day.date)}${day.openDay ? ', día en curso' : ''}: ${counts.comparable ? `${counts.comparable} de ${counts.total} comparables${limit}` : 'sin comparar'}`}
      onPress={() => setOpen(current => !current)} style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
      <View style={styles.flex}>
        <AppText>{dayLabel(day.date)}</AppText>
        {counts.comparable ? <AppText muted numeric variant="footnote">↑ {counts.up}  = {counts.same}  ↓ {counts.down}{limit ? ' · contexto parcial' : ''}</AppText> : null}
      </View>
      <AppText muted numeric variant="subheadline">{value}</AppText>
      <AppIcon color={colors.textMuted} name={open ? 'chevronDown' : 'chevronRight'} size={15} />
    </Pressable>
    {open ? <DayDetail day={day} model={model} router={router} /> : null}
  </View>;
}

function Exercises({ model, router }: { model: InsightsSummary; router: ReturnType<typeof useRouter> }) {
  const { colors } = useOwnlevelTheme();
  const lanes = [
    ...(model.facts.totals.comparable ? [{ lane: 'strict' as const, rows: model.facts.exercises }] : []),
    ...(model.partial.totals.total ? [{ lane: 'partial' as const, rows: model.partial.exercises }] : []),
  ];
  if (!lanes.length) return <AppText muted>{nothingComparable(model)}</AppText>;
  return <>{lanes.map(({ lane, rows }) => <View key={lane} style={styles.block}>
    <Section title={LANE_TITLE[lane]} />
    {lane === 'partial' ? <AppText muted variant="footnote">{PARTIAL_LIMIT}</AppText> : null}
    {rows.map(row => <Pressable key={row.exerciseId} accessibilityRole="button" accessibilityLabel={summarySpoken(lane, row)}
      onPress={() => router.push({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: row.exerciseId } })}
      style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.55 : 1 }]}>
      <View style={styles.flex}>
        <AppText numberOfLines={2}>{row.name || 'Ejercicio'}</AppText>
        <AppText muted numeric variant="footnote">{summaryText(lane, row)}  · {row.exposures} veces</AppText>
      </View>
      <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
    </Pressable>)}
  </View>)}</>;
}

function RelationList({ lane, title, items, metrics, family, router, evaluated }: { lane: Lane; title: string; items: readonly (RelationSummary | PartialRelationSummary)[]; metrics: InsightsSummary['metrics']; family: FamilyFilter; router: ReturnType<typeof useRouter>; evaluated: number }) {
  const { colors } = useOwnlevelTheme();
  const [showWaiting, setShowWaiting] = useState(false);
  const groups = relationGroups([...items], family);
  const row = (item: RelationSummary | PartialRelationSummary) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${relationName(item, metrics)}: ${relationState(item)}${lane === 'partial' ? ', con contexto parcial' : ''}`}
    onPress={() => router.push({ pathname: '/(tabs)/train/insights/[relation]', params: { relation: item.id } })}
    style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.55 : 1 }]}>
    <AppText style={styles.flex} numberOfLines={3}>{relationName(item, metrics)}</AppText>
    <AppText muted variant="subheadline" numeric style={styles.relationState}>{relationState(item)}</AppText>
    <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
  </Pressable>;
  return <View style={styles.block}>
    <Section title={title} />
    {groups.readable.map(row)}
    {groups.waiting.length ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showWaiting }} accessibilityLabel={`${groups.waiting.length} relaciones todavía sin datos suficientes`} onPress={() => setShowWaiting(current => !current)}
      style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.55 : 1 }]}>
      <AppText muted style={styles.flex}>Todavía sin datos suficientes</AppText>
      <AppText muted numeric variant="subheadline">{groups.waiting.length}</AppText>
      <AppIcon color={colors.textMuted} name={showWaiting ? 'chevronDown' : 'chevronRight'} size={15} />
    </Pressable> : null}
    {showWaiting ? groups.waiting.map(row) : null}
    <AppText muted variant="caption">Evaluamos {evaluated} relaciones y te mostramos todas, también las que no dieron nada. {lane === 'partial' ? 'Una coincidencia no dice por qué pasó.' : 'Una relación no dice por qué pasó.'}</AppText>
  </View>;
}

/** Its own read, only once asked for: the relations are what costs, and they are never at the top. */
function Relations({ client, family, onFamily, router }: { client: MobileApiClient | null; family: FamilyFilter; onFamily: (next: FamilyFilter) => void; router: ReturnType<typeof useRouter> }) {
  const { state, data, refresh } = useProgressResource(client, 'performance-insights|relations', loadRelations);
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
  const router = useRouter();
  const params = useLocalSearchParams();
  const view: View_ = params.view === 'exercises' ? 'exercises' : 'days';
  const family = (FAMILY_OPTIONS.find(option => option.value === params.family)?.value ?? 'all') as FamilyFilter;
  const relationsOpen = params.relations === '1';
  const { state, data, refresh } = useProgressResource(client, 'performance-insights', loadSummary);
  const [more, setMore] = useState<{ base: InsightsSummary; days: DayFact[]; partial: PartialDayFact[]; next: string | null } | null>(null);
  const [morePhase, setMorePhase] = useState<'idle' | 'loading' | 'failed' | 'changed'>('idle');
  const extra = more && more.base === data ? more : null;
  const days = useMemo(() => data ? joinDays([...data.facts.days, ...(extra?.days ?? [])], [...data.partial.days, ...(extra?.partial ?? [])]) : [], [data, extra]);
  const next = extra ? extra.next : data?.facts.page.nextBefore ?? null;
  // Each page runs a whole read on the server, so it follows a tap and never a scroll.
  const loadMore = async () => {
    if (!client || !data || !next || morePhase === 'loading') return;
    setMorePhase('loading');
    const result = await fetchInsightsDays(client, next);
    if (result.status !== 'ok') { setMorePhase('failed'); return; }
    // Something changed since this list was read: its days must not be joined with newer ones.
    if (result.data.sourceRevision !== data.sourceRevision) { setMore(null); setMorePhase('changed'); void refresh(); return; }
    setMore({ base: data, days: [...(extra?.days ?? []), ...result.data.facts.days], partial: [...(extra?.partial ?? []), ...result.data.partial.days], next: result.data.facts.page.nextBefore });
    setMorePhase('idle');
  };
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

  const hero = heroOf(days);
  const stripLane = hero?.lane ?? primaryLane(data);
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <ExerciseSegmented accessibilityLabel="Ver por días o por ejercicios" value={view} options={VIEWS} onChange={setView} />
    {view === 'exercises' ? <Exercises model={data} router={router} /> : <>
      {hero ? <View style={styles.block} testID="insights-hero">
        <AppText muted>{dayLabel(hero.day.date)}{hero.day.openDay ? ' · en curso' : ''}</AppText>
        <AppText numeric variant="heroNumber" accessibilityLabel={`${hero.counts.comparable} de ${hero.counts.total} ${heroCaption(hero.lane)}`}>{hero.counts.comparable} de {hero.counts.total}</AppText>
        <AppText muted>{heroCaption(hero.lane)}</AppText>
        {readingRows(hero.lane, hero.counts).map(row => <FactRow key={row.label} arrow={row.arrow} label={row.label} value={row.value} spoken={row.spoken} />)}
        {hero.counts.down ? <AppText muted variant="footnote">{EXPLAIN_DOWN}</AppText> : null}
        {hero.lane === 'partial' ? <AppText muted variant="footnote" testID="insights-partial-limit">{PARTIAL_LIMIT}</AppText> : null}
      </View> : <View style={styles.block} testID="insights-nothing">
        <Heading level={2}>Todavía sin comparaciones</Heading>
        <AppText muted>{nothingComparable(data)}</AppText>
      </View>}
      {hero ? <View>
        <Section title="Alrededor de ese entrenamiento" />
        {contextRows(hero.day.strict, data.metrics).map(row => <FactRow key={row.key} label={row.label} value={row.value} />)}
      </View> : null}
      <Strip days={days} lane={stripLane} />
      <View>
        <Section title="Días" />
        {days.map(day => <DayRow key={day.date} day={day} model={data} router={router} />)}
        {next ? <Button label={morePhase === 'loading' ? 'Cargando…' : 'Ver más días'} variant="secondary" disabled={morePhase === 'loading'} onPress={() => void loadMore()} /> : null}
        {morePhase === 'failed' ? <InlineUnavailable message="No pudimos traer más días." actionLabel="Reintentar" onAction={() => void loadMore()} /> : null}
        {morePhase === 'changed' ? <AppText muted variant="footnote" accessibilityLiveRegion="polite" testID="insights-changed">Tus datos cambiaron, así que actualizamos la lista.</AppText> : null}
        <AppText muted variant="caption" numeric style={styles.coverage}>{data.history.trainingDays} días entrenados en total</AppText>
      </View>
      {data.relations.strict.outcomeDays || data.relations.partial.outcomeDays ? <View style={styles.block}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: relationsOpen }} accessibilityLabel={`Para mirar con calma, ${data.relations.partial.outcomeDays ? data.relations.partial.candidatesEvaluated : data.relations.strict.candidatesEvaluated} relaciones`} onPress={toggleRelations}
          style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.55 : 1 }]}>
          <Heading level={2} style={styles.flex}>Para mirar con calma</Heading>
          <AppIcon color={colors.textMuted} name={relationsOpen ? 'chevronDown' : 'chevronRight'} size={15} />
        </Pressable>
        {relationsOpen ? <Relations client={client} family={family} onFamily={setFamily} router={router} /> : null}
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
  relationState: { flexShrink: 1, textAlign: 'right' },
  strip: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  stripSlot: { flex: 1, justifyContent: 'flex-end' },
  coverage: { paddingTop: spacing.sm },
});
