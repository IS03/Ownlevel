import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AccessibilityInfo, Alert, AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedRef, useAnimatedScrollHandler, useSharedValue, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/build/react-navigation/core/usePreventRemove';
import type { MobileApiClient } from '@/api/client';
import { prefetchSessionSummary, readSessionSummary } from '@/api/session-summary';
import { prefetchFinishWeek } from './finish-week';
import type { QuickSessionHistoryDto, SessionDetailDto } from '@/api/active-session';
import type { RestDeadline } from './active-session-model';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, ProgressBar, ScrollScreen, SkeletonBlock, Surface, UnavailableState, GlassSurface, sizes, spacing, useOwnlevelTheme, useReduceMotion, brandTokens } from '@/design-system';
import { ReturnToHistoryDay } from '@/history/return-to-day';
import { haptics, triggerHaptic } from '@/platform/haptics';
import { ActiveSessionController, sessionIntentKey } from './active-session-controller';
import { ActiveExerciseCard } from './active-session-exercise-card';
import { SessionExerciseActions } from './session-exercise-actions';
import { SessionScrollHeader, advanceSessionHeader, INITIAL_SESSION_HEADER } from './session-scroll-header';
import { SessionLastHistory } from './session-last-history';
import { ExerciseNotice } from './exercise-notice';
import { draftUsingHistory, durationLabel, quickSessions } from './active-session-model';
import { useSessionPresenceStore } from './session-presence-provider';
import { restCountdownLabel, useRestCountdown } from './use-rest-countdown';
import { SessionExercisePicker, SessionQuickHistory } from './active-session-sheets';
import { ExerciseEditorModal } from './exercise-editor-modal';
import { useActiveSession } from './use-active-session';
import { NativeReorderItem, NativeReorderList, SessionDragScrollContext, closeSwipeOnScroll } from './session-native-interactions';
import { FinishSessionSheet } from './finish-session-sheet';
import { CompletedSessionScreen, completedSessionApi, type CompletedSessionApi } from './history-session-screen';

function SessionClock({ session, progress }: { session: SessionDetailDto['session']; progress?: { completedSets: number; totalSets: number } }) {
  const [now, setNow] = useState(Date.now);
  const { colors } = useOwnlevelTheme();
  useEffect(() => {
    if (session.status !== 'in_progress') return;
    const interval = setInterval(() => setNow(Date.now()), 60000);
    const foreground = AppState.addEventListener('change', next => { if (next === 'active') setNow(Date.now()); });
    return () => { clearInterval(interval); foreground.remove(); };
  }, [session.status]);
  const elapsed = (session.status === 'in_progress' ? now : Date.parse(session.endedAt ?? session.startedAt)) - Date.parse(session.startedAt);
  return <View style={styles.clock}><>{!progress ? <AppIcon name="clock" size={17} color={colors.textMuted} /> : null}<AppText numeric muted style={{ flexShrink: 1 }} variant="caption">{durationLabel(elapsed)}{progress ? ` · ${progress.completedSets}/${progress.totalSets} series` : ''}</AppText></></View>;
}
function SessionProgressHeader({ controller, color, active }: { controller: ActiveSessionController; color: string; active: boolean }) {
  const progress = useSyncExternalStore(controller.subscribeProgress, controller.getProgress, controller.getProgress);
  const { colors } = useOwnlevelTheme();
  return <View style={styles.progress}>
    <View style={styles.row}><AppText numeric muted style={styles.flex} variant="caption">{active ? 'En curso' : 'Sesión cerrada'} · {progress.completedSets}/{progress.totalSets} series · {progress.completedExercises}/{progress.exercises} ejercicios</AppText>
      {progress.errors ? <AppText style={{ color: colors.danger }} variant="caption">{progress.errors} sin sincronizar</AppText> : progress.pending ? <AppText style={{ color: colors.primary }} variant="caption">Sincronizando</AppText> : null}
    </View>
    <ProgressBar accessibilityLabel="Progreso del entrenamiento" color={color} maximumValue={Math.max(progress.totalSets, 1)} value={progress.completedSets} />
  </View>;
}
function RestTimerPanel({ controller, onHeightChange }: { controller: ActiveSessionController; onHeightChange: (height: number) => void }) {
  const timer = useSyncExternalStore(controller.subscribeTimer, controller.getTimer, controller.getTimer);
  // Floating over the scroll view keeps its viewport stable when rest starts.
  return <View pointerEvents="box-none" style={styles.timerOverlay} onLayout={event => onHeightChange(event.nativeEvent.layout.height)}>
    {timer ? <RestTimerView key={timer.exerciseId} controller={controller} timer={timer} /> : null}
  </View>;
}
function RestTimerView({ controller, timer }: { controller: ActiveSessionController; timer: RestDeadline }) {
  const presence = useSessionPresenceStore();
  const { colors } = useOwnlevelTheme();
  // The app-wide observer owns the haptic across navigation; standalone screens keep the same feedback.
  const seconds = useRestCountdown(timer, !presence);
  const label = restCountdownLabel(seconds);
  if (seconds === 0) return null;
  return <SafeAreaView edges={['bottom']} style={styles.timerSafe} accessibilityLabel="Temporizador de descanso">
    <GlassSurface interactive style={[styles.timer, { borderColor: colors.border }]}>
      <AppIcon name="clock" color={colors.primary} size={22} />
      <View style={styles.flex}><AppText muted numberOfLines={1} variant="caption">Descanso · {timer.exerciseName}</AppText><AppText numeric style={[styles.timerValue, { color: colors.primary }]} variant="heading">{label}</AppText></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Restar 15 segundos" onPress={() => { haptics.selection(); controller.adjustRest(-15); }} style={styles.timerButton}><AppText variant="heading">−</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Sumar 15 segundos" onPress={() => { haptics.selection(); controller.adjustRest(15); }} style={styles.timerButton}><AppText variant="heading">+</AppText></Pressable>
      <Button label="Saltar" onPress={() => { haptics.selection(); controller.skipRest(); }} variant="quiet" />
    </GlassSurface>
  </SafeAreaView>;
}
export function ActiveSessionScreen({ client, userId, sessionId }: { client: MobileApiClient; userId: string; sessionId: string }) {
  const { controller, state } = useActiveSession(client, userId, sessionId);
  return <ActiveSessionView controller={controller} state={state} client={client} />;
}
export function ActiveSessionView({ controller, state, client }: { controller: ActiveSessionController; state: ReturnType<ActiveSessionController['getSnapshot']>; client: MobileApiClient }) {
  const { colors } = useOwnlevelTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const reduceMotion = useReduceMotion();
  const actions = useMemo(() => new SessionExerciseActions(controller), [controller]);
  const actionState = useSyncExternalStore(actions.subscribe, actions.getSnapshot, actions.getSnapshot);
  const progress = useSyncExternalStore(controller.subscribeProgress, controller.getProgress, controller.getProgress);
  const [header, setHeader] = useState(INITIAL_SESSION_HEADER), [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const headerValue = useSharedValue(INITIAL_SESSION_HEADER), titleBottom = useSharedValue(100);
  const [reader, setReader] = useState(true), [keyboard, setKeyboard] = useState(false), [dialog, setDialog] = useState(false);
  const [cardSheets, setCardSheets] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<string[] | null>(null), [createName, setCreateName] = useState('');
  const reveal = useRef<string | null>(null);
  const cardSheet = useCallback((id: string, open: boolean) => setCardSheets(old => old[id] === open ? old : { ...old, [id]: open }), []);
  useFocusEffect(useCallback(() => () => actions.cancelWindow(), [actions]));
  useEffect(() => {
    actions.activate();
    const foreground = AppState.addEventListener('change', next => { if (next !== 'active') actions.cancelWindow(); });
    return () => { foreground.remove(); actions.dispose(); };
  }, [actions]);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (mounted) setReader(value); }).catch(() => undefined);
    const voice = AccessibilityInfo.addEventListener('screenReaderChanged', setReader);
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    void controller.readDismissedHistory().then(value => { if (mounted) setDismissed(value); }).catch(() => undefined);
    return () => { mounted = false; voice.remove(); show.remove(); hide.remove(); };
  }, [controller]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const expandedRef = useRef<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const creatorAfterDismiss = useRef(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: string; n: number } | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishTransitionDone, setFinishTransitionDone] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [restOverlayHeight, setRestOverlayHeight] = useState(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0), contentHeight = useSharedValue(0);
  const dragOwner = useSharedValue<string | null>(null);
  const scrollGesture = useMemo(() => Gesture.Native().withTestId('session-native-scroll'), []);
  const scrollProps = useAnimatedProps(() => ({ scrollEnabled: dragOwner.value === null }));
  const onScroll = useAnimatedScrollHandler(event => {
    scrollY.set(event.contentOffset.y);
    closeSwipeOnScroll(event.contentOffset.y);
    if (dragOwner.value !== null) return;
    const next = advanceSessionHeader(headerValue.value, event.contentOffset.y, titleBottom.value, Math.max(0, event.contentSize.height - event.layoutMeasurement.height));
    if (next.compact !== headerValue.value.compact || next.controls !== headerValue.value.controls) runOnJS(setHeader)(next);
    headerValue.set(next);
  });
  const dragScroll = useMemo(() => ({ ref: scrollRef, y: scrollY, contentHeight, gesture: scrollGesture, owner: dragOwner }), [scrollRef, scrollY, contentHeight, scrollGesture, dragOwner]);
  const detail = state.detail;
  const existingIds = useMemo(() => new Set(detail?.exercises.map(exercise => exercise.exerciseId) ?? []), [detail]);
  const returnToTraining = useCallback(() => { actions.cancelWindow(); router.replace('/(tabs)/train'); }, [actions, router]);
  // Cancelling is not an achievement: no success haptic.
  useEffect(() => { if (state.status === 'cancelled') returnToTraining(); }, [returnToTraining, state.status]);
  // Reset the Train stack (the closed session must not stay mounted behind the tab), then go Home.
  const returnHome = useCallback(() => { router.replace('/(tabs)/train'); router.navigate('/(tabs)/home'); }, [router]);
  // Closed sessions read through the controller's API; discard goes through the client.
  const closedId = detail?.session.id ?? '';
  const closedApi = useMemo<CompletedSessionApi>(() => ({ summary: () => readSessionSummary(client, closedId), detail: () => controller.readDetail(),
    discard: key => completedSessionApi(client, closedId).discard(key) }), [client, closedId, controller]);
  // Confirmed finish (server truth): success feedback once, then the read-only view.
  useEffect(() => { if (state.finished && !finishOpen) triggerHaptic('workoutComplete'); }, [state.finished, finishOpen]);
  // The summary read starts as soon as the finish is confirmed, while the save animation plays.
  const finishedId = state.finished?.sessionId, finishedDate = state.finished?.logDate;
  useEffect(() => { if (finishedId && finishedDate) { void prefetchSessionSummary(client, finishedId); void prefetchFinishWeek(client, finishedId, finishedDate); } },
    [client, finishedId, finishedDate]);
  const readWeek = useCallback(() => finishedId && finishedDate ? prefetchFinishWeek(client, finishedId, finishedDate) : Promise.resolve(null), [client, finishedId, finishedDate]);
  const closedStatus = detail && detail.session.status !== 'in_progress' && !state.intent ? detail.session.status : null;
  const locked = state.fenced || state.refreshing || Boolean(state.intent) || state.finishing || actionState.working;
  const canFinish = !!detail && detail.session.status === 'in_progress' && !locked && !actionState.working && !state.interaction;
  const requestCancel = useCallback(() => {
    Keyboard.dismiss(); setDialog(true);
    Alert.alert('¿Cancelar entrenamiento?', 'Elimina sólo esta sesión en curso. La rutina y el historial anteriores se conservan.', [
      { text: 'Seguir entrenando', style: 'cancel', onPress: () => setDialog(false) }, { text: 'Cancelar entrenamiento', style: 'destructive', onPress: () => { setDialog(false); actions.cancelWindow(); void controller.cancel(); } },
    ]);
  }, [actions, controller]);
  const fallbackHeader = !detail || state.status === 'not_found';
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: !!closedStatus || fallbackHeader,
      headerLeft: fallbackHeader ? () => <Pressable accessibilityRole="button" accessibilityLabel="Volver a Entrenar" onPress={returnToTraining} style={{ minHeight: sizes.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm }}><AppIcon name="chevronLeft" size={20} color={colors.textMuted} /><AppText>Entrenar</AppText></Pressable> : undefined, headerRight: undefined,
      title: closedStatus === 'discarded' ? 'Sesión eliminada' : closedStatus ? 'Sesión finalizada' : '' });
  }, [closedStatus, colors.textMuted, fallbackHeader, navigation, returnToTraining]);
  useEffect(() => {
    if (!actionState.addedId) return;
    const frame = requestAnimationFrame(() => { expandedRef.current = actionState.addedId; setExpanded(actionState.addedId); reveal.current = actionState.addedId; });
    return () => cancelAnimationFrame(frame);
  }, [actionState.addedId]);
  const applyHistory = (id: string, history: QuickSessionHistoryDto, cardExerciseId?: string) => {
    const current = controller.getExercise(id);
    if (!current || !controller.canEdit(id)) return;
    const apply = () => {
      setDialog(false);
      if (!controller.canEdit(id)) return;
      const live = controller.getExercise(id);
      if (!live) return;
      try {
        const next = draftUsingHistory(live.draft, history);
        controller.change(id, () => next, true);
        setRevealed(previous => ({ id, n: (previous?.n ?? 0) + 1 }));
        setHistoryId(null);
        // Using the "La última vez" card resolves it: no manual dismiss afterwards.
        if (cardExerciseId) dismissHistory(cardExerciseId);
      } catch {
        setDialog(true);
        Alert.alert('No pudimos usar estas series', 'Podés cargar los valores a mano.', [{ text: 'Entendido', onPress: () => setDialog(false) }]);
      }
    };
    if (current.draft.sets.some(set => set.isCompleted || set.actualReps.trim() || set.actualWeightKg.trim())) {
      setDialog(true); Alert.alert('¿Usar estas series?', 'Reemplaza los valores de hoy en este ejercicio. Las series quedan sin completar.', [
        { text: 'Seguir editando', style: 'cancel', onPress: () => setDialog(false) }, { text: 'Usar', onPress: apply },
      ]);
    } else apply();
  };
  const afterRemoval = (open: () => void) => {
    if (!actionState.working) open();
    else void actions.settleRemoval().then(ok => { if (ok) open(); });
  };
  const dismissHistory = (exerciseId: string) => { setDismissed(old => [...new Set([...(old ?? []), exerciseId])]); void controller.dismissHistory(exerciseId).catch(() => undefined); };

  usePreventRemove(state.intent?.phase === 'running', ({ data }) => {
    setDialog(true);
    Alert.alert('Hay una operación en curso', 'La intención se conserva para comprobar el resultado cuando vuelvas.', [
      { text: 'Esperar', style: 'cancel', onPress: () => setDialog(false) }, { text: 'Volver a Entrenar', onPress: () => { setDialog(false); actions.cancelWindow(); navigation.dispatch(data.action); } },
    ]);
  });
  const toggle = useCallback((id: string) => {
    if (expandedRef.current) void controller.flush(expandedRef.current);
    expandedRef.current = expandedRef.current === id ? null : id; setExpanded(expandedRef.current);
  }, [controller]);
  const showHistory = useCallback((id: string) => setHistoryId(id), []);
  const remove = useCallback((id: string, name: string) => {
    const exercise = controller.getExercise(id);
    if (!exercise || !controller.canEdit(id)) return;
    if (!exercise.draft.sets.some(set => set.isCompleted)) { void actions.remove(id); return; }
    setDialog(true); Alert.alert(`¿Quitar ${name}?`, 'Se pierden los datos de hoy de este ejercicio. Tu rutina y las sesiones anteriores se conservan.', [
      { text: 'Seguir entrenando', style: 'cancel', onPress: () => setDialog(false) },
      { text: 'Quitar', style: 'destructive', onPress: () => { setDialog(false); void actions.remove(id); } },
    ]);
  }, [actions, controller]);
  const openCreator = (name: string) => {
    setCreateName(name); creatorAfterDismiss.current = true; setPickerOpen(false);
    if (Platform.OS !== 'ios') { creatorAfterDismiss.current = false; setCreatorOpen(true); }
  };
  const creatorDismissed = () => { if (creatorAfterDismiss.current) { creatorAfterDismiss.current = false; setCreatorOpen(true); } };
  const intentPanel = state.intent && state.intent.phase !== 'running' ? <Surface style={{ borderColor: colors.text }}>
    <AppText variant="label">Operación pendiente de confirmación</AppText>
    <AppText muted variant="caption">{state.notice ?? 'Conservamos la misma intención para evitar duplicados.'}</AppText>
    <Button label="Comprobar operación" onPress={() => void controller.retryIntent()} variant="secondary" />
    {state.intent.phase === 'blocked' ? <Button label="Descartar intención y actualizar" onPress={() => void controller.discardBlockedIntent()} variant="quiet" /> : null}
  </Surface> : null;
  if (!detail || state.status === 'not_found') return <ScrollScreen glow={false} testID={state.status === 'loading' ? 'active-session-loading' : 'active-session-unavailable'}>
    {state.status === 'loading' ? <><SkeletonBlock height={80} /><SkeletonBlock height={100} /><SkeletonBlock height={100} /></> : <>
      <UnavailableState title={state.status === 'not_found' ? 'Sesión no disponible' : 'No pudimos cargar la sesión'}
        description={state.notice ?? 'Reintentá para comprobar su estado. Los borradores locales se conservan.'}
        action={<Button label="Reintentar" onPress={() => void controller.refresh()} />} />
      {intentPanel}<Button label="Volver a Entrenar" onPress={returnToTraining} variant="secondary" />
    </>}
  </ScrollScreen>;
  // A closed session uses its own read-only view. While an intent is unresolved
  // (e.g. a finish whose outcome is unknown) keep the recovery panel visible here.
  if (detail.session.status !== 'in_progress' && !state.intent && (!state.finished || !finishOpen || finishTransitionDone)) {
    // After the sheet's own receipt ("Ver sesión"), the read-only view must not present it a second time.
    return <CompletedSessionScreen api={closedApi} sessionId={detail.session.id} initialDetail={detail} finished={finishTransitionDone ? null : state.finished}
      onHome={returnHome} onTraining={returnToTraining} />;
  }
  const active = detail.session.status === 'in_progress';
  const accent = colors.primary;
  const historyExercise = detail.exercises.find(exercise => exercise.id === historyId);
  return <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
    <SafeAreaView edges={['left', 'right']} style={styles.screen} testID="active-session-ready"><SessionDragScrollContext.Provider value={dragScroll}>
    <GestureDetector gesture={scrollGesture}><Animated.ScrollView ref={scrollRef} animatedProps={scrollProps} directionalLockEnabled removeClippedSubviews={false} onScroll={onScroll} scrollEventThrottle={16} onContentSizeChange={(_width, height) => { contentHeight.set(height); }}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight + spacing.lg, paddingBottom: spacing.xl + Math.max(insets.bottom, restOverlayHeight) }]} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never"
      refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => { setPullRefreshing(true); void controller.refresh().finally(() => setPullRefreshing(false)); }} tintColor={colors.primary} />}>
      <View style={styles.sessionHeader}>
        <ReturnToHistoryDay />
        <View onLayout={event => { titleBottom.set(event.nativeEvent.layout.y + event.nativeEvent.layout.height + spacing.lg); }} style={styles.row}><Heading level={1} style={[styles.sessionTitle, styles.flex]}>{detail.session.name}</Heading><SessionClock session={detail.session} />
          {state.refreshing || state.intent?.phase === 'running' ? <ActivityIndicator testID="session-background-sync" accessibilityLabel="Sincronizando sesión" size="small" color={colors.textMuted} /> : null}
        </View>
        <SessionProgressHeader controller={controller} color={accent} active={active} />
      </View>
      {state.storageError ? <InlineUnavailable actionLabel="Reintentar" onAction={() => void controller.refresh()} message="No pudimos guardar o leer el borrador en el dispositivo. Mantené esta pantalla abierta hasta sincronizar." /> : null}
      {!active ? <Surface><AppText variant="label">Esta sesión ya no está en curso</AppText><AppText muted variant="caption">Mostramos la versión guardada en modo lectura.</AppText></Surface> : null}
      {intentPanel}
      {state.notice && !state.intent ? <InlineUnavailable message={state.notice} actionLabel="Comprobar sesión" onAction={() => void controller.refresh()} /> : null}
      <View style={styles.row}><AppText style={styles.flex} variant="heading">Ejercicios</AppText>
        {active ? <Button disabled={locked || Boolean(state.interaction)} label="+ Agregar" onPress={() => { afterRemoval(() => setPickerOpen(true)); }} variant="quiet" /> : null}</View>
      {detail.exercises.length ? <NativeReorderList ids={detail.exercises.map(exercise => exercise.id)}
        onLift={() => { const accepted = !actionState.working && controller.beginExerciseDrag(); if (accepted) Keyboard.dismiss(); return accepted; }}
        onDrop={ids => controller.dropExercises(ids)} onCancel={() => controller.cancelDrag()}>
        {detail.exercises.map(exercise => <NativeReorderItem key={exercise.id} id={exercise.id} gap={0}>
          <ActiveExerciseCard reveal={revealed?.id === exercise.id ? revealed.n : 0} addToRoutineName={detail.session.routineId ? detail.session.routineNameSnapshot ?? detail.session.name : null} controller={controller} id={exercise.id} expanded={expanded === exercise.id} locked={locked} reorderDisabled={actionState.working} onToggle={toggle} onHistory={showHistory} onRemove={remove} onSheetChange={cardSheet}
            onReveal={top => { if (reveal.current === exercise.id) { reveal.current = null; scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.get() + top - headerHeight - spacing.md), animated: !reduceMotion }); } }}
            historyCard={exercise.routineExerciseId === null && dismissed !== null && !dismissed.includes(exercise.exerciseId) && detail.quickHistory.status === 'ok' && quickSessions(detail.quickHistory.data[exercise.exerciseId] ?? []).some(item => item.sets.some(set => set.isCompleted)) ?
              <SessionLastHistory history={quickSessions(detail.quickHistory.data[exercise.exerciseId] ?? []).find(item => item.sets.some(set => set.isCompleted))!} disabled={locked} onUse={() => { if (detail.quickHistory.status === 'ok') applyHistory(exercise.id, quickSessions(detail.quickHistory.data[exercise.exerciseId] ?? []).find(item => item.sets.some(set => set.isCompleted))!, exercise.exerciseId); }} onDismiss={() => dismissHistory(exercise.exerciseId)} /> : null} />
        </NativeReorderItem>)}
      </NativeReorderList> :
        <Surface><AppText muted>Esta sesión no tiene ejercicios.</AppText><AppText muted variant="caption">Agregá uno desde tu biblioteca para empezar a registrar series.</AppText></Surface>}
    </Animated.ScrollView></GestureDetector></SessionDragScrollContext.Provider></SafeAreaView>
    <SessionScrollHeader title={detail.session.name} clock={<SessionClock session={detail.session} progress={progress} />} compact={header.compact} controls={header.controls}
      pinned={reader || reduceMotion || keyboard || dialog || pickerOpen || creatorOpen || !!historyId || finishOpen || Object.values(cardSheets).some(Boolean) || !!state.interaction} disabled={!canFinish} top={insets.top}
      completed={progress.completedSets} total={progress.totalSets} onBack={returnToTraining} onCancel={requestCancel} onFinish={() => { Keyboard.dismiss(); afterRemoval(() => setFinishOpen(true)); }} onHeight={setHeaderHeight} />
    {actionState.notice ? <ExerciseNotice bottomOffset={Math.max(insets.bottom, restOverlayHeight) - insets.bottom} message={actionState.notice.message} disabled={locked || actionState.working} undo={actionState.notice.undo ? () => void actions.undo() : undefined} /> : null}
    <RestTimerPanel controller={controller} onHeightChange={setRestOverlayHeight} />
    {finishOpen && !finishTransitionDone ? <FinishSessionSheet controller={controller} onClose={() => setFinishOpen(false)} onDiscard={requestCancel}
      readSummary={closedApi.summary} readWeek={readWeek} onDone={returnToTraining} onViewSession={() => setFinishTransitionDone(true)} /> : null}
    <SessionExercisePicker visible={pickerOpen} client={client} existingIds={existingIds} onClose={() => setPickerOpen(false)} onDismiss={creatorDismissed} onCreate={openCreator}
      onAdd={exercise => actions.add({ operation: 'add_existing', exerciseId: exercise.id, idempotencyKey: sessionIntentKey() }, exercise.name)} />
    {creatorOpen ? <ExerciseEditorModal initialName={createName} purpose="session" target={{ mode: 'create' }} routines={[]} pending={Boolean(state.intent) || state.refreshing} createIdempotencyKey={sessionIntentKey}
      onSetStatus={() => undefined} onClose={() => setCreatorOpen(false)} onSave={async (exercise, _routineIds, key) => {
        const confirmed = await actions.add({ operation: 'create_and_add', exercise, idempotencyKey: key ?? sessionIntentKey() }, exercise.name);
        if (confirmed || controller.getSnapshot().intent) { setCreatorOpen(false); return null; }
        return controller.getSnapshot().notice ?? 'No pudimos agregar el ejercicio.';
      }} /> : null}
    {historyExercise ? <SessionQuickHistory exercise={historyExercise} canUse={!locked && controller.canEdit(historyExercise.id)} history={detail.quickHistory} routineId={detail.session.routineId} routineName={detail.session.routineNameSnapshot ?? detail.session.name} onUse={session => applyHistory(historyExercise.id, session)} onClose={() => setHistoryId(null)} onRefresh={() => void controller.refresh()} /> : null}
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, flex: { flex: 1 }, content: { alignSelf: 'center', flexGrow: 1, maxWidth: sizes.contentMaxWidth, width: '100%', padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sessionHeader: { gap: spacing.sm, paddingVertical: spacing.sm }, sessionTitle: { fontSize: brandTokens.typeScale.largeTitle.fontSize }, clock: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, progress: { gap: spacing.sm, marginTop: spacing.sm },
  timerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  timerSafe: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }, timer: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timerButton: { width: sizes.touchTarget, minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'center' }, timerValue: { fontVariant: ['tabular-nums'] },
});
