import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, RefreshControl, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { createMobileTrainingRoutine, reorderMobileTrainingRoutines, fetchRoutineDetail, fetchMobileTrainingRoutines, setMobileTrainingRoutineStatus, useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { useCachedRead } from '@/api/use-cached-read';
import type { MobileTrainingRoutine } from '@/api/routines';
import type { MobileApiMutationResult } from '@/api/results';
import {
  AppIcon, AppText, Button, EmptyState, GlassSurface, InlineUnavailable,
  Separator, SkeletonBlock, Surface, UnavailableState, motionDurations, pressedStyle, radius, sizes, spacing, useOwnlevelTheme, useReduceMotion,
} from '@/design-system';

import { duplicateRoutine, routineDuplicateSource } from './routine-duplicate';
import { CreateRoutineSheet, type DuplicateRoutineSource, type RoutineCreateInput } from './create-routine-sheet';
import { RoutineOrderList } from './routine-order-list';
import { RoutineRow } from './routine-row';
import { DragScrollView } from './session-native-interactions';
import { useStartConfirmPointerEvents } from './start-confirm-lock';
import { useSessionStarter } from './use-session-starter';

type PendingMutation = 'archive' | 'create' | 'duplicate-load' | 'duplicate' | 'order-load' | 'order' | 'restore' | null;
/**
 * The routines list is a retained reading of the existing ConfirmedReadCache (#303 C3a): Rutinas and Archivadas share
 * it, and coming back within 30 s shows it without a request. Every settled training write (create, duplicate, edit,
 * archive, restore, reorder, exercise assignment, sessions) invalidates it through the API client. The loader only
 * reads: the per-visit state below never lives in the retained controller.
 */
const loadRoutines = (client: MobileApiClient, signal: AbortSignal) => fetchMobileTrainingRoutines(client, signal);
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
function RoutinesScrollScreen({ children, contentContainerStyle, ...props }: PropsWithChildren<ScrollViewProps>) {
  const { colors } = useOwnlevelTheme();
  const insets = useSafeAreaInsets();
  const scroll = <DragScrollView {...props} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
    style={[{ backgroundColor: colors.background, flex: 1 }, props.style]}
    contentContainerStyle={[{ alignSelf: 'center', flexGrow: 1, gap: spacing.md, maxWidth: sizes.contentMaxWidth, padding: spacing.lg,
      paddingBottom: insets.bottom + spacing.xl, width: '100%' }, contentContainerStyle]}>{children}</DragScrollView>;
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
  const [pending, setPending] = useState<PendingMutation>(null);
  const pendingRef = useRef(false);
  /**
   * The confirmed reading shown when the last write of this visit settled (`null`: none yet). Only a DIFFERENT confirmed
   * reading replaces the overlays: provenance by identity, never by comparing millisecond timestamps.
   */
  const writeBaseline = useRef<object | null | undefined>(undefined);
  const [confirmedStatus, setConfirmedStatus] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const { refresh, reload, snapshot, state } = useCachedRead(client, 'training', 'routines', loadRoutines);
  // A confirmed mutation survives a failed refresh; only an authoritative list read after it settled clears it. A read
  // that started before the write never confirms: the write's invalidation cancels it (ConfirmedReadCache).
  useEffect(() => {
    const baseline = writeBaseline.current;
    if (baseline === undefined || state.status !== 'ready' || state.refreshing || state.current === baseline || state.current.data.routines.status !== 'ok') return;
    writeBaseline.current = undefined;
    setConfirmedStatus({}); setConfirmedOrder(null); setConfirmedCopies([]);
  }, [state]);
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
  // Focus, foreground and the 30 s reuse are handled by the retained reading (useCachedRead).
  const runRefresh = () => { if (!pendingRef.current && !ordering.current) void refresh(); };

  /** After a write settled: never joins a read that may predate it (ConfirmedReadCache.reload). */
  const confirmedReading = () => { const reading = snapshot(); return reading.status === 'ready' ? reading.current : null; };
  const refreshAfterMutation = async () => {
    writeBaseline.current = confirmedReading();
    await reload();
  };

  const changeStatus = async (routine: MobileTrainingRoutine, isActive: boolean) => {
    if (!client || pendingRef.current || ordering.current) return;
    pendingRef.current = true;
    setPending(isActive ? 'restore' : 'archive');
    setNotice(null);
    let next: Notice;
    try {
      const result = await setMobileTrainingRoutineStatus(client, routine.id, isActive);
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
    setPending(duplicateSource ? 'duplicate' : 'create');
    try {
      const result = duplicateSource
        ? await duplicateRoutine(client, duplicateSource, input)
        : await createMobileTrainingRoutine(client, input);
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
      setDuplicateSource(routineDuplicateSource(result.data.detail));
    } catch { announce({ message: 'No pudimos cargar la rutina para copiarla. Revisá la conexión e intentá de nuevo.', error: true }); }
    finally { pendingRef.current = false; if (alive.current) setPending(null); }
  };
  const openOrder = async () => {
    if (pendingRef.current || ordering.current || archivedOnly || active.length < 2) return;
    // CAS: the list version sent with a new order is ALWAYS verified by a read started for it (or the read the last
    // write's own invalidation started after it settled), never the retained or rendered reading. Provenance is the
    // reading's identity: a DIFFERENT confirmed reading after the reload, not a millisecond comparison.
    const before = confirmedReading();
    pendingRef.current = true; setPending('order-load');
    try { await reload(); } finally { pendingRef.current = false; if (alive.current) setPending(null); }
    if (!alive.current) return;
    const reading = snapshot();
    const version = reading.status === 'ready' ? reading.current.data.listVersion : undefined;
    const list = reading.status === 'ready' ? reading.current.data.routines : undefined;
    if (reading.status !== 'ready' || reading.refreshing || reading.current === before || version?.status !== 'ok' || list?.status !== 'ok') {
      announce({ message: 'Actualizá la lista antes de ordenar las rutinas.', error: true }); return;
    }
    // The draft is that verified server list: overlays of earlier writes are superseded by it.
    const fresh = list.data.filter(routine => routine.isActive);
    if (fresh.length < 2) return;
    ordering.current = true; setOrderDraft({ routines: fresh, ids: fresh.map(routine => routine.id), version: version.data });
  };
  const saveOrder = async () => {
    if (!client || pendingRef.current || !orderDraft || dragging) return;
    pendingRef.current = true; setPending('order');
    let next: Notice;
    try {
      const input = { routineIds: orderDraft.ids, expectedListVersion: orderDraft.version, idempotencyKey: createIdempotencyKey() };
      const result = await reorderMobileTrainingRoutines(client, input);
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
  const title = archivedOnly ? 'Archivadas' : 'Rutinas';
  const header = <>
    <Stack.Screen options={{
      title, headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text },
      // iOS 26 hides the large title when a header background is set (native-stack adapter).
      headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background },
      headerLargeStyle: { backgroundColor: 'transparent' }, headerBackButtonMenuEnabled: false,
      headerRight: Platform.OS !== 'ios' && !archivedOnly ? () => orderDraft
        ? <DoneButton disabled={Boolean(pending) || dragging || pointerEvents === 'none'} onPress={() => void saveOrder()} />
        : <View style={styles.headerActions}>{active.length >= 2 ? <RoundButton disabled={Boolean(pending) || pointerEvents === 'none'} label="Ordenar rutinas" onPress={() => void openOrder()} /> : null}<RoundButton disabled={Boolean(pending) || pointerEvents === 'none'} label="Nueva rutina" onPress={openCreate} /></View> : undefined,
      headerLeft: Platform.OS !== 'ios' ? () => <RoundButton disabled={Boolean(pending) || pointerEvents === 'none'} label="Volver" onPress={() => router.back()} /> : undefined,
    }} />
    {Platform.OS === 'ios' && !archivedOnly ? <Stack.Toolbar placement="right">
      {orderDraft ? <Stack.Toolbar.Button accessibilityLabel="Guardar orden" disabled={Boolean(pending) || dragging || pointerEvents === 'none'} onPress={() => void saveOrder()} separateBackground tintColor={colors.primary}>Listo</Stack.Toolbar.Button> : null}
      {!orderDraft && active.length >= 2 ? <Stack.Toolbar.Button accessibilityLabel="Ordenar rutinas" disabled={Boolean(pending) || pointerEvents === 'none'} icon="arrow.up.arrow.down" onPress={() => void openOrder()} separateBackground /> : null}
      {!orderDraft ? <Stack.Toolbar.Button accessibilityLabel="Nueva rutina" disabled={Boolean(pending) || pointerEvents === 'none'} icon="plus" onPress={openCreate} separateBackground tintColor={colors.primary} /> : null}
    </Stack.Toolbar> : null}
  </>;

  const content = !current && state.status === 'loading' ? <RoutinesScrollScreen testID="routines-loading">
    <SkeletonBlock height={24} width={120} /><Surface><SkeletonBlock height={64} /><SkeletonBlock height={64} /><SkeletonBlock height={64} /></Surface>
  </RoutinesScrollScreen> : !current ? <RoutinesScrollScreen testID="routines-unavailable">
    <UnavailableState action={<Button label="Reintentar" onPress={runRefresh} />} description="Revisá la conexión e intentá de nuevo." title={`No pudimos cargar ${title}`} />
  </RoutinesScrollScreen> : <RoutinesScrollScreen canCancelContentTouches={!orderDraft}
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
            onChange={ids => setOrderDraft(previous => previous ? { ...previous, ids } : null)} onDragging={setDragging} />
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
