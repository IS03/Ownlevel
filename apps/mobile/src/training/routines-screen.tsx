import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { createMobileTrainingRoutine, fetchMobileTrainingRoutines, setMobileTrainingRoutineStatus, useApiResource, useMobileApi } from '@/api';
import type { MobileTrainingRoutine } from '@/api/routines';
import type { MobileApiMutationResult } from '@/api/results';
import {
  AppIcon, AppText, Button, EmptyState, GlassSurface, InlineUnavailable, ScrollScreen,
  Separator, SkeletonBlock, Surface, UnavailableState, motionDurations, pressedStyle, radius, sizes, spacing, useOwnlevelTheme, useReduceMotion,
} from '@/design-system';

import { CreateRoutineSheet, type RoutineCreateInput } from './create-routine-sheet';
import { RoutineRow } from './routine-row';
import { useStartConfirmPointerEvents } from './start-confirm-lock';
import { useSessionStarter } from './use-session-starter';

const UNAVAILABLE = {
  status: 'unavailable' as const, reason: 'invalid_response' as const,
  meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const },
};
type PendingMutation = 'archive' | 'create' | 'restore' | null;
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
      <AppIcon color={label === 'Nueva rutina' ? colors.primary : colors.text} name={label === 'Nueva rutina' ? 'plus' : 'chevronLeft'} size={20} />
    </Pressable>
  </GlassSurface>;
}

/** UIKit must discover the ScrollView directly to manage large-title expansion and collapse. */
function RoutinesScrollScreen({ children, contentContainerStyle, ...props }: PropsWithChildren<ScrollViewProps>) {
  const { colors } = useOwnlevelTheme();
  const insets = useSafeAreaInsets();
  if (Platform.OS !== 'ios') return <ScrollScreen glow={false} contentContainerStyle={contentContainerStyle} {...props}>{children}</ScrollScreen>;
  return <ScrollView {...props} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
    style={[{ backgroundColor: colors.background, flex: 1 }, props.style]}
    contentContainerStyle={[{ alignSelf: 'center', flexGrow: 1, gap: spacing.md, maxWidth: sizes.contentMaxWidth, padding: spacing.lg,
      paddingBottom: insets.bottom + spacing.xl, width: '100%' }, contentContainerStyle]}>{children}</ScrollView>;
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
      }
      return result;
    });
  }, [client]);
  const { refresh, state } = useApiResource(load);
  const current = state.status === 'ready' ? state.current : state.status === 'loading' ? undefined : state.previous;
  const resource = current?.data.routines;
  const sorted = resource?.status === 'ok' ? resource.data.map(routine => ({ ...routine, isActive: confirmedStatus[routine.id] ?? routine.isActive }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)) : [];
  const active = sorted.filter(routine => routine.isActive);
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
  useFocusEffect(useCallback(() => { if (!pendingRef.current) void refresh(); }, [refresh]));
  const runRefresh = () => { if (!pendingRef.current) void refresh(); };

  const refreshAfterMutation = async () => {
    await refresh();
    // useApiResource coalesces reads. An older foreground read must finish before the new one.
    if (lastReadEpoch.current !== mutationEpoch.current) await refresh();
  };

  const changeStatus = async (routine: MobileTrainingRoutine, isActive: boolean) => {
    if (!client || pendingRef.current) return;
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
    if (!client || pendingRef.current) return 'Esperá a que termine la acción actual.';
    pendingRef.current = true;
    mutationEpoch.current += 1;
    setPending('create');
    try {
      const result = await createMobileTrainingRoutine(client, input);
      mutationEpoch.current += 1;
      if (result.status !== 'ok') {
        if (result.status === 'conflict') return 'Ese intento ya se usó con otros datos. Cambiá el nombre o color e intentá de nuevo.';
        if (result.status === 'unavailable') return 'No pudimos confirmar la creación. Reintentá con el mismo nombre y color para verificarla.';
        return mutationErrorMessage(result);
      }
      if (alive.current) setCreateOpen(false);
      await refreshAfterMutation();
      announce({ message: 'Rutina creada' });
      return null;
    } catch {
      return 'No pudimos confirmar la creación. Reintentá con el mismo nombre y color para verificarla.';
    } finally {
      pendingRef.current = false;
      if (alive.current) setPending(null);
    }
  };

  const openEditor = (routine: MobileTrainingRoutine, editIdentity = false) => {
    if (pendingRef.current) return;
    router.push({ pathname: '/(tabs)/train/routines/[id]', params: { id: routine.id, ...(editIdentity ? { editIdentity: '1' } : {}) } });
  };
  const openCreate = () => { if (!pendingRef.current) setCreateOpen(true); };
  const title = archivedOnly ? 'Archivadas' : 'Rutinas';
  const header = <>
    <Stack.Screen options={{
      title, headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text },
      // iOS 26 hides the large title when a header background is set (native-stack adapter).
      headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background },
      headerLargeStyle: { backgroundColor: 'transparent' }, headerBackButtonMenuEnabled: false,
      headerRight: Platform.OS !== 'ios' && !archivedOnly ? () => <RoundButton disabled={Boolean(pending) || pointerEvents === 'none'} label="Nueva rutina" onPress={openCreate} /> : undefined,
      headerLeft: Platform.OS !== 'ios' ? () => <RoundButton disabled={Boolean(pending) || pointerEvents === 'none'} label="Volver" onPress={() => router.back()} /> : undefined,
    }} />
    {Platform.OS === 'ios' && !archivedOnly ? <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button accessibilityLabel="Nueva rutina" disabled={Boolean(pending) || pointerEvents === 'none'} icon="plus" onPress={openCreate} separateBackground tintColor={colors.primary} />
    </Stack.Toolbar> : null}
  </>;

  const content = !current && state.status === 'loading' ? <RoutinesScrollScreen testID="routines-loading">
    <SkeletonBlock height={24} width={120} /><Surface><SkeletonBlock height={64} /><SkeletonBlock height={64} /><SkeletonBlock height={64} /></Surface>
  </RoutinesScrollScreen> : !current ? <RoutinesScrollScreen testID="routines-unavailable">
    <UnavailableState action={<Button label="Reintentar" onPress={runRefresh} />} description="Revisá la conexión e intentá de nuevo." title={`No pudimos cargar ${title}`} />
  </RoutinesScrollScreen> : <RoutinesScrollScreen pointerEvents={pointerEvents} contentContainerStyle={{ paddingBottom: notice ? insets.bottom + 100 : spacing.xl }}
    refreshControl={<RefreshControl colors={[colors.primary]} onRefresh={runRefresh} progressBackgroundColor={colors.surface}
      refreshing={state.status === 'ready' && state.refreshing} tintColor={colors.primary} />} testID={archivedOnly ? 'archived-routines-screen' : 'routines-screen'}>
    {Platform.OS !== 'ios' ? <AppText accessibilityRole="header" variant="largeTitle">{title}</AppText> : null}
    {state.status !== 'ready' ? <Surface testID="routines-stale"><InlineUnavailable actionLabel="Reintentar"
      message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={runRefresh} /></Surface> : null}
    <View style={styles.section}>
      {!archivedOnly ? <View style={styles.sectionHeader}>
        <AppText accessibilityRole="header" variant="title2">Activas</AppText>
        {resource?.status === 'ok' ? <AppText muted numeric variant="subheadline">{active.length}</AppText> : null}
      </View> : null}
      {resource?.status !== 'ok' ? <Surface><InlineUnavailable actionLabel="Reintentar" message="No pudimos cargar la lista de rutinas." onAction={runRefresh} /></Surface>
        : rows.length === 0 ? <EmptyState title={archivedOnly ? 'No tenés rutinas archivadas.' : 'No tenés rutinas activas.'}
          description={archivedOnly ? 'Cuando archives una rutina, la vas a encontrar acá.' : 'Creá una nueva o restaurá una archivada.'} action={archivedOnly ? undefined : <Button label="Crear nueva" onPress={openCreate} />} />
          : <View style={[styles.list, { backgroundColor: colors.surface }]}>
            {rows.map((routine, index) => <View key={routine.id}>
              {index > 0 ? <View style={styles.separator}><Separator /></View> : null}
              <RoutineRow disabled={Boolean(pending)} onColor={() => openEditor(routine, true)} onOpen={() => openEditor(routine)}
                onStart={() => { if (!pendingRef.current) starter.start({ routineId: routine.id }); }}
                onStatus={() => void changeStatus(routine, !routine.isActive)} routine={routine} />
            </View>)}
          </View>}
      <AppText muted variant="footnote">{archivedOnly
        ? 'No aparecen al empezar un entrenamiento. Sus sesiones y su historial quedan intactos.'
        : 'Editar una rutina no cambia tus sesiones anteriores.'}</AppText>
    </View>
    {!archivedOnly && resource?.status === 'ok' ? <Pressable accessibilityLabel={`Archivadas, ${archived.length}`} accessibilityRole="button"
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
    {createOpen ? <CreateRoutineSheet createIdempotencyKey={createIdempotencyKey} onClose={() => { if (!pendingRef.current) setCreateOpen(false); }}
      onSubmit={create} open pending={pending === 'create'} /> : null}
    {starter.element}
  </>;
}

const styles = StyleSheet.create({
  archived: { alignItems: 'center', borderRadius: radius.card, flexDirection: 'row', gap: spacing.md, minHeight: 64, padding: spacing.lg },
  flex: { flex: 1 },
  list: { borderRadius: radius.card, overflow: 'hidden' },
  round: { alignItems: 'center', borderRadius: radius.full, height: 44, justifyContent: 'center', width: 44 },
  section: { gap: spacing.md },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  separator: { marginLeft: spacing.xxl },
  toast: { left: spacing.lg, position: 'absolute', right: spacing.lg },
  toastSurface: { alignItems: 'center', borderRadius: radius.full, flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  undo: { alignItems: 'center', borderRadius: radius.full, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.lg },
});
