import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Keyboard, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/build/react-navigation/core/usePreventRemove';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { fetchRoutineDetail, replaceRoutineTemplate, setMobileTrainingRoutineStatus, updateRoutineIdentity, useApiResource, useMobileApi } from '@/api';
import type { RoutineDetail, RoutineTemplatePayload } from '@/api/routine-editor';
import type { MobileApiMutationResult } from '@/api/results';
import type { MobileTrainingExercise } from '@/api/exercises';
import { AppText, Button, EmptyState, GlassSurface, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, motionDurations, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { CreateRoutineSheet, type DuplicateRoutineSource, type RoutineCreateInput } from './create-routine-sheet';
import { duplicateRoutine, routineDuplicateSource } from './routine-duplicate';
import { appendExercises, draftFromTargets, isTargetsDirty, targetsFromDraft, templatePayload, validateTargetsDraft, type TargetsDraft } from './routine-editor-model';
import { RoutineEditorMenu } from './routine-editor-menu';
import { RoutineExerciseList } from './routine-exercise-list';
import { DragScrollView } from './session-native-interactions';
import { RoutineExercisePicker } from './routine-exercise-picker';
import { RoutineTargetsSheet } from './routine-targets-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
import { RoutineRemoveConfirm } from './routine-remove-confirm';
import { StartConfirm } from './start-confirm';
import { useStartConfirmPointerEvents } from './start-confirm-lock';
import { useSessionStarter } from './use-session-starter';

type Edit = { base: RoutineDetail; itemId: string; draft: TargetsDraft; errors: Record<string, string> };
type Notice = { message: string; undoActive?: boolean; error?: boolean };
function defaultKey() { return globalThis.crypto?.randomUUID?.() ?? `routine-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function mutationError(result: MobileApiMutationResult<unknown>) {
  if (result.status === 'validation' || result.status === 'not_found') return result.message;
  if (result.status === 'auth_required' || result.status === 'unauthorized') return 'Tu sesión necesita volver a validarse.';
  return 'No pudimos confirmar el cambio. Revisá la conexión e intentá nuevamente.';
}
const plural = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

export function RoutineEditorScreen({ createIdempotencyKey = defaultKey }: { createIdempotencyKey?: () => string }) {
  const params = useLocalSearchParams<{ id: string; editIdentity?: string }>(), id = typeof params.id === 'string' ? params.id : '';
  const { client } = useMobileApi(), { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), router = useRouter(), navigation = useNavigation();
  const [detail, setDetail] = useState<RoutineDetail | null>(null), [notFound, setNotFound] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null), editRef = useRef<Edit | null>(null);
  const [closingEdit, setClosingEdit] = useState<Edit | null>(null), afterDismiss = useRef<(() => void) | null>(null);
  const [form, setForm] = useState<'identity' | 'duplicate' | 'picker' | null>(null), [duplicateSource, setDuplicateSource] = useState<DuplicateRoutineSource | null>(null);
  const [pending, setPending] = useState<string | null>(null), busy = useRef(false), blockedRead = useRef(false), alive = useRef(true);
  const startReadLock = useRef(false);
  const [startOpen, setStartOpen] = useState(false), [removeId, setRemoveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noticeHeight, setNoticeHeight] = useState(brandTokens.layout.minTouch + spacing.md * 2);
  const [pickerError, setPickerError] = useState<string | undefined>(), [dragging, setDragging] = useState(false), dragRef = useRef(false);
  const [listEpoch, setListEpoch] = useState(0), [keyboardOpen, setKeyboardOpen] = useState(false), [floating, setFloating] = useState(false);
  const epoch = useRef(0), appliedEpoch = useRef(-1), headerBottom = useRef<number | null>(null);
  const scrollMetrics = useRef({ y: 0, min: 0, max: 0, top: 0, height: 0, contentHeight: 0, bottom: 0 });
  const starter = useSessionStarter({ onSession: sessionId => router.replace(`/(tabs)/train/session/${sessionId}`) });
  const confirmPointerEvents = useStartConfirmPointerEvents();
  const announce = useCallback((next: Notice) => {
    if (!alive.current) return;
    if (timer.current) clearTimeout(timer.current);
    setNotice(next); void AccessibilityInfo.announceForAccessibility(next.message);
    timer.current = setTimeout(() => { if (alive.current) setNotice(null); }, 4000);
  }, []);
  useEffect(() => { alive.current = true; const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true)), hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { alive.current = false; show.remove(); hide.remove(); if (timer.current) clearTimeout(timer.current); }; }, []);
  const load = useCallback((signal: AbortSignal) => {
    const readEpoch = epoch.current;
    return client && id ? fetchRoutineDetail(client, id, signal).then(result => {
      if (result.status === 'ok' && alive.current && !signal.aborted && !busy.current && !blockedRead.current && !dragRef.current && readEpoch === epoch.current) {
        appliedEpoch.current = readEpoch;
        if (result.data.kind === 'not_found') { setNotFound(true); setDetail(null); }
        else { setNotFound(false); setDetail(result.data.detail); }
      }
      return result;
    }) : Promise.resolve({ status: 'unavailable' as const, reason: 'invalid_response' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } });
  }, [client, id]);
  const { state, refresh } = useApiResource(load);
  const readLatest = useCallback(async () => { await refresh(); if (appliedEpoch.current !== epoch.current && !blockedRead.current && !busy.current) await refresh(); }, [refresh]);
  const closeSheets = useCallback(() => { if (editRef.current) setClosingEdit(editRef.current); editRef.current = null; blockedRead.current = false; setEdit(null); setForm(null); setDuplicateSource(null); setPickerError(undefined); Keyboard.dismiss(); }, []);
  const closeAndRefresh = useCallback(() => { if (busy.current) return; closeSheets(); void readLatest(); }, [closeSheets, readLatest]);
  const dirty = Boolean(edit && isTargetsDirty(edit.draft, edit.base.items.find(item => item.routineExerciseId === edit.itemId)!.targets));
  const discard = useCallback((next: () => void) => {
    if (busy.current) return;
    const current = editRef.current, confirmed = current?.base.items.find(item => item.routineExerciseId === current.itemId)?.targets;
    if (!current || !confirmed || !isTargetsDirty(current.draft, confirmed)) { next(); return; }
    Alert.alert('Tenés cambios sin guardar', 'Salir ahora descarta esos objetivos locales. Las sesiones anteriores no se modifican.', [
      { text: 'Seguir editando', style: 'cancel' }, { text: 'Salir sin guardar', style: 'destructive', onPress: next },
    ]);
  }, []);
  usePreventRemove(dirty || Boolean(pending) || dragging || Boolean(closingEdit), ({ data }) => { if (closingEdit) return; discard(() => { closeSheets(); navigation.dispatch(data.action); }); });
  const identityHandled = useRef(false);
  useEffect(() => { if (params.editIdentity === '1' && detail && !identityHandled.current && !busy.current && !blockedRead.current) {
    identityHandled.current = true; blockedRead.current = true; setForm('identity');
  } }, [detail, params.editIdentity]);
  const begin = (operation: string) => { if (!client || busy.current || !detail) return false; busy.current = true; epoch.current += 1; setPending(operation); return true; };
  const finish = () => { epoch.current += 1; busy.current = false; if (alive.current) setPending(null); };
  const missing = () => { closeSheets(); setNotFound(true); setDetail(null); announce({ message: 'La rutina ya no está disponible. Los cambios no se guardaron.', error: true }); };

  const runTemplate = async (payload: RoutineTemplatePayload, success: string) => {
    if (!begin('template') || !client) return;
    try {
      const result = await replaceRoutineTemplate(client, id, payload); finish(); if (!alive.current) return;
      if (result.status === 'ok') { setDetail(result.data); closeSheets(); setListEpoch(value => value + 1); announce({ message: success }); void readLatest(); }
      else if (result.status === 'conflict' && result.code === 'ROUTINE_TEMPLATE_CHANGED') {
        closeSheets(); setListEpoch(value => value + 1); announce({ message: 'La rutina cambió en otro lugar. Los cambios no se guardaron. Volvemos a leer la versión actual.', error: true }); await readLatest();
      } else if (result.status === 'not_found') { missing(); void readLatest(); }
      else {
        const message = mutationError(result); setListEpoch(value => value + 1);
        if (editRef.current) { const next = { ...editRef.current, errors: { write: message } }; editRef.current = next; setEdit(next); }
        else if (form === 'picker') setPickerError(message);
        announce({ message, error: true });
        if (!blockedRead.current) await readLatest();
      }
    } catch {
      finish(); if (!alive.current) return;
      const message = 'No pudimos confirmar el cambio. Revisá la conexión antes de volver a guardar.';
      if (editRef.current) { const next = { ...editRef.current, errors: { write: message } }; editRef.current = next; setEdit(next); }
      else if (form === 'picker') setPickerError(message);
      setListEpoch(value => value + 1); announce({ message, error: true }); if (!blockedRead.current) await readLatest();
    }
  };
  const openExercise = (itemId: string) => {
    if (!detail || busy.current || blockedRead.current || dragRef.current) return;
    const item = detail.items.find(candidate => candidate.routineExerciseId === itemId); if (!item) return;
    const next = { base: detail, itemId, draft: draftFromTargets(item.targets), errors: {} };
    blockedRead.current = true; editRef.current = next; setEdit(next);
  };
  const saveTargets = () => {
    const current = editRef.current; if (!current || busy.current) return;
    const errors = validateTargetsDraft(current.draft);
    if (Object.keys(errors).length) { const next = { ...current, errors }; editRef.current = next; setEdit(next); return; }
    try { void runTemplate(templatePayload(current.base, new Map([[current.itemId, targetsFromDraft(current.draft)]])), 'Objetivos guardados'); }
    catch (cause) { const next = { ...current, errors: { write: cause instanceof Error ? cause.message : 'Revisá los objetivos.' } }; editRef.current = next; setEdit(next); }
  };
  const openForm = (next: 'identity' | 'picker') => { if (busy.current || blockedRead.current || dragRef.current) return; blockedRead.current = true; setForm(next); };
  const submitIdentity = async (input: RoutineCreateInput): Promise<string | null> => {
    if (!detail || !client || !begin('identity')) return 'Esperá a que termine la acción actual.';
    try {
      const result = await updateRoutineIdentity(client, id, { name: input.name, color: input.color, expectedUpdatedAt: detail.routine.updatedAt }); finish(); if (!alive.current) return null;
      if (result.status === 'ok') { setDetail(previous => previous ? { ...previous, routine: result.data.routine } : previous); closeSheets(); announce({ message: 'Rutina actualizada' }); void readLatest(); return null; }
      if (result.status === 'conflict' && result.code === 'ROUTINE_CHANGED') { closeSheets(); announce({ message: 'La rutina cambió en otro lugar. Los cambios no se guardaron. Volvemos a leer los datos actuales.', error: true }); await readLatest(); return null; }
      if (result.status === 'not_found') { missing(); void readLatest(); return null; }
      return mutationError(result);
    } catch { finish(); return 'No pudimos confirmar el cambio. Revisá la conexión e intentá nuevamente.'; }
  };
  const changeStatus = async (active: boolean) => {
    if (!detail || !client || blockedRead.current || dragRef.current || !begin('status')) return;
    const previous = detail.routine.isActive;
    try {
      const result = await setMobileTrainingRoutineStatus(client, id, active); finish(); if (!alive.current) return;
      if (result.status === 'ok') { setDetail(old => old ? { ...old, routine: { ...old.routine, isActive: result.data.routine.isActive, updatedAt: result.data.routine.updatedAt } } : old);
        announce({ message: `${detail.routine.name} ${active ? 'restaurada' : 'archivada'}`, undoActive: previous }); void readLatest(); }
      else if (result.status === 'not_found') { missing(); void readLatest(); }
      else { announce({ message: mutationError(result), error: true }); void readLatest(); }
    } catch { finish(); announce({ message: 'No pudimos confirmar el cambio. Actualizá la rutina para verificar cómo quedó.', error: true }); void readLatest(); }
  };
  const openDuplicate = async () => {
    if (!detail || !client || blockedRead.current || dragRef.current || !begin('duplicate-load')) return;
    try { const result = await fetchRoutineDetail(client, id); finish(); if (!alive.current) return;
      if (result.status === 'ok' && result.data.kind === 'detail') { setDetail(result.data.detail); setDuplicateSource(routineDuplicateSource(result.data.detail)); blockedRead.current = true; setForm('duplicate'); }
      else if (result.status === 'ok') missing(); else announce({ message: 'No pudimos cargar la rutina para copiarla. Revisá la conexión e intentá de nuevo.', error: true });
    } catch { finish(); announce({ message: 'No pudimos cargar la rutina para copiarla. Revisá la conexión e intentá de nuevo.', error: true }); }
  };
  const submitDuplicate = async (input: RoutineCreateInput): Promise<string | null> => {
    if (!client || !duplicateSource || !begin('duplicate')) return 'Esperá a que termine la acción actual.';
    try { const result = await duplicateRoutine(client, duplicateSource, input); finish(); if (!alive.current) return null;
      if (result.status === 'ok') { closeSheets(); announce({ message: 'Rutina duplicada' }); return null; }
      if (result.status === 'conflict' && result.code !== 'IDEMPOTENCY_KEY_REUSED') return 'La rutina cambió. Cerrá esta hoja y abrí Duplicar otra vez para usar la versión actual.';
      if (result.status === 'conflict') return 'Ese intento ya se usó con otros datos. Cambiá el nombre o color e intentá de nuevo.';
      if (result.status === 'not_found') { missing(); void readLatest(); return null; }
      return result.status === 'unavailable' ? 'No pudimos confirmar la copia. Reintentá con el mismo nombre y color para verificarla.' : mutationError(result);
    } catch { finish(); return 'No pudimos confirmar la copia. Reintentá con el mismo nombre y color para verificarla.'; }
  };
  const addExercises = (exercises: MobileTrainingExercise[]) => { if (!detail || busy.current) return;
    try { void runTemplate(appendExercises(detail, exercises), `${plural(exercises.length, 'ejercicio agregado', 'ejercicios agregados')}`); }
    catch (cause) { setPickerError(cause instanceof Error ? cause.message : 'Revisá los ejercicios seleccionados.'); }
  };
  const commitOrder = (ids: string[]) => { if (!detail || busy.current || blockedRead.current) return;
    const payload = templatePayload(detail), byId = new Map(payload.items.map(item => [item.routineExerciseId, item]));
    if (ids.length !== payload.items.length || new Set(ids).size !== ids.length || ids.some(itemId => !byId.has(itemId))) return;
    payload.items = ids.map(itemId => byId.get(itemId)!); void runTemplate(payload, 'Orden guardado');
  };
  const presentedEdit = edit ?? closingEdit;
  const removedItem = detail?.items.find(item => item.routineExerciseId === removeId);
  const rowDisabled = Boolean(pending || form || edit || closingEdit || startOpen || removeId) || confirmPointerEvents === 'none';
  const menu = <Stack.Toolbar placement="right"><Stack.Toolbar.Menu accessibilityLabel="Opciones de rutina" icon="ellipsis" separateBackground disabled={rowDisabled || dragging}>
    <Stack.Toolbar.MenuAction icon="pencil" onPress={() => openForm('identity')}>Cambiar nombre y color</Stack.Toolbar.MenuAction>
    <Stack.Toolbar.MenuAction icon="doc.on.doc" onPress={() => void openDuplicate()}>Duplicar rutina</Stack.Toolbar.MenuAction>
    <Stack.Toolbar.Menu inline><Stack.Toolbar.MenuAction icon="archivebox" onPress={() => { if (detail) void changeStatus(!detail.routine.isActive); }}>{detail?.routine.isActive ? 'Archivar rutina' : 'Restaurar'}</Stack.Toolbar.MenuAction></Stack.Toolbar.Menu>
  </Stack.Toolbar.Menu></Stack.Toolbar>;
  const header = <><Stack.Screen options={{ title: detail?.routine.name ?? 'Rutina', headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text },
    headerTintColor: colors.text, headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background }, headerLargeStyle: { backgroundColor: 'transparent' },
    headerBackVisible: false, headerBackButtonMenuEnabled: false,
    headerLeft: Platform.OS !== 'ios' ? () => <RoutineSheetButton label="Volver a Rutinas" icon="chevronLeft" disabled={rowDisabled || dragging} onPress={() => router.dismissTo('/(tabs)/train/routines')} /> : undefined,
    headerRight: Platform.OS !== 'ios' && detail ? () => <RoutineEditorMenu disabled={rowDisabled || dragging} active={detail.routine.isActive} onIdentity={() => openForm('identity')} onDuplicate={() => void openDuplicate()} onStatus={() => void changeStatus(!detail.routine.isActive)} /> : undefined }} />
    {Platform.OS === 'ios' ? <Stack.Toolbar placement="left"><Stack.Toolbar.Button accessibilityLabel="Volver a Rutinas" icon="chevron.left" separateBackground disabled={rowDisabled || dragging} onPress={() => router.dismissTo('/(tabs)/train/routines')} /></Stack.Toolbar> : null}
    {detail && Platform.OS === 'ios' ? menu : null}</>;
  const footerInset = insets.bottom + brandTokens.layout.tabBarHeight + spacing.lg;
  // NativeTabs includes its bar in the iOS safe area. Count that obstruction once.
  const overlayBottom = Platform.OS === 'ios' ? insets.bottom + spacing.sm : footerInset;
  const content = !detail ? <View style={[styles.state, { backgroundColor: colors.background }]}>
    {state.status === 'loading' && !notFound ? <View testID="routine-editor-loading"><SkeletonBlock height={64} /><SkeletonBlock height={150} /></View>
      : <UnavailableState title={notFound ? 'No encontramos la rutina' : 'No pudimos cargar la rutina'} description={notFound ? 'Esta rutina ya no está disponible.' : 'Tu rutina sigue segura. Revisá la conexión e intentá nuevamente.'}
        action={<Button label={notFound ? 'Volver a Rutinas' : 'Reintentar'} onPress={() => { if (notFound) router.dismissTo('/(tabs)/train/routines'); else void refresh(); }} />} />}
  </View> : <DragScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
    pointerEvents={rowDisabled ? 'none' : 'auto'} style={{ flex: 1, backgroundColor: colors.background }} testID="routine-editor-screen"
    contentContainerStyle={[styles.content, { paddingBottom: footerInset + spacing.xxxl }]}
    onScroll={event => { const { contentOffset, contentInset, contentSize, layoutMeasurement } = event.nativeEvent; const metric = scrollMetrics.current;
      // Fabric omits UIKit's automatic large-title inset; preserve the observed origin.
      metric.y = contentOffset.y; metric.min = Math.min(metric.min, -contentInset.top, contentOffset.y); metric.bottom = contentInset.bottom; metric.height = layoutMeasurement.height; metric.contentHeight = contentSize.height;
      metric.max = Math.max(metric.min, contentSize.height - layoutMeasurement.height + contentInset.bottom);
      setFloating(headerBottom.current !== null && contentOffset.y >= headerBottom.current - contentInset.top);
    }} onContentSizeChange={(_width, height) => { const metric = scrollMetrics.current; metric.contentHeight = height; metric.max = Math.max(metric.min, height - metric.height + metric.bottom); }}
    refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} tintColor={colors.primary} colors={[colors.primary]}
      onRefresh={() => { if (!busy.current && !blockedRead.current && !dragRef.current) void refresh(); }} />}>
    {Platform.OS !== 'ios' ? <AppText accessibilityRole="header" variant="largeTitle">{detail.routine.name}</AppText> : null}
    <AppText muted numeric variant="subheadline">{plural(detail.items.length, 'ejercicio', 'ejercicios')} · {plural(detail.items.reduce((total, item) => total + item.targets.sets.length, 0), 'serie', 'series')}</AppText>
    {state.status !== 'ready' ? <InlineUnavailable message="Mostramos la última lectura confirmada." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    {detail.routine.isActive ? <View>
      <StartConfirm open={startOpen} routineName={detail.routine.name} onCancel={() => { if (!startReadLock.current) return; startReadLock.current = false; blockedRead.current = false; setStartOpen(false); void readLatest(); }}
        onConfirm={() => { if (!startReadLock.current) return; startReadLock.current = false; blockedRead.current = false; setStartOpen(false); if (detail.routine.isActive && !busy.current) starter.start({ routineId: id }); }} />
      <Button icon="play" label="Iniciar entrenamiento" disabled={rowDisabled} onPress={() => { startReadLock.current = true; blockedRead.current = true; setStartOpen(true); }} />
    </View>
      : <View style={styles.group}><AppText variant="footnote">Rutina archivada</AppText><AppText muted variant="footnote">Restaurala desde Opciones de rutina para volver a empezar un entrenamiento.</AppText></View>}
    <View style={styles.sectionHeader} testID="routine-exercises-header" onLayout={event => { headerBottom.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height; setFloating(scrollMetrics.current.y >= headerBottom.current + scrollMetrics.current.min); }}>
      <AppText accessibilityRole="header" variant="title2">Ejercicios</AppText>
      {detail.items.length ? <Pressable accessibilityLabel="Agregar ejercicios" accessibilityRole="button" accessibilityElementsHidden={floating} importantForAccessibility={floating ? 'no-hide-descendants' : 'auto'} disabled={rowDisabled || dragging} onPress={() => openForm('picker')} style={styles.add}>
        <AppText style={{ color: colors.primary }} variant="headline">+ Agregar</AppText></Pressable> : null}
    </View>
    {!detail.items.length ? <EmptyState title="Todavía no tiene ejercicios" description="Agregá el primero para empezar a armar esta rutina." action={<Button label="Agregar ejercicio" onPress={() => openForm('picker')} />} />
      : <RoutineExerciseList key={`${detail.routine.templateVersion}-${detail.items.map(item => item.routineExerciseId).join('|')}-${listEpoch}`} items={detail.items} disabled={rowDisabled} onOpen={openExercise}
        onRemove={itemId => { if (!busy.current && !blockedRead.current && !dragRef.current) setRemoveId(itemId); }} onCommit={commitOrder} onDragging={value => { dragRef.current = value; setDragging(value); }} />}
  </DragScrollView>;
  return <>
    {header}{content}
    {detail && floating && !keyboardOpen && !dragging && !rowDisabled && detail.items.length ? <Animated.View entering={FadeIn.duration(motionDurations.fast)} style={[styles.floating, { bottom: overlayBottom + (notice ? noticeHeight + spacing.sm : 0) }]}>
      <RoutineSheetButton label="Agregar ejercicios" icon="plus" accent onPress={() => openForm('picker')} /></Animated.View> : null}
    {notice ? <Animated.View testID="routine-editor-notice" onLayout={event => setNoticeHeight(event.nativeEvent.layout.height)} entering={FadeIn.duration(motionDurations.fast)} exiting={FadeOut.duration(motionDurations.fast)} style={[styles.toast, { bottom: overlayBottom }]}>
      <GlassSurface style={styles.toastSurface}><AppText numeric accessibilityRole={notice.error ? 'alert' : undefined} style={{ flex: 1 }} variant="subheadline">{notice.message}</AppText>
        {notice.undoActive !== undefined ? <Pressable accessibilityLabel="Deshacer cambio de estado" accessibilityRole="button" disabled={rowDisabled || dragging} onPress={() => { if (notice.undoActive !== undefined) void changeStatus(notice.undoActive); }} style={styles.add}><AppText style={{ color: colors.primary }} variant="headline">Deshacer</AppText></Pressable> : null}
      </GlassSurface></Animated.View> : null}
    {detail && form === 'identity' ? <CreateRoutineSheet identity={routineDuplicateSource(detail)} open pending={pending === 'identity'} onClose={closeAndRefresh} onSubmit={submitIdentity} createIdempotencyKey={createIdempotencyKey} /> : null}
    {form === 'duplicate' && duplicateSource ? <CreateRoutineSheet duplicate={duplicateSource} open pending={pending === 'duplicate'} onClose={closeAndRefresh} onSubmit={submitDuplicate} createIdempotencyKey={createIdempotencyKey} /> : null}
    {detail && form === 'picker' ? <RoutineExercisePicker detail={detail} client={client} pending={pending === 'template'} onClose={closeAndRefresh} onAdd={addExercises} createIdempotencyKey={createIdempotencyKey} error={pickerError} /> : null}
    {presentedEdit ? <RoutineTargetsSheet open={Boolean(edit)} onDismissed={() => { setClosingEdit(null); const next = afterDismiss.current; afterDismiss.current = null; next?.(); }} item={presentedEdit.base.items.find(item => item.routineExerciseId === presentedEdit.itemId)!} draft={presentedEdit.draft} dirty={dirty} pending={pending === 'template'} errors={presentedEdit.errors}
      onChange={draft => { if (busy.current) return; if (!edit) return; const next = { ...edit, draft, errors: {} }; editRef.current = next; setEdit(next); }} onSave={saveTargets}
      onClose={() => discard(closeAndRefresh)} onHistory={() => discard(() => { const exerciseId = presentedEdit.base.items.find(item => item.routineExerciseId === presentedEdit.itemId)!.exercise.id; afterDismiss.current = () => router.push(`/(tabs)/train/history/exercise/${exerciseId}`); closeAndRefresh(); })} /> : null}
    {removedItem ? <RoutineRemoveConfirm open name={removedItem.exercise.name} routineName={detail!.routine.name} onCancel={() => setRemoveId(null)} onConfirm={() => {
      if (!detail || busy.current) return; const payload = templatePayload(detail); payload.items = payload.items.filter(item => item.routineExerciseId !== removeId); setRemoveId(null); void runTemplate(payload, 'Ejercicio quitado');
    }} /> : null}
    {starter.element}
  </>;
}
const styles = StyleSheet.create({ state: { flex: 1, padding: spacing.lg }, content: { padding: spacing.lg, gap: spacing.xl }, group: { gap: spacing.xs }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg }, add: { minHeight: brandTokens.layout.minTouch, justifyContent: 'center', paddingHorizontal: spacing.sm }, floating: { position: 'absolute', right: spacing.lg }, toast: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' }, toastSurface: { maxWidth: 400, borderRadius: radius.card, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md } });
