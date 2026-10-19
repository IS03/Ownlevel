import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { MobileHomeResponse, MobileHomeWorkoutStartRoutine } from '@/api/home';
import type { MobileTrainingResponse } from '@/api/training';
import type { TrainingHistorySession } from '@/api/training-history';
import { AppIcon, AppText, GlassSurface, InlineUnavailable, SkeletonBlock, atmosphere, radius, spacing, useOwnlevelTheme, type AppIconName, brandTokens } from '@/design-system';
import { Capsule, Hero } from '@/home/home-dashboard';
import { elapsedMinutes, headerDate, WEEKDAY_LETTERS } from '@/home/home-day';
import type { HomeResource } from '@/home/home-resource';
import { HomeSectionTitle } from '@/home/home-ui';

import type { HubWeek } from './training-hub-data';
import { dayBlock, routineLastDone, type HubDayMark } from './training-hub-model';
import { trainingRoutineColor } from './routine-colors';
import { StartConfirm } from './start-confirm';

export const HUB_WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function hubMonthName(month: string, year = false): string {
  const text = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(`${month}-01T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1) + (year ? ` ${month.slice(0, 4)}` : '');
}

/** "8 de octubre". */
export function hubDayMonth(date: string): string {
  return `${Number(date.slice(8))} de ${hubMonthName(date.slice(0, 7)).toLowerCase()}`;
}

/** "Jueves". */
export function hubWeekday(date: string): string {
  return HUB_WEEKDAY_NAMES[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
}

const alpha = (hex: string, value: number) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${value})`;

/** Trained days known from the month reads (the strip's months), and which months were read. */
export function knownTrainedDays(resources: HomeResource<MobileTrainingResponse>[]) {
  const trained = new Set<string>();
  const months = new Set<string>();
  for (const resource of resources) {
    const read = resource.data?.calendar;
    if (read?.status !== 'ok') continue;
    months.add(read.data.month);
    read.data.days.forEach(day => trained.add(day.date));
  }
  return { months, trained };
}


const DAY_CIRCLE = 40;

/** One day: letter over a 40 pt circle. Filled = at least one finished session. */
function DayColumn({ index, mark, onOpenDay }: { index: number; mark: HubDayMark; onOpenDay?: (date: string) => void }) {
  const { colors } = useOwnlevelTheme();
  const { date, future, isToday, known, trained } = mark;
  const number = Number(date.slice(8));
  const circle = trained ? { backgroundColor: colors.primary } : isToday ? { borderColor: colors.text, borderWidth: 2 } : null;
  const numberColor = trained ? colors.onPrimary : future ? colors.textMuted : colors.text;
  const label = `${HUB_WEEKDAY_NAMES[index]} ${number}${isToday ? ', hoy' : ''}${future ? '' : `, ${!known ? 'actividad no disponible' : trained ? 'entrenaste' : 'sin entrenamiento'}`}`;
  const content = (
    <>
      <AppText style={[styles.letter, { color: isToday ? colors.text : colors.textMuted, fontWeight: isToday ? '700' : '400' }]}>{WEEKDAY_LETTERS[index]}</AppText>
      <View style={styles.circleBox}>
        {isToday && trained ? <View style={[styles.halo, { borderColor: alpha(colors.primary, 0.28) }]} testID={`training-day-halo-${date}`} /> : null}
        <View style={[styles.circle, circle]} testID={trained ? `training-day-filled-${date}` : undefined}>
          <AppText numeric style={[styles.dayNumber, { color: numberColor, fontWeight: isToday && !trained ? '700' : '600' }]}>{number}</AppText>
        </View>
      </View>
    </>
  );
  if (!onOpenDay || future) {
    return <View accessible accessibilityLabel={label} style={styles.dayColumn} testID={`training-week-day-${date}`}>{content}</View>;
  }
  return (
    <Pressable accessibilityHint="Abre este día en el historial" accessibilityLabel={label} accessibilityRole="button" onPress={() => onOpenDay(date)}
      style={({ pressed }) => [styles.dayColumn, { opacity: pressed ? 0.55 : 1 }]} testID={`training-week-day-${date}`}>
      {content}
    </Pressable>
  );
}

/** The week, Monday first. Past days and today open that day in History; future days do nothing. */
export function HubWeekStrip({ marks, onOpenDay }: { marks: HubDayMark[]; onOpenDay?: (date: string) => void }) {
  return <View style={styles.week}>{marks.map((mark, index) => <DayColumn index={index} key={mark.date} mark={mark} onOpenDay={onOpenDay} />)}</View>;
}

function sessionDetail(session: TrainingHistorySession, withExercises: boolean): string {
  const parts = [session.durationMilliseconds === null ? null : `${Math.round(session.durationMilliseconds / 60_000)} min`,
    `${session.completedSets} ${session.completedSets === 1 ? 'serie' : 'series'}`,
    withExercises ? `${session.exercisesCompleted} ${session.exercisesCompleted === 1 ? 'ejercicio' : 'ejercicios'}` : null];
  return parts.filter(Boolean).join(' · ');
}

function HubRow({ accent = false, accessibilityLabel, icon, onPress, testID, title, value }: {
  accent?: boolean; accessibilityLabel?: string; icon?: AppIconName; onPress: () => void; testID?: string; title: string; value?: string;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <Pressable accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)} accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.55 : 1 }]} testID={testID}>
      {icon ? <AppIcon color={colors.textMuted} name={icon} size={20} /> : null}
      <AppText numberOfLines={1} style={[styles.flex, accent && { color: colors.primary, fontWeight: '600' }]} variant="body">{title}</AppText>
      {value ? <AppText muted numeric variant="subheadline">{value}</AppText> : null}
      <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
    </Pressable>
  );
}

function Line() {
  const { colors } = useOwnlevelTheme();
  return <View style={[styles.line, { backgroundColor: colors.border }]} />;
}

/** "Nueva sesión": discreet glass button tinted with the accent (radius 14, not a pill). */
function NewSessionButton({ onPress }: { onPress: () => void }) {
  const { colors, isDark } = useOwnlevelTheme();
  const text = atmosphere[isDark ? 'dark' : 'light'].accentStrong ?? colors.primary;
  return (
    <Pressable accessibilityHint="Elegí una rutina o entrená libre" accessibilityLabel="Nueva sesión" accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })} testID="training-new-session">
      <GlassSurface style={[styles.newSession, { borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.7)' }]} tint={alpha(colors.primary, 0.13)}>
        <AppIcon color={text} name="plus" size={17} />
        <AppText style={{ color: text }} variant="headline">Nueva sesión</AppText>
      </GlassSurface>
    </Pressable>
  );
}

/**
 * The day block (today in this pass): nothing finished → date, weekday and "Nueva sesión";
 * one → that session "Hecho"; more → the main one plus "También hoy". A session in course
 * never changes it (the history only holds finished sessions).
 */
function DayBlock({ date, onOpenDay, onSession, onStart, onRetry, week }: {
  date: string; onOpenDay: (date: string) => void; onSession: (id: string) => void; onStart: () => void; onRetry: () => void; week: HomeResource<HubWeek>;
}) {
  const { colors } = useOwnlevelTheme();
  if (!week.data) {
    // Unknown is not "nothing done": no date/weekday claim, but starting stays available.
    return week.status === 'loading' ? <SkeletonBlock height={140} /> : (
      <View style={styles.block} testID="training-today-unavailable">
        <InlineUnavailable actionLabel="Reintentar" message="No pudimos cargar tus sesiones de hoy." onAction={onRetry} />
        <NewSessionButton onPress={onStart} />
      </View>
    );
  }
  const block = dayBlock(date, week.data.sessions);
  if (block.kind === 'empty') {
    return (
      <View style={styles.block} testID="training-today-empty">
        <View>
          <AppText muted variant="subheadline">{hubDayMonth(date)}</AppText>
          <AppText accessibilityRole="header" variant="largeTitle">{hubWeekday(date)}</AppText>
          <AppText muted variant="body">Elegí una rutina o entrená libre</AppText>
        </View>
        <NewSessionButton onPress={onStart} />
      </View>
    );
  }
  const { main } = block;
  return (
    <View style={styles.blockDone} testID={block.kind === 'single' ? 'training-today-single' : 'training-today-multiple'}>
      <View>
        <AppText muted variant="subheadline">{headerDate(date)}</AppText>
        <View style={styles.nameRow}>
          <AppText accessibilityRole="header" numberOfLines={1} style={styles.shrink} variant="largeTitle">{main.routineName}</AppText>
          <View accessibilityLabel="Hecho" style={[styles.chip, { backgroundColor: colors.brandSubtle }]} testID="training-done-chip">
            <AppIcon color={colors.primary} name="check" size={13} />
            <AppText style={{ color: colors.primary }} variant="footnote">Hecho</AppText>
          </View>
        </View>
        <AppText muted numeric variant="body">{sessionDetail(main, true)}</AppText>
      </View>
      <View>
        <Line />
        <HubRow onPress={() => onSession(main.id)} testID="training-view-session" title="Ver sesión" />
        {block.kind === 'multiple' ? (
          <>
            <Line />
            <AppText muted style={styles.alsoToday} variant="footnote">También hoy</AppText>
            {block.others.map(session => (
              <View key={session.id}>
                <HubRow onPress={() => onSession(session.id)} testID={`training-other-${session.id}`} title={session.routineName} value={sessionDetail(session, false)} />
                <Line />
              </View>
            ))}
            {block.remaining > 0 ? (
              <>
                <HubRow onPress={() => onOpenDay(date)} testID="training-more-sessions" title={`Ver las ${block.remaining} restantes`} />
                <Line />
              </>
            ) : null}
          </>
        ) : <Line />}
        <HubRow accent accessibilityLabel="Entrenar otra vez" onPress={onStart} testID="training-train-again" title="Entrenar otra vez" />
      </View>
    </View>
  );
}

function RoutineRow({ onOpen, onPlay, routine, sessions, today }: {
  onOpen: (id: string) => void; onPlay: (id: string) => void; routine: MobileHomeWorkoutStartRoutine; sessions: TrainingHistorySession[]; today: string;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  const [confirming, setConfirming] = useState(false);
  const last = routineLastDone(routine.id, sessions, today);
  const exercises = `${routine.exerciseCount} ${routine.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}`;
  return (
    <View style={styles.routineRow}>
      <Pressable accessibilityHint="Abre la rutina" accessibilityLabel={`${routine.name}, ${exercises}${last ? `, ${last}` : ''}`} accessibilityRole="button"
        onPress={() => onOpen(routine.id)} style={({ pressed }) => [styles.routineLead, { opacity: pressed ? 0.55 : 1 }]} testID={`training-routine-${routine.id}`}>
        <AppIcon color={colors.primary} name="dumbbell" size={20} />
        <View style={styles.flex}>
          <View style={styles.routineName}>
            <AppText numberOfLines={1} style={[styles.shrink, styles.medium]} variant="body">{routine.name}</AppText>
            {routine.color ? <View accessibilityElementsHidden style={[styles.routineDot, { backgroundColor: trainingRoutineColor(routine.color, isDark) }]} /> : null}
          </View>
          <AppText muted numeric variant="subheadline">{exercises}</AppText>
        </View>
        {last ? <AppText muted variant="subheadline">{last}</AppText> : null}
      </Pressable>
      {/* ▶ asks first (anchored native confirmation), so a stray tap never starts a session. */}
      <View style={styles.play}>
        <StartConfirm onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); onPlay(routine.id); }} open={confirming} routineName={routine.name} />
        <Pressable accessibilityHint="Pide confirmación antes de empezar" accessibilityLabel={`Iniciar ${routine.name}`} accessibilityRole="button" hitSlop={4}
          onPress={() => setConfirming(true)} style={({ pressed }) => [styles.play, { opacity: pressed ? 0.55 : 1 }]} testID={`training-play-${routine.id}`}>
          <AppIcon color={colors.primary} name="play" size={17} />
        </Pressable>
      </View>
    </View>
  );
}

export function TrainingHubDashboard({ calendar, home, now, observedSessions, onLibrary, onOpenDay, onPlay, onContinue,
  onRefresh, onRoutine, onSession, onStart, today, week }: {
  calendar: HomeResource<MobileTrainingResponse>; home: HomeResource<MobileHomeResponse>;
  now: number; observedSessions: TrainingHistorySession[]; today: string; week: HomeResource<HubWeek>;
  onContinue: (id: string) => void; onLibrary: (target: 'routines' | 'exercises' | 'history') => void;
  onOpenDay: (date: string) => void; onPlay: (id: string) => void; onRefresh: () => void; onRoutine: (id: string) => void; onSession: (id: string) => void;
  onStart: () => void;
}) {
  const active = home.data?.training.activeSession;
  const routines = home.data?.training.workoutStartRoutines;
  return (
    <View style={styles.dashboard} testID="training-dashboard">
      {/* The week calendar is pinned above the scroll (TrainingWeekCalendar); only notices, when any, sit above today's block. */}
      {home.status === 'loading' ? <SkeletonBlock height={92} /> : active?.status === 'ok' && active.data ?
        <Hero label="Sesión en curso" title={active.data.name} subtitle={`${elapsedMinutes(active.data.startedAt, now)} min · ${active.data.exercisesCompleted} de ${active.data.totalExercises} ejercicios`}
          actions={<Capsule label="Volver" onPress={() => onContinue(active.data!.id)} />} testID="training-active-session" /> :
        active?.status !== 'ok' ? <InlineUnavailable actionLabel="Reintentar" message="No pudimos verificar si tenés una sesión en curso." onAction={onRefresh} /> : null}
      {home.status === 'unavailable' || calendar.status === 'unavailable' ? <View testID="training-stale"><InlineUnavailable message="No pudimos actualizar Entrenar. Mostramos los datos guardados cuando están disponibles." actionLabel="Reintentar" onAction={onRefresh} /></View> : null}
      <DayBlock date={today} onOpenDay={onOpenDay} onRetry={onRefresh} onSession={onSession} onStart={onStart} week={week} />
      <View>
        <HomeSectionTitle action="Ver todas" onAction={() => onLibrary('routines')} title="Rutinas" />
        {routines?.status === 'ok' ? routines.data.slice(0, 3).map((routine, index) => (
          <View key={routine.id}>
            {index > 0 ? <Line /> : null}
            <RoutineRow onOpen={onRoutine} onPlay={onPlay} routine={routine} sessions={observedSessions} today={today} />
          </View>
        )) : null}
        {routines?.status === 'ok' && !routines.data.length ? <HubRow onPress={() => onLibrary('routines')} title="Creá tu primera rutina" /> : null}
        {!routines ? home.status === 'loading' ? <SkeletonBlock height={100} /> : <InlineUnavailable message="No pudimos cargar tus rutinas." onAction={onRefresh} actionLabel="Reintentar" /> :
          routines.status === 'unavailable' ? <InlineUnavailable message="No pudimos cargar tus rutinas. Podés elegir una sesión libre." onAction={onRefresh} actionLabel="Reintentar" /> : null}
      </View>
      <View>
        <HomeSectionTitle title="Biblioteca" />
        <HubRow accessibilityLabel="Abrir Rutinas" icon="routines" onPress={() => onLibrary('routines')} title="Rutinas" />
        <Line />
        <HubRow accessibilityLabel="Abrir Ejercicios" icon="book" onPress={() => onLibrary('exercises')} title="Ejercicios" />
        <Line />
        <HubRow accessibilityLabel="Abrir Historial" icon="clock" onPress={() => onLibrary('history')} title="Historial" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  alsoToday: { paddingBottom: spacing.xs, paddingTop: spacing.md },
  block: { gap: spacing.xl },
  blockDone: { gap: spacing.lg },
  chip: { alignItems: 'center', borderRadius: radius.chip, flexDirection: 'row', gap: spacing.xs, height: 28, paddingHorizontal: 10 },
  circle: { alignItems: 'center', borderRadius: radius.full, height: DAY_CIRCLE, justifyContent: 'center', width: DAY_CIRCLE },
  circleBox: { alignItems: 'center', height: DAY_CIRCLE, justifyContent: 'center', width: DAY_CIRCLE },
  dashboard: { gap: spacing.xxl },
  dayColumn: { alignItems: 'center', flex: 1, gap: spacing.sm, minHeight: 44 },
  dayNumber: { fontSize: brandTokens.typeScale.body.fontSize, letterSpacing: brandTokens.typeScale.body.letterSpacing, lineHeight: brandTokens.typeScale.body.lineHeight },
  flex: { flex: 1, minWidth: 0 },
  halo: { borderRadius: radius.full, borderWidth: 3, bottom: -4, left: -4, position: 'absolute', right: -4, top: -4 },
  letter: { fontSize: brandTokens.typeScale.footnote.fontSize, lineHeight: brandTokens.typeScale.footnote.lineHeight },
  line: { height: StyleSheet.hairlineWidth },
  medium: { fontWeight: '500' },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  newSession: { alignItems: 'center', borderRadius: radius.button, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs,
    height: 50, justifyContent: 'center', overflow: 'hidden' },
  play: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  routineDot: { borderRadius: radius.full, height: 8, width: 8 },
  routineLead: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minHeight: 56, paddingVertical: spacing.xs },
  routineName: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  routineRow: { alignItems: 'center', flexDirection: 'row' },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 50 },
  shrink: { flexShrink: 1 },
  week: { flexDirection: 'row' },
});
