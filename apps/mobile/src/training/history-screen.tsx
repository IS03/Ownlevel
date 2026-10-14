import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchTrainingDay, fetchTrainingHistory, fetchTrainingHistoryExercises, fetchTrainingHistoryMonth, type TrainingHistoryExercise, type TrainingHistorySession } from '@/api/training-history';
import { AppIcon, AppText, Button, EmptyState, ScrollScreen, Surface, TextField, spacing, useOwnlevelTheme } from '@/design-system';
import { formatDuration } from '@/home/format';
import { historyReturnParams } from '@/history/navigation';
import { ReturnToHistoryDay } from '@/history/return-to-day';
import { isoDateForDate } from './calendar';
import { exerciseSetLabel } from './exercise-detail-model';
import { MUSCLE_GROUP_OPTIONS } from './exercise-library-model';
import { ExerciseSegmented } from './exercise-segmented';
import { GroupChip } from './group-chip';
import { HistoryCalendar, type HistoryLevels } from './history-calendar';
import { ListCard, ReadStateScreen, SessionRow, StaleNotice } from './history-components';
import { addMonths, dayTotalsLabel, groupSessionsByDate, historyDayLabel, mergeHistoryPage, mondayOf, shiftDay, shortDate, volumeLabel } from './history-model';
import { useRead } from './use-read';

type Tab = 'sessions' | 'exercises';
const TABS = [{ value: 'sessions', label: 'Sesiones' }, { value: 'exercises', label: 'Ejercicios' }] as const;
const UNAVAILABLE = { status: 'unavailable' as const, reason: 'auth' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } };
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
type Level = 1 | 2 | 3 | 4;
type MonthState = { levels: Map<string, Level> } | 'unavailable';

/** Intensity for the months on screen; a failed month keeps its last confirmed read. */
function useHistoryMonths(client: MobileApiClient | null, months: readonly string[]) {
  const [data, setData] = useState<Record<string, MonthState>>({});
  const current = useRef(data);
  useEffect(() => { current.current = data; }, [data]);
  const key = months.join(',');
  const load = useCallback(async (force = false) => {
    if (!client) return;
    await Promise.all(key.split(',').map(async month => {
      if (!force && current.current[month] && current.current[month] !== 'unavailable') return;
      const result = await fetchTrainingHistoryMonth(client, month);
      setData(old => ({ ...old, [month]: result.status === 'ok' ? { levels: new Map(result.data.days.map(day => [day.date, day.level])) }
        : old[month] && old[month] !== 'unavailable' ? old[month] : 'unavailable' }));
    }));
  }, [client, key]);
  useEffect(() => { void load(); }, [load]);
  const states = months.map(month => data[month]);
  const levels: HistoryLevels | null = states.every(state => state && state !== 'unavailable')
    ? new Map(states.flatMap(state => [...(state as { levels: Map<string, Level> }).levels])) : null;
  return { levels, unavailable: states.some(state => state === 'unavailable'), reload: () => load(true) };
}

function Stat({ value, label }: { value: string; label: string }) {
  return <Surface style={styles.stat}><AppText numeric variant="headline" numberOfLines={1} adjustsFontSizeToFit>{value}</AppText><AppText muted variant="caption">{label}</AppText></Surface>;
}

/** HI2: one chosen day — its totals and sessions, with "Ver todo" back to the full list. */
function DaySessions({ client, date, today, onAll, onOpen }: { client: MobileApiClient | null; date: string; today: string; onAll: () => void; onOpen: (id: string) => void }) {
  const { colors } = useOwnlevelTheme();
  const load = useCallback((signal: AbortSignal) => client ? fetchTrainingDay(client, date, signal) : Promise.resolve(UNAVAILABLE), [client, date]);
  const { state, reload } = useRead(load);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const header = <View style={styles.dayHeader}>
    <AppText variant="title2">{historyDayLabel(date, today)}</AppText>
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onAll}><AppText variant="subheadline" style={{ color: colors.primary }}>Ver todo</AppText></Pressable>
  </View>;
  if (state.status !== 'ready') return <View style={styles.group}>{header}{state.status === 'loading' ? null
    : <Surface><AppText muted variant="caption">No pudimos cargar este día.</AppText><Button label="Reintentar" variant="secondary" onPress={() => void reload()} /></Surface>}</View>;
  const { sessions, summary } = state.data, volume = volumeLabel(summary.volumeKg), duration = formatDuration(summary.durationMilliseconds);
  return <View style={styles.group} testID="history-day">
    {header}
    {state.stale ? <StaleNotice onRetry={() => void reload()} /> : null}
    {sessions.length === 0 ? <EmptyState title="No entrenaste este día" description="Elegí otro día en el calendario o mirá todas tus sesiones." /> : <>
      <View style={styles.stats}>
        <Stat value={String(summary.sessionCount)} label={summary.sessionCount === 1 ? 'sesión' : 'sesiones'} />
        {duration ? <Stat value={duration} label="duración" /> : null}
        <Stat value={String(summary.completedSets)} label="series" />
        {volume ? <Stat value={volume} label="volumen" /> : null}
      </View>
      <ListCard>{sessions.map((session, index) => <SessionRow key={session.id} session={session} divided={index > 0} onPress={() => onOpen(session.id)} />)}</ListCard>
    </>}
  </View>;
}

type More = { base: unknown; sessions: TrainingHistorySession[]; cursor: string | null; loading: boolean; failed: boolean };
/** HI1: every finished session, grouped by day with the day's totals. */
function AllSessions({ client, today, refreshKey, onOpen }: { client: MobileApiClient | null; today: string; refreshKey: number; onOpen: (id: string) => void }) {
  const { colors } = useOwnlevelTheme();
  const load = useCallback((signal: AbortSignal) => client ? fetchTrainingHistory(client, null, signal) : Promise.resolve(UNAVAILABLE), [client]);
  const { state, reload } = useRead(load);
  const [more, setMore] = useState<More | null>(null);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  useEffect(() => { if (refreshKey) void reload(); }, [refreshKey, reload]);
  if (state.status !== 'ready') return state.status === 'loading' ? null : <Surface style={styles.group}>
    <AppText muted>No pudimos cargar tus sesiones. Tus datos siguen seguros.</AppText><Button label="Reintentar" onPress={() => void reload()} /></Surface>;
  const extra = more?.base === state.data ? more : null;
  const sessions = extra ? mergeHistoryPage(state.data.sessions, extra.sessions) : state.data.sessions;
  const cursor = extra ? extra.cursor : state.data.nextCursor;
  const loadMore = async () => {
    if (!client || !cursor) return;
    const base = state.data;
    setMore({ base, sessions: extra?.sessions ?? [], cursor, loading: true, failed: false });
    const result = await fetchTrainingHistory(client, cursor);
    setMore(previous => previous?.base !== base ? previous : result.status === 'ok'
      ? { base, sessions: mergeHistoryPage(previous.sessions, result.data.sessions), cursor: result.data.nextCursor, loading: false, failed: false }
      : { ...previous, loading: false, failed: true });
  };
  return <>
    {state.stale ? <StaleNotice onRetry={() => void reload()} /> : null}
    {sessions.length === 0 ? <EmptyState title="Todavía no terminaste ningún entrenamiento" description="Cuando finalices uno, va a aparecer acá con su día." />
      : groupSessionsByDate(sessions).map(group => <View key={group.date} style={styles.group}>
        <View style={styles.dayHeader}><AppText variant="title2">{historyDayLabel(group.date, today)}</AppText>
          <AppText muted numeric variant="footnote">{dayTotalsLabel(group.sessions)}</AppText></View>
        <ListCard>{group.sessions.map((session, index) => <SessionRow key={session.id} session={session} divided={index > 0} onPress={() => onOpen(session.id)} />)}</ListCard>
      </View>)}
    {extra?.failed ? <AppText style={{ color: colors.danger }} variant="caption">No pudimos cargar más sesiones. Probá de nuevo.</AppText> : null}
    {cursor ? <Button label={extra?.loading ? 'Cargando…' : 'Ver más'} variant="secondary" disabled={extra?.loading} onPress={() => void loadMore()} /> : null}
  </>;
}

function SessionsTab({ header, initialDate, today, onOpen }: { header: ReactNode; initialDate: string | null; today: string; onOpen: (id: string) => void }) {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const [selected, setSelected] = useState<string | null>(initialDate);
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState((initialDate ?? today).slice(0, 7));
  const [refreshKey, setRefreshKey] = useState(0);
  const week = mondayOf(selected ?? today);
  const months = expanded ? [month] : [...new Set([week.slice(0, 7), shiftDay(week, 6).slice(0, 7)])];
  const intensity = useHistoryMonths(client, months);
  const select = (date: string) => { setSelected(current => current === date ? null : date); setMonth(date.slice(0, 7)); };
  return <ScrollScreen testID="history-sessions" refreshControl={<RefreshControl refreshing={false} tintColor={colors.primary}
    onRefresh={() => { setRefreshKey(value => value + 1); void intensity.reload(); }} />}>
    {header}
    <HistoryCalendar today={today} selected={selected} week={week} month={month} expanded={expanded} levels={intensity.levels} unavailable={intensity.unavailable}
      onToggle={() => setExpanded(value => !value)} onMonth={delta => setMonth(value => addMonths(value, delta))} onSelect={select} onRetry={() => void intensity.reload()} />
    {selected ? <DaySessions key={`${selected}-${refreshKey}`} client={client} date={selected} today={today} onAll={() => setSelected(null)} onOpen={onOpen} />
      : <AllSessions client={client} today={today} refreshKey={refreshKey} onOpen={onOpen} />}
  </ScrollScreen>;
}

function ExerciseRow({ exercise, onPress, divided }: { exercise: TrainingHistoryExercise; onPress: () => void; divided: boolean }) {
  const { colors } = useOwnlevelTheme();
  const identity = [exercise.muscleLabel ?? exercise.muscleGroup, exercise.implement].filter(Boolean).join(' · ');
  const mark = exercise.lastMark ? exerciseSetLabel({ actualWeightKg: exercise.lastMark.weightKg, actualReps: exercise.lastMark.reps }, exercise.weightMode ?? 'Peso total') : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${exercise.name}. ${mark ? `Última marca ${mark}` : 'Sin marca'}${exercise.lastDate ? `, ${shortDate(exercise.lastDate)}` : ''}`}
    onPress={onPress} testID={`history-exercise-${exercise.id}`} style={({ pressed }) => [styles.exerciseRow, pressed ? { backgroundColor: colors.surfaceRaised } : null]}>
    {divided ? <View style={[styles.exerciseDivider, { backgroundColor: colors.border }]} /> : null}
    <View style={styles.flex}>
      <AppText numberOfLines={2} variant="headline">{exercise.name}</AppText>
      {identity ? <AppText muted numberOfLines={1} variant="footnote">{identity}</AppText> : null}
    </View>
    <View style={styles.totals}>
      {mark ? <AppText numeric variant="subheadline">{mark}</AppText> : null}
      {exercise.lastDate ? <AppText muted numeric variant="footnote">{shortDate(exercise.lastDate)}</AppText> : null}
    </View>
    <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
  </Pressable>;
}

/** HI3: search + muscle chips like the library, Recientes / A–Z, last mark on the right. */
function ExercisesTab({ header, onOpen }: { header: ReactNode; onOpen: (id: string) => void }) {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const [query, setQuery] = useState(''), [group, setGroup] = useState<string | null>(null), [sort, setSort] = useState<'recent' | 'az'>('recent');
  const load = useCallback((signal: AbortSignal) => client ? fetchTrainingHistoryExercises(client, signal) : Promise.resolve(UNAVAILABLE), [client]);
  const { state, reload } = useRead(load);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const needle = normalize(query);
    const filtered = state.data.filter(exercise => (!group || exercise.muscleGroup === group) &&
      normalize([exercise.name, exercise.muscleGroup, exercise.muscleLabel, exercise.implement].filter(Boolean).join(' ')).includes(needle));
    return sort === 'az' ? [...filtered].sort((left, right) => left.name.localeCompare(right.name, 'es-AR')) : filtered;
  }, [group, query, sort, state]);
  if (state.status !== 'ready') return <ReadStateScreen header={header} state={state} onRetry={() => void reload()} testID="history-exercises" />;
  return <ScrollScreen testID="history-exercises" refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void reload()} tintColor={colors.primary} />}>
    {header}
    {state.stale ? <StaleNotice onRetry={() => void reload()} /> : null}
    {state.data.length === 0 ? <EmptyState title="Todavía no hay ejercicios registrados" description="Aparecen acá cuando completás series en una sesión finalizada." /> : <>
      <TextField label="Buscar ejercicio" hideLabel search placeholder="Buscar ejercicio" value={query} onChangeText={setQuery} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroll}>
        <GroupChip label={sort === 'recent' ? '↓ Recientes' : 'A–Z'} selected={false} onPress={() => setSort(value => value === 'recent' ? 'az' : 'recent')} />
        <GroupChip label="Todos" selected={group === null} onPress={() => setGroup(null)} />
        {MUSCLE_GROUP_OPTIONS.map(option => <GroupChip key={option.value} label={option.label} selected={group === option.value} onPress={() => setGroup(current => current === option.value ? null : option.value)} />)}
      </ScrollView>
      {rows.length === 0 ? <EmptyState title="Sin resultados" description="Probá con otro nombre o grupo muscular." />
        : <ListCard>{rows.map((exercise, index) => <ExerciseRow key={exercise.id} exercise={exercise} divided={index > 0} onPress={() => onOpen(exercise.id)} />)}</ListCard>}
    </>}
  </ScrollScreen>;
}

/** Entrenar › Historial (HI1–HI3): one screen; the old Calendario and Día routes land here. */
export function HistoryScreen({ now = () => new Date() }: { now?: () => Date }) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const origin = historyReturnParams(params);
  const { colors } = useOwnlevelTheme();
  const today = isoDateForDate(now());
  const initialDate = validDate(params.date) && params.date <= today ? params.date : null;
  const [tab, setTab] = useState<Tab>(params.tab === 'exercises' ? 'exercises' : 'sessions');
  const header = <View style={styles.header}>
    <ReturnToHistoryDay />
    <ExerciseSegmented accessibilityLabel="Vista de historial" value={tab} options={TABS} onChange={setTab} />
  </View>;
  const openSession = (id: string) => router.push(origin ? { pathname: '/(tabs)/train/history/[id]', params: { id, ...origin } } : `/(tabs)/train/history/${id}`);
  return <View style={[styles.screen, { backgroundColor: colors.background }]} testID="history-screen">
    <Stack.Screen options={{ title: 'Historial', headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text },
      headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background }, headerLargeStyle: { backgroundColor: 'transparent' } }} />
    {tab === 'sessions' ? <SessionsTab header={header} initialDate={initialDate} today={today} onOpen={openSession} />
      : <ExercisesTab header={header} onOpen={id => router.push(`/(tabs)/train/history/exercise/${id}`)} />}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { gap: spacing.sm },
  group: { gap: spacing.sm },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs, paddingTop: spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexGrow: 1, flexBasis: '22%', minWidth: 72, gap: 2, padding: spacing.md },
  flex: { flex: 1, gap: 2 },
  totals: { alignItems: 'flex-end', gap: 2 },
  exerciseRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  exerciseDivider: { position: 'absolute', top: 0, left: spacing.md, right: 0, height: StyleSheet.hairlineWidth },
  chipScroll: { marginHorizontal: -spacing.lg, overflow: 'visible' },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
});
