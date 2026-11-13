import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useMobileApi } from '@/api';
import type { ResourceRefreshTrigger } from '@/api/resource';
import { ScrollScreen, SkeletonBlock, spacing, useOwnlevelTheme } from '@/design-system';
import { homeDay, weekDates, mondayOf } from '@/home/home-day';
import { homeResource } from '@/home/home-resource';
import { useSharedHomeRead } from '@/home/shared-home-read';
import { haptics } from '@/platform/haptics';

import { buildTrainingMonth } from './calendar';
import { HUB_READ_DOMAINS, TrainingHubCache, hubReadExpired, shiftHubMonth, useHubRead } from './training-hub-data';
import { settledWritesFor } from '@/api/confirmed-read-cache';
import { TrainingHubDashboard, knownTrainedDays } from './training-hub-dashboard';
import { monthCells, pickerYears, weekMarks } from './training-hub-model';
import { useStartConfirmPointerEvents } from './start-confirm-lock';
import { TrainingWeekCalendar } from './training-week-calendar';
import { useNewSession } from './use-new-session';
import { useSessionStarter } from './use-session-starter';

const systemNow = () => new Date();
/** The pinned calendar sits this far below the status bar; content starts below it. */
const CALENDAR_TOP_GAP = 4;
const COLLAPSED_FALLBACK = 92;

export function TrainingScreen({ now = systemNow }: { now?: () => Date }) {
  const { client } = useMobileApi();
  const { colors, isDark } = useOwnlevelTheme();
  const router = useRouter();
  const insets = useContext(SafeAreaInsetsContext);
  const [clock, setClock] = useState(now);
  const today = homeDay(clock).today;
  const month = today.slice(0, 7);
  // The hub always shows today (a selected day is a later iteration: the day block already takes a date).
  const [calendar, setCalendar] = useState<{ open: boolean; month: string }>({ month, open: false });
  const [collapsedHeight, setCollapsedHeight] = useState(COLLAPSED_FALLBACK);
  const cache = useMemo(() => new TrainingHubCache(client), [client]);
  // The hub stays mounted as a tab: returning to the foreground re-reads it only while it is on screen.
  const visible = useRef(false);
  const onScreen = useCallback(() => visible.current, []);
  // /home is the retained reading shared with Inicio (#303 C2): one confirmed there under 30 s ago answers here.
  const sharedHome = useSharedHomeRead(client, useCallback(() => homeDay(now()).today, [now]), onScreen);
  const home = homeResource(sharedHome.state);
  const currentCalendar = useHubRead(cache.month(month), onScreen);
  // The previous month is only prefetched while the month is open, for its first "Mes anterior".
  const previousMonth = calendar.open ? shiftHubMonth(month, -1) : month;
  useHubRead(cache.month(previousMonth), onScreen);
  const shownMonth = calendar.open ? calendar.month : month;
  const shownCalendar = useHubRead(cache.month(shownMonth), onScreen);
  const week = useHubRead(cache.week(today), onScreen);
  const dates = weekDates(mondayOf(today));
  // The strip only marks days up to today: those fall in today's month or, early in a month, in the week's first one.
  // A week ending in the next month leaves its days there ahead of today, so that month is not read.
  const firstWeekMonth = dates[0].slice(0, 7);
  const firstMonth = useHubRead(cache.month(firstWeekMonth), onScreen);

  useEffect(() => {
    const interval = setInterval(() => setClock(now()), 30_000);
    return () => clearInterval(interval);
  }, [now]);
  useEffect(() => () => cache.dispose(), [cache]);

  // Settled-write revision of each dependency set (home vs training-only reads) at the last refresh.
  const writes = useRef({ home: settledWritesFor(client, HUB_READ_DOMAINS.home), training: settledWritesFor(client, HUB_READ_DOMAINS.month) });
  // The React Compiler memoizes this; focus reads it through a ref.
  const refresh = (trigger: ResourceRefreshTrigger = 'manual', onlyStale = false) => {
    setClock(now());
    // Coming back to the hub re-reads only what expired or what a write (here or in another section) may have moved:
    // a meal, a weight or a metric moves /home, never the training month or week.
    const settled = { home: settledWritesFor(client, HUB_READ_DOMAINS.home), training: settledWritesFor(client, HUB_READ_DOMAINS.month) };
    const changed = { home: settled.home !== writes.current.home, training: settled.training !== writes.current.training };
    writes.current = settled;
    // A read already in flight can predate the settled write: never join it as the new truth.
    // Coming back (onlyStale) reuses a fresh, valid /home reading, also one Inicio confirmed; otherwise it is read.
    const homeRead = changed.home ? sharedHome.reload() : sharedHome.ensure(onlyStale ? 'initial' : trigger);
    const resources = new Set([cache.month(month), cache.month(previousMonth), cache.month(shownMonth),
      cache.month(firstWeekMonth), cache.week(today)]);
    resources.forEach(resource => {
      if (changed.training) void resource.reload(trigger);
      else if (!onlyStale || hubReadExpired(resource)) void resource.refresh(trigger);
    });
    return homeRead;
  };
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });
  const focusHome = sharedHome.focus;
  useFocusEffect(useCallback(() => {
    visible.current = true;
    const blurHome = focusHome();
    refreshRef.current('foreground', true);
    return () => { visible.current = false; blurHome(); };
  }, [focusHome]));

  const expand = () => { haptics.selection(); setCalendar({ month, open: true }); };
  const collapse = () => setCalendar(value => ({ ...value, open: false }));
  // Opening a day closes the calendar first, so coming back finds it closed.
  const openDay = (date: string) => { haptics.selection(); collapse(); router.push({ pathname: '/(tabs)/train/history', params: { date } }); };
  const toSession = (id: string, replace = false) => {
    refresh('foreground');
    const path = `/(tabs)/train/session/${id}` as const;
    if (replace) router.replace(path); else router.push(path);
  };
  const onLibrary = (target: 'routines' | 'exercises' | 'history' | 'insights') => router.push(`/(tabs)/train/${target}`);
  // "Nueva sesión" / "Entrenar otra vez": the shared native sheet; ▶ on a routine still starts it directly.
  // Starts with no chooser in between: ▶ (after its confirmation) and every "Nueva sesión" option.
  const starter = useSessionStarter({ onSession: id => toSession(id, true) });
  const confirmPointerEvents = useStartConfirmPointerEvents();
  const newSession = useNewSession({ client, home, onCreateRoutine: () => router.push('/(tabs)/train/routines'), start: starter.start, today });
  // The spinner follows the user's pull only: the shared reading also revalidates after writes (cache 'manual').
  const [pulling, setPulling] = useState(false);
  const pull = () => { setPulling(true); void refresh().finally(() => setPulling(false)); };

  const strip = knownTrainedDays([currentCalendar, firstMonth]);
  const shownRead = shownCalendar.data?.calendar;
  const shownDays = shownRead?.status === 'ok' ? shownRead.data.days.map(day => day.date) : null;
  // Swipe up closes the month; swipe down on the strip opens it (one commit when the gesture ends).
  const swipe = Gesture.Pan().activeOffsetY([-14, 14]).failOffsetX([-20, 20]).onEnd(event => {
    if (event.translationY < -24) scheduleOnRN(collapse);
    else if (event.translationY > 24) scheduleOnRN(expand);
  });

  return <View pointerEvents={confirmPointerEvents} style={styles.root}>
    {/* Content passes under the status bar and the calendar's glass, blurring progressively above the calendar. */}
    <ScrollScreen contentContainerStyle={{ paddingBottom: 100, paddingTop: CALENDAR_TOP_GAP + collapsedHeight + spacing.xl }} safeAreaEdges={['left', 'right']}
      scrollEdge edgeExtra={CALENDAR_TOP_GAP + 56}
      refreshControl={<RefreshControl onRefresh={pull} refreshing={pulling}
        tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} testID="training-refresh-control" />} testID="training-screen">
      {home.status === 'loading' && currentCalendar.status === 'loading' ? <View style={{ gap: 12 }} testID="training-loading">
        <SkeletonBlock height={140} /><SkeletonBlock height={190} /><SkeletonBlock height={160} />
      </View> : <TrainingHubDashboard calendar={currentCalendar} home={home} now={clock.getTime()} observedSessions={cache.observedSessions(today)}
        onContinue={id => toSession(id)} onLibrary={onLibrary} onOpenDay={openDay} onPlay={id => starter.start({ routineId: id })} onRefresh={refresh}
        onRoutine={id => router.push(`/(tabs)/train/routines/${id}`)} onSession={id => router.push(`/(tabs)/train/history/${id}`)}
        onStart={newSession.open} today={today} week={week} />}
    </ScrollScreen>
    {calendar.open ? (
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Cerrar calendario" onPress={collapse} style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.18)' }]}
          testID="training-calendar-backdrop" />
      </Animated.View>
    ) : null}
    <GestureDetector gesture={swipe}>
      <View style={[styles.calendar, { top: (insets?.top ?? 0) + CALENDAR_TOP_GAP }]}>
        <TrainingWeekCalendar expanded={calendar.open} marks={weekMarks(dates, today, strip.trained, strip.months)} month={shownMonth}
          monthCells={monthCells(buildTrainingMonth(shownMonth), today, shownDays ? new Set(shownDays) : null)}
          monthStatus={shownDays ? 'ready' : shownCalendar.status === 'loading' ? 'loading' : 'unavailable'}
          onCollapse={collapse} onExpand={expand} onMonth={value => setCalendar(current => ({ ...current, month: value }))} onOpenDay={openDay}
          onCollapsedHeight={height => setCollapsedHeight(current => (Math.abs(current - height) < 1 ? current : height))} today={today} years={pickerYears(today)} />
      </View>
    </GestureDetector>
    {newSession.element}
    {starter.element}
  </View>;
}

const styles = StyleSheet.create({
  calendar: { left: 12, position: 'absolute', right: 12 },
  root: { flex: 1 },
});
