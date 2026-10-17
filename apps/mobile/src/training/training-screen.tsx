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
import { haptics } from '@/platform/haptics';

import { buildTrainingMonth } from './calendar';
import { TrainingHubCache, shiftHubMonth, useHubRead } from './training-hub-data';
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
  const home = useHubRead(cache.home);
  const previousMonth = shiftHubMonth(month, -1);
  const currentCalendar = useHubRead(cache.month(month));
  useHubRead(cache.month(previousMonth));
  const shownMonth = calendar.open ? calendar.month : month;
  const shownCalendar = useHubRead(cache.month(shownMonth));
  const week = useHubRead(cache.week(today));
  const dates = weekDates(mondayOf(today));
  const firstWeekMonth = dates[0].slice(0, 7);
  const lastWeekMonth = dates[6].slice(0, 7);
  const firstMonth = useHubRead(cache.month(firstWeekMonth));
  const lastMonth = useHubRead(cache.month(lastWeekMonth));

  useEffect(() => {
    const interval = setInterval(() => setClock(now()), 30_000);
    return () => clearInterval(interval);
  }, [now]);
  useEffect(() => () => cache.dispose(), [cache]);

  // The React Compiler memoizes this; focus reads it through a ref.
  const refresh = (trigger: ResourceRefreshTrigger = 'manual') => {
    setClock(now());
    const resources = new Set([cache.home, cache.month(month), cache.month(previousMonth), cache.month(shownMonth),
      cache.month(firstWeekMonth), cache.month(lastWeekMonth), cache.week(today)]);
    resources.forEach(resource => { void resource.refresh(trigger); });
  };
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });
  useFocusEffect(useCallback(() => { refreshRef.current('foreground'); }, []));

  const expand = () => { haptics.selection(); setCalendar({ month, open: true }); };
  const collapse = () => setCalendar(value => ({ ...value, open: false }));
  // Opening a day closes the calendar first, so coming back finds it closed.
  const openDay = (date: string) => { haptics.selection(); collapse(); router.push({ pathname: '/(tabs)/train/history', params: { date } }); };
  const toSession = (id: string, replace = false) => {
    refresh('foreground');
    const path = `/(tabs)/train/session/${id}` as const;
    if (replace) router.replace(path); else router.push(path);
  };
  const onLibrary = (target: 'routines' | 'exercises' | 'history') => router.push(`/(tabs)/train/${target}`);
  // "Nueva sesión" / "Entrenar otra vez": the shared native sheet; ▶ on a routine still starts it directly.
  // Starts with no chooser in between: ▶ (after its confirmation) and every "Nueva sesión" option.
  const starter = useSessionStarter({ onSession: id => toSession(id, true) });
  const confirmPointerEvents = useStartConfirmPointerEvents();
  const newSession = useNewSession({ client, home, onCreateRoutine: () => router.push('/(tabs)/train/routines'), start: starter.start, today });
  const homeState = cache.home.getSnapshot();

  const strip = knownTrainedDays([currentCalendar, firstMonth, lastMonth]);
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
      refreshControl={<RefreshControl onRefresh={() => refresh()} refreshing={homeState.status === 'ready' && homeState.refreshing && homeState.trigger === 'manual'}
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
