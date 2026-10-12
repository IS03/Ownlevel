import type { PropsWithChildren, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { createMobileTrainingRoutine, duplicateMobileTrainingRoutine, reorderMobileTrainingRoutines, fetchRoutineDetail, fetchMobileTrainingRoutines, setMobileTrainingRoutineStatus, useApiResource, useMobileApi } from '@/api';
import type { MobileTrainingRoutine } from '@/api/routines';
import type { MobileApiMutationResult } from '@/api/results';
import {
  AppIcon, AppText, Button, EmptyState, GlassSurface, InlineUnavailable,
  Separator, SkeletonBlock, Surface, UnavailableState, motionDurations, pressedStyle, radius, sizes, spacing, useOwnlevelTheme, useReduceMotion,
} from '@/design-system';

import { CreateRoutineSheet, type DuplicateRoutineSource, type RoutineCreateInput } from './create-routine-sheet';
import { RoutineOrderList } from './routine-order-list';
import { RoutineRow } from './routine-row';
import { useStartConfirmPointerEvents } from './start-confirm-lock';
import { useSessionStarter } from './use-session-starter';

const UNAVAILABLE = {
  status: 'unavailable' as const, reason: 'invalid_response' as const,
  meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const },
};
type PendingMutation = 'archive' | 'create' | 'duplicate-load' | 'duplicate' | 'order' | 'restore' | null;
type OrderDraft = { routines: MobileTrainingRoutine[]; ids: string[]; version: number };
type Notice = { message: string; undo?: MobileTrainingRoutine; error?: boolean };

function defaultIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `routine-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mutationErrorMessage(result: MobileApiMutationResult<unknown>): string {
  if (result.status === 'validation' || result.status === 'not_found') return result.message;
  if (result.status === 'conflict') return 'La rutina cambió. Actualizá la lista e intentá de nuevo.';
  if (result.status === 'auth_required' || result.status === 'unauthorized') return 'Tu sesión necesita volver a validarse.';
  return 'No pudimos confirmar el cambio. Actualizamos la lista para verificar cómo quedó.';
}

function RoundButton({ disabled, label, onPress }: { disabled: boolean; label: string; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  return <GlassSurface interactive style={styles.round}>
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.round, pressedStyle(pressed, reduceMotion)]}>
      <AppIcon color={label === 'Nueva rutina' ? colors.primary : colors.text} name={label === 'Nueva rutina' ? 'plus' : label === 'Ordenar rutinas' ? 'reorder' : 'chevronLeft'} size={20} />
    </Pressable>
  </GlassSurface>;
}

function DoneButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  return <GlassSurface interactive style={styles.done}>
    <Pressable accessibilityLabel="Guardar orden" accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [styles.done, pressedStyle(pressed, reduceMotion)]}>
      <AppText style={{ color: colors.primary }} variant="headline">Listo</AppText>
    </Pressable>
  </GlassSurface>;
}

/** UIKit must discover the ScrollView directly to manage large-title expansion and collapse. */
function RoutinesScrollScreen({ children, contentContainerStyle, scrollRef, ...props }: PropsWithChildren<ScrollViewProps> & { scrollRef?: RefObject<ScrollView | null> }) {
  const { colors } = useOwnlevelTheme();
  const insets = useSafeAreaInsets();
  const scroll = <ScrollView {...props} ref={scrollRef} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
    style={[{ backgroundColor: colors.background, flex: 1 }, props.style]}
    contentContainerStyle={[{ alignSelf: 'center', flexGrow: 1, gap: spacing.md, maxWidth: sizes.contentMaxWidth, padding: spacing.lg,
      paddingBottom: insets.bottom + spacing.xl, width: '100%' }, contentContainerStyle]}>{children}</ScrollView>;
  return Platform.OS === 'ios' ? scroll : <SafeAreaView edges={['left', 'right', 'bottom']} style={{ backgroundColor: colors.background, flex: 1 }}>{scroll}</SafeAreaView>;
}

/** Both routes share reads, states, mutation exclusion and rows. Only the list filter differs. */
export function RoutinesScreen({ archivedOnly = false, createIdempotencyKey = defaultIdempotencyKey }: {
  archivedOnly?: boolean; createIdempotencyKey?: () => string;
}) {
  const { client } = useMobileApi();
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const insets = useSafeAreaInsets();
  const pointerEvents = useStartConfirmPointerEvents();
  const starter = useSessionStarter({ onSession: id => router.replace(`/(tabs)/train/session/${id}`) });
  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<DuplicateRoutineSource | null>(null);
  const [orderDraft, setOrderDraft] = useState<OrderDraft | null>(null);
  const ordering = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [confirmedCopies, setConfirmedCopies] = useState<{ routine: MobileTrainingRoutine; after: string }[]>([]);
  const [confirmedOrder, setConfirmedOrder] = useState<string[] | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollMetrics = useRef({ y: 0, min: 0, max: 0, top: 0, height: 0, contentHeight: 0, bottom: 0 });
  const [pending, setPending] = useState<PendingMutation>(null);
  const pendingRef = useRef(false);
  const mutationEpoch = useRef(0);
  const lastReadEpoch = useRef(-1);
  const [confirmedStatus, setConfirmedStatus] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const load = useCallback((signal: AbortSignal) => {
    const epoch = mutationEpoch.current;
    if (!client) return Promise.resolve(UNAVAILABLE);
    return fetchMobileTrainingRoutines(client, signal).then(result => {
      if (!signal.aborted) lastReadEpoch.current = epoch;
      // A confirmed mutation survives a failed refresh; only a fresh authoritative list clears it.
      if (!signal.aborted && alive.current && epoch === mutationEpoch.current && result.status === 'ok' && result.data.routines.status === 'ok') {
        setConfirmedStatus({});
        setConfirmedOrder(null);
        setConfirmedCopies([]);
      }
      return result;
    });
  }, [client]);
  const { refresh, state } = useApiResource(load);
  const current = state.status === 'ready' ? state.current : state.status === 'loading' ? undefined : state.previous;
  const resource = current?.data.routines;
  const sorted = resource?.status === 'ok' ? resource.data.map(routine => ({ ...routine, isActive: confirmedStatus[routine.id] ?? routine.isActive }))
    : [];
  for (const copy of confirmedCopies) {
    if (resource?.status !== 'ok' || sorted.some(routine => routine.id === copy.routine.id)) continue;
    const source = sorted.findIndex(routine => routine.id === copy.after);
    sorted.splice(source >= 0 ? source + 1 : sorted.length, 0, copy.routine);
  }
  const activeBase = sorted.filter(routine => routine.isActive);
  const active = confirmedOrder ? [...confirmedOrder.flatMap(id => activeBase.filter(routine => routine.id === id)), ...activeBase.filter(routine => !confirmedOrder.includes(routine.id))] : activeBase;
  const archived = sorted.filter(routine => !routine.isActive);
  const rows = archivedOnly ? archived : active;

  const announce = useCallback((next: Notice) => {
    if (!alive.current) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(next);
    void AccessibilityInfo.announceForAccessibility(next.message);
    noticeTimer.current = setTimeout(() => setNotice(null), next.error ? 6_000 : 4_000);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, []);
  useFocusEffect(useCallback(() => { if (!pendingRef.current && !ordering.current) void refresh(); }, [refresh]));
  const runRefresh = () => { if (!pendingRef.current && !ordering.current) void refresh(); };

  const refreshAfterMutation = async () => {
    await refresh();
    // useApiResource coalesces reads. An older foreground read must finish before the new one.
    if (lastReadEpoch.current !== mutationEpoch.current) await refresh();
  };

  const changeStatus = async (routine: MobileTrainingRoutine, isActive: boolean) => {
    if (!client || pendingRef.current || ordering.current) return;
    pendingRef.current = true;
    mutationEpoch.current += 1;
    setPending(isActive ? 'restore' : 'archive');
    setNotice(null);
    let next: Notice;
    try {
      const result = await setMobileTrainingRoutineStatus(client, routine.id, isActive);
      mutationEpoch.current += 1;
      if (result.status === 'ok') {
        if (alive.current) setConfirmedStatus(previous => ({ ...previous, [routine.id]: result.data.routine.isActive }));
        next = result.data.routine.isActive === isActive
          ? { message: `${routine.name} ${isActive ? 'restaurada' : 'archivada'}`, ...(!isActive ? { undo: routine } : {}) }
          : { message: 'La rutina cambió. Actualizamos la lista para verificar cómo quedó.', error: true };
      } else next = { message: mutationErrorMessage(result), error: true };
      await refreshAfterMutation();
    } catch {
      next = { message: 'No pudimos verificar el cambio. Revisá la conexión y actualizá la lista.', error: true };
    } finally {
      pendingRef.current = false;
      if (alive.current) setPending(null);
    }
    announce(next);
  };

  const create = async (input: RoutineCreateInput): Promise<string | null> => {
    if (!client || pendingRef.current || ordering.current) return 'Esperá a que termine la acción actual.';
    pendingRef.current = true;
    mutationEpoch.current += 1;
    setPending(duplicateSource ? 'duplicate' : 'create');
    try {
      const result = duplicateSource
        ? await duplicateMobileTrainingRoutine(client, duplicateSource.id, { ...input,
          expectedUpdatedAt: duplicateSource.expectedUpdatedAt, expectedTemplateVersion: duplicateSource.expectedTemplateVersion })
        : await createMobileTrainingRoutine(client, input);
      mutationEpoch.current += 1;
      if (result.status !== 'ok') {
        if (result.status === 'conflict' && result.code !== 'IDEMPOTENCY_KEY_REUSED') return 'La rutina cambió. Cerrá esta hoja y abrí Duplicar otra vez para usar la versión actual.';
        if (result.status === 'conflict') return 'Ese intento ya se usó con otros datos. Cambiá el nombre o color e intentá de nuevo.';
        if (result.status === 'unavailable') return duplicateSource ? 'No pudimos confirmar la copia. Reintentá con el mismo nombre y color para verificarla.' : 'No pudimos confirmar la creación. Reintentá con el mismo nombre y color para verificarla.';
        return mutationErrorMessage(result);
      }
      if (alive.current) {
        if (duplicateSource) setConfirmedCopies(previous => [...previous, { routine: result.data.routine, after: duplicateSource.id }]);
        setCreateOpen(false); setDuplicateSource(null);
      }
      await refreshAfterMutation();
      announce({ message: duplicateSource ? 'Rutina duplicada' : 'Rutina creada' });
      return null;
    } catch {
      return duplicateSource ? 'No pudimos confirmar la copia. Reintentá con el mismo nombre y color para verificarla.' : 'No pudimos confirmar la creación. Reintentá con el mismo nombre y color para verificarla.';
    } finally {
      pendingRef.current = false;
      if (alive.current) setPending(null);
    }
  };

  const openEditor = (routine: MobileTrainingRoutine, editIdentity = false) => {
    if (pendingRef.current || ordering.current) return;
    router.push({ pathname: '/(tabs)/train/routines/[id]', params: { id: routine.id, ...(editIdentity ? { editIdentity: '1' } : {}) } });
  };
  const openCreate = () => { if (!pendingRef.current && !ordering.current) setCreateOpen(true); };
  const openDuplicate = async (routine: MobileTrainingRoutine) => {
    if (!client || pendingRef.current || ordering.current) return;
    pendingRef.current = true; setPending('duplicate-load');
    try {
      const result = await fetchRoutineDetail(client, routine.id);
      if (!alive.current) return;
      if (result.status !== 'ok' || result.data.kind !== 'detail') {
        announce({ message: result.status === 'ok' ? 'La rutina ya no está disponible. Actualizá la lista.' : 'No pudimos cargar la rutina para copiarla. Revisá la conexión e intentá de nuevo.', error: true });
        return;
      }
      const { routine: source, items } = result.data.detail;
      setDuplicateSource({ id: source.id, name: source.name, color: source.color,
        exerciseCount: items.length, setCount: items.reduce((total, item) => total + item.targets.sets.length, 0),
        expectedUpdatedAt: source.updatedAt, expectedTemplateVersion: source.templateVersion,
        ...(source.unrecognizedColor ? { unrecognizedColor: source.unrecognizedColor } : {}) });
    } catch { announce({ message: 'No pudimos cargar la rutina para copiarla. Revisá la conexión e intentá de nuevo.', error: true }); }
    finally { pendingRef.current = false; if (alive.current) setPending(null); }
  };
  const openOrder = () => {
    if (pendingRef.current || ordering.current || archivedOnly || active.length < 2) return;
    const version = current?.data.listVersion;
    if (state.status !== 'ready' || version?.status !== 'ok' || Object.keys(confirmedStatus).length) {
      announce({ message: 'Actualizá la lista antes de ordenar las rutinas.', error: true }); void refresh(); return;
    }
    ordering.current = true; setOrderDraft({ routines: active, ids: active.map(routine => routine.id), version: version.data });
    scrollRef.current?.getNativeScrollRef()?.measureInWindow((_x, y, _width, height) => { const metric = scrollMetrics.current; metric.top = y; metric.height = height; metric.max = Math.max(metric.min, metric.contentHeight - height + metric.bottom); });
  };
  const saveOrder = async () => {
    if (!client || pendingRef.current || !orderDraft || dragging) return;
    pendingRef.current = true; mutationEpoch.current += 1; setPending('order');
    let next: Notice;
    try {
      const input = { routineIds: orderDraft.ids, expectedListVersion: orderDraft.version, idempotencyKey: createIdempotencyKey() };
      const result = await reorderMobileTrainingRoutines(client, input);
      mutationEpoch.current += 1;
      if (result.status === 'ok') {
        if (alive.current) setConfirmedOrder(result.data.routineIds);
        next = { message: 'Orden guardado' };
      } else {
        if (alive.current) setConfirmedOrder(null);
        next = { message: result.status === 'conflict' ? 'La lista cambió. Actualizamos el orden para que puedas volver a acomodarlo.' : 'No pudimos confirmar el orden. Volvemos a leer la lista para verificar cómo quedó.', error: true };
      }
      if (alive.current) setOrderDraft(null);
      ordering.current = false;
      await refreshAfterMutation();
    } catch {
      next = { message: 'No pudimos confirmar el orden. Actualizá la lista para verificar cómo quedó.', error: true };
      if (alive.current) { setOrderDraft(null); setConfirmedOrder(null); }
      ordering.current = false; await refreshAfterMutation().catch(() => undefined);
    } finally { pendingRef.current = false; if (alive.current) setPending(null); }
    announce(next);
  };
  const scrollAtEdge = (pointer: number) => {
    const metric = scrollMetrics.current;
    const top = Math.max(metric.top, insets.top + 64), bottom = metric.top + metric.height - insets.bottom - 64;
    const delta = pointer < top + 56 ? -Math.min(12, (top + 56 - pointer) / 4)
      : pointer > bottom - 56 ? Math.min(12, (pointer - bottom + 56) / 4) : 0;
    const next = Math.max(metric.min, Math.min(metric.max, metric.y + delta)), difference = next - metric.y;
    if (difference) { metric.y = next; scrollRef.current?.scrollTo({ y: next, animated: false }); }
    return difference;
  };
  const title = archivedOnly ? 'Archivadas' : 'Rutinas';
  const header = <>
    <Stack.Screen options={{
      title, headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text },
      // iOS 26 hides the large title when a header background is set (native-stack adapter).
      headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background },
      headerLargeStyle: { backgroundColor: 'transparent' }, headerBackButtonMenuEnabled: false,
      headerRight: Platform.OS !== 'ios' && !archivedOnly ? () => orderDraft
        ? <DoneButton disabled={Boolean(pending) || dragging || pointerEvents === 'none'} onPress={() => void saveOrder()} />
        : <View style={styles.headerActions}>{active.length >= 2 ? <RoundButton disabled={Boolean(pending) || pointerEvents === 'none'} label="Ordenar rutinas" onPress={openOrder} /> : null}<RoundButton disabled={Boolean(pending) || pointerEvents === 'none'} label="Nueva rutina" onPress={openCreate} /></View> : undefined,
      headerLeft: Platform.OS !== 'ios' ? () => <RoundButton disabled={Boolean(pending) || pointerEvents === 'none'} label="Volver" onPress={() => router.back()} /> : undefined,
    }} />
    {Platform.OS === 'ios' && !archivedOnly ? <Stack.Toolbar placement="right">
      {orderDraft ? <Stack.Toolbar.Button accessibilityLabel="Guardar orden" disabled={Boolean(pending) || dragging || pointerEvents === 'none'} onPress={() => void saveOrder()} separateBackground tintColor={colors.primary}>Listo</Stack.Toolbar.Button> : null}
      {!orderDraft && active.length >= 2 ? <Stack.Toolbar.Button accessibilityLabel="Ordenar rutinas" disabled={Boolean(pending) || pointerEvents === 'none'} icon="arrow.up.arrow.down" onPress={openOrder} separateBackground /> : null}
      {!orderDraft ? <Stack.Toolbar.Button accessibilityLabel="Nueva rutina" disabled={Boolean(pending) || pointerEvents === 'none'} icon="plus" onPress={openCreate} separateBackground tintColor={colors.primary} /> : null}
    </Stack.Toolbar> : null}
  </>;

  const content = !current && state.status === 'loading' ? <RoutinesScrollScreen testID="routines-loading">
    <SkeletonBlock height={24} width={120} /><Surface><SkeletonBlock height={64} /><SkeletonBlock height={64} /><SkeletonBlock height={64} /></Surface>
  </RoutinesScrollScreen> : !current ? <RoutinesScrollScreen testID="routines-unavailable">
    <UnavailableState action={<Button label="Reintentar" onPress={runRefresh} />} description="Revisá la conexión e intentá de nuevo." title={`No pudimos cargar ${title}`} />
  </RoutinesScrollScreen> : <RoutinesScrollScreen scrollRef={scrollRef} scrollEnabled={!dragging} canCancelContentTouches={!orderDraft} scrollEventThrottle={16}
    onScroll={event => { const { contentOffset, contentInset, contentSize, layoutMeasurement } = event.nativeEvent;
      scrollMetrics.current.y = contentOffset.y; scrollMetrics.current.min = -contentInset.top;
      scrollMetrics.current.contentHeight = contentSize.height; scrollMetrics.current.bottom = contentInset.bottom;
      scrollMetrics.current.max = Math.max(-contentInset.top, contentSize.height - layoutMeasurement.height + contentInset.bottom); }}
    onContentSizeChange={(_width, height) => {
      const metric = scrollMetrics.current; metric.contentHeight = height;
      if (metric.height > 0) metric.max = Math.max(metric.min, height - metric.height + metric.bottom);
    }}
    pointerEvents={pointerEvents} contentContainerStyle={{ paddingBottom: notice ? insets.bottom + 100 : spacing.xl }}
    refreshControl={!orderDraft ? <RefreshControl colors={[colors.primary]} onRefresh={runRefresh} progressBackgroundColor={colors.surface}
      refreshing={state.status === 'ready' && state.refreshing} tintColor={colors.primary} /> : undefined} testID={archivedOnly ? 'archived-routines-screen' : 'routines-screen'}>
    {Platform.OS !== 'ios' ? <AppText accessibilityRole="header" variant="largeTitle">{title}</AppText> : null}
    {state.status !== 'ready' ? <Surface testID="routines-stale"><InlineUnavailable actionLabel="Reintentar"
      message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={runRefresh} /></Surface> : null}
    <View style={styles.section}>
      {!archivedOnly ? <View style={styles.sectionHeader}>
        <AppText accessibilityRole="header" variant="title2">Activas</AppText>
        {resource?.status === 'ok' ? <AppText muted numeric variant="subheadline">{orderDraft?.ids.length ?? active.length}</AppText> : null}
      </View> : null}
      {resource?.status !== 'ok' && !orderDraft ? <Surface><InlineUnavailable actionLabel="Reintentar" message="No pudimos cargar la lista de rutinas." onAction={runRefresh} /></Surface>
        : rows.length === 0 && !orderDraft ? <EmptyState title={archivedOnly ? 'No tenés rutinas archivadas.' : 'No tenés rutinas activas.'}
          description={archivedOnly ? 'Cuando archives una rutina, la vas a encontrar acá.' : 'Creá una nueva o restaurá una archivada.'} action={archivedOnly ? undefined : <Button label="Crear nueva" onPress={openCreate} />} />
          : orderDraft ? <RoutineOrderList routines={orderDraft.routines} ids={orderDraft.ids} disabled={Boolean(pending)}
            onChange={ids => setOrderDraft(previous => previous ? { ...previous, ids } : null)} onDragging={setDragging} scrollAtEdge={scrollAtEdge} />
          : <View style={[styles.list, { backgroundColor: colors.surface }]}>
            {rows.map((routine, index) => <View key={routine.id}>
              {index > 0 ? <View style={styles.separator}><Separator /></View> : null}
              <RoutineRow disabled={Boolean(pending) || Boolean(orderDraft)} onDuplicate={() => void openDuplicate(routine)} onColor={() => openEditor(routine, true)} onOpen={() => openEditor(routine)}
                onStart={() => { if (!pendingRef.current) starter.start({ routineId: routine.id }); }}
                onStatus={() => void changeStatus(routine, !routine.isActive)} routine={routine} />
            </View>)}
          </View>}
      <AppText muted variant="footnote">{archivedOnly
        ? 'No aparecen al empezar un entrenamiento. Sus sesiones y su historial quedan intactos.'
        : 'Editar una rutina no cambia tus sesiones anteriores.'}</AppText>
    </View>
    {!archivedOnly && !orderDraft && resource?.status === 'ok' ? <Pressable accessibilityLabel={`Archivadas, ${archived.length}`} accessibilityRole="button"
      disabled={Boolean(pending)} onPress={() => router.push('/(tabs)/train/routines/archived')}
      style={({ pressed }) => [styles.archived, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}>
      <AppIcon color={colors.textMuted} name="archive" size={20} />
      <AppText style={styles.flex} variant="body">Archivadas</AppText>
      <AppText muted numeric variant="subheadline">{archived.length}</AppText>
      <AppIcon color={colors.textMuted} name="chevronRight" size={20} />
    </Pressable> : null}
  </RoutinesScrollScreen>;

  return <>
    {header}{content}
    {notice ? <Animated.View entering={FadeIn.duration(motionDurations.fast)} exiting={FadeOut.duration(motionDurations.fast)}
      style={[styles.toast, { bottom: insets.bottom + spacing.lg }]}>
      <GlassSurface style={styles.toastSurface}>
        <AppText accessibilityRole={notice.error ? 'alert' : undefined} style={styles.flex} variant="subheadline">{notice.message}</AppText>
        {notice.undo ? <Pressable accessibilityLabel="Deshacer archivado" accessibilityRole="button" disabled={Boolean(pending)}
          onPress={() => { if (notice.undo) void changeStatus(notice.undo, true); }} style={[styles.undo, { backgroundColor: colors.brandSubtle }]}>
          <AppText style={{ color: colors.primary }} variant="headline">Deshacer</AppText>
        </Pressable> : null}
      </GlassSurface>
    </Animated.View> : null}
    {createOpen || duplicateSource ? <CreateRoutineSheet key={duplicateSource?.id ?? 'new'} duplicate={duplicateSource ?? undefined} createIdempotencyKey={createIdempotencyKey} onClose={() => { if (!pendingRef.current) { setCreateOpen(false); setDuplicateSource(null); } }}
      onSubmit={create} open pending={pending === 'create' || pending === 'duplicate'} /> : null}
    {starter.element}
  </>;
}

const styles = StyleSheet.create({
  archived: { alignItems: 'center', borderRadius: radius.card, flexDirection: 'row', gap: spacing.md, minHeight: 64, padding: spacing.lg },
  done: { alignItems: 'center', borderRadius: radius.full, height: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  flex: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  list: { borderRadius: radius.card, overflow: 'hidden' },
  round: { alignItems: 'center', borderRadius: radius.full, height: 44, justifyContent: 'center', width: 44 },
  section: { gap: spacing.md },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  separator: { marginLeft: spacing.xxl },
  toast: { left: spacing.lg, position: 'absolute', right: spacing.lg },
  toastSurface: { alignItems: 'center', borderRadius: radius.full, flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  undo: { alignItems: 'center', borderRadius: radius.full, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.lg },
});
