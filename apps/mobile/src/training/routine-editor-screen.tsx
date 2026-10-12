import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/build/react-navigation/core/usePreventRemove';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchMobileTrainingExercises, fetchRoutineDetail, replaceRoutineTemplate,
  setMobileTrainingRoutineStatus, updateRoutineIdentity, useApiResource, useMobileApi,
} from '@/api';
import type { MobileApiClient } from '@/api/client';
import type { MobileTrainingExercise, MobileTrainingMuscleGroup } from '@/api/exercises';
import type { MobileRoutineColorKey } from '@/api/home';
import type { RoutineDetail, RoutineTemplatePayload } from '@/api/routine-editor';
import type { MobileApiMutationResult } from '@/api/results';
import {
  AppIcon, AppText, Button, EmptyState, Heading, InlineUnavailable, ScrollScreen,
  Separator, SkeletonBlock, Surface, TextField, UnavailableState, radius, sizes, spacing,
  useOwnlevelTheme,
} from '@/design-system';

import { MUSCLE_GROUP_OPTIONS, exerciseSummary } from './exercise-library-model';
import {
  addSet, draftFromTargets, isTargetsDirty, pickerExercises, removeSet,
  reorderTemplate, targetsFromCatalog, targetsFromDraft, templatePayload,
  toggleAdjustment, type TargetsDraft,
} from './routine-editor-model';
import { trainingRoutineColor } from './routine-colors';
import { RoutineColorPicker } from './routine-color-picker';
import { StartConfirm } from './start-confirm';
import { useStartConfirmPointerEvents } from './start-confirm-lock';
import { useSessionStarter } from './use-session-starter';

function errorMessage(result: MobileApiMutationResult<unknown>): string {
  if (result.status === 'validation' || result.status === 'not_found') return result.message;
  if (result.status === 'auth_required' || result.status === 'unauthorized') {
    return 'Tu sesión necesita volver a validarse.';
  }
  return 'No pudimos guardar. Revisá la conexión e intentá nuevamente.';
}

function plural(value: number, singular: string, pluralValue: string): string {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

function closeButton(label: string, onPress: () => void, disabled = false) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={styles.closeButton}
    >
      <AppText style={styles.closeText}>×</AppText>
    </Pressable>
  );
}

function ModalShell({
  children, onClose, pending, title, description,
}: {
  children: React.ReactNode;
  onClose: () => void;
  pending: boolean;
  title: string;
  description: string;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Heading level={2}>{title}</Heading>
            <AppText muted variant="caption">{description}</AppText>
          </View>
          {closeButton(`Cerrar ${title}`, onClose, pending)}
        </View>
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function IdentityModal({
  detail, onClose, onSubmit, pending,
}: {
  detail: RoutineDetail;
  onClose: () => void;
  onSubmit: (name: string, color: MobileRoutineColorKey | null) => void;
  pending: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const [name, setName] = useState(detail.routine.name);
  const [color, setColor] = useState<MobileRoutineColorKey | null>(detail.routine.color);
  const [colorChosen, setColorChosen] = useState(false);
  const colorReady = detail.routine.unrecognizedColor === undefined || colorChosen;
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!colorReady || pending) return;
    const normalized = name.trim();
    if (!normalized || normalized.length > 120) {
      setError('Ingresá un nombre de hasta 120 caracteres.');
      return;
    }
    onSubmit(normalized, color);
  };
  return (
    <Modal animationType="slide" onRequestClose={pending ? undefined : onClose} presentationStyle="pageSheet" visible>
      <ModalShell description="Actualizá su nombre o color. Esto no modifica sesiones anteriores." onClose={onClose} pending={pending} title="Editar rutina">
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <TextField label="Nombre" accessibilityLabel="Nombre de la rutina" disabled={pending} onChangeText={setName} value={name} />
          {!colorReady ? <AppText muted variant="footnote">Esta rutina usa un color de una versión más nueva. Elegí un color o “Sin color” para editarla.</AppText> : null}
          <RoutineColorPicker color={color} disabled={pending} onChange={value => { setColor(value); setColorChosen(true); }} />
          <Pressable
            accessibilityLabel="Sin color"
            accessibilityRole="radio"
            accessibilityState={{ checked: (colorReady && color === null) }}
            disabled={pending}
            onPress={() => { setColor(null); setColorChosen(true); }}
            style={[
              styles.noColorOption,
              {
                backgroundColor: (colorReady && color === null) ? colors.brandSubtle : colors.surface,
                borderColor: (colorReady && color === null) ? colors.primary : colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.noColorIndicator,
                { borderColor: (colorReady && color === null) ? colors.primary : colors.border },
              ]}
            >
              {(colorReady && color === null) ? <AppIcon color={colors.primary} name="check" size={20} /> : null}
            </View>
            <AppText variant="label">Sin color</AppText>
          </Pressable>
          {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="caption">{error}</AppText> : null}
          <Button disabled={pending || !colorReady} label={pending ? 'Guardando…' : 'Guardar cambios'} onPress={submit} />
        </ScrollView>
      </ModalShell>
    </Modal>
  );
}

function ExercisePicker({
  client, detail, onAdd, onClose, pending,
}: {
  client: MobileApiClient | null;
  detail: RoutineDetail;
  onAdd: (exercise: MobileTrainingExercise) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<MobileTrainingMuscleGroup | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback((signal: AbortSignal) => client
    ? fetchMobileTrainingExercises(client, signal)
    : Promise.resolve({
        status: 'unavailable' as const, reason: 'invalid_response' as const,
        meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const },
      }), [client]);
  const { refresh, state } = useApiResource(load);
  const current = state.status === 'ready' ? state.current : state.status === 'loading' ? undefined : state.previous;
  const catalog = current?.data.catalog;
  const existing = useMemo(() => new Set(detail.items.map((item) => item.exercise.id)), [detail.items]);
  const available = useMemo(() => catalog?.status === 'ok'
    ? pickerExercises(catalog.data.exercises, existing, query, group)
    : [], [catalog, existing, group, query]);
  const picked = available.find((exercise) => exercise.id === selected);
  return (
    <Modal animationType="slide" onRequestClose={pending ? undefined : onClose} presentationStyle="pageSheet" visible>
      <ModalShell description="Los ejercicios que ya están en esta rutina no se pueden duplicar." onClose={onClose} pending={pending} title="Agregar ejercicio">
        <View style={styles.pickerControls}>
          <TextInput
            accessibilityLabel="Buscar ejercicio"
            onChangeText={setQuery}
            placeholder="Buscar ejercicio"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            value={query}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupScroll}>
            {[{ value: null, label: 'Todos' }, ...MUSCLE_GROUP_OPTIONS].map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: group === option.value }}
                key={option.value ?? 'all'}
                onPress={() => setGroup(option.value)}
                style={[styles.groupChip, { borderColor: group === option.value ? colors.primary : colors.border, backgroundColor: group === option.value ? colors.brandSubtle : colors.surface }]}
              ><AppText variant="caption">{option.label}</AppText></Pressable>
            ))}
          </ScrollView>
        </View>
        <ScrollView contentContainerStyle={styles.pickerList} keyboardShouldPersistTaps="handled">
          {!current && state.status === 'loading' ? <SkeletonBlock height={200} /> : catalog?.status !== 'ok' ? (
            <InlineUnavailable actionLabel="Reintentar" message="No pudimos cargar la biblioteca." onAction={() => void refresh()} />
          ) : available.length === 0 ? (
            <EmptyState description="Probá con otro filtro o buscá por nombre." title="No hay ejercicios disponibles" />
          ) : available.map((exercise) => (
            <Pressable
              accessibilityLabel={`${exercise.name}${selected === exercise.id ? ', seleccionado' : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected === exercise.id }}
              key={exercise.id}
              onPress={() => setSelected(exercise.id)}
              style={[styles.pickerRow, { borderColor: selected === exercise.id ? colors.primary : colors.border, backgroundColor: colors.surface }]}
            >
              <View style={styles.flex}>
                <AppText variant="label">{exercise.name}</AppText>
                {exerciseSummary(exercise) ? <AppText muted variant="caption">{exerciseSummary(exercise)}</AppText> : null}
              </View>
              {selected === exercise.id ? <AppIcon color={colors.primary} name="check" size={22} /> : null}
            </Pressable>
          ))}
        </ScrollView>
        <View style={[styles.modalFooter, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Button disabled={!picked || pending} label={pending ? 'Agregando…' : 'Agregar a la rutina'} onPress={() => { if (picked) onAdd(picked); }} />
        </View>
      </ModalShell>
    </Modal>
  );
}

function TargetInput({ label, value, onChange, keyboardType = 'decimal-pad', editable = true, showLabel = true }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Rest uses mm:ss: the decimal/number pads have no ":" on iOS. */
  keyboardType?: 'decimal-pad' | 'number-pad' | 'numbers-and-punctuation';
  editable?: boolean;
  showLabel?: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <View style={styles.targetInputWrap}>
      {showLabel ? <AppText muted variant="caption">{label}</AppText> : null}
      <TextInput
        accessibilityLabel={label}
        editable={editable}
        keyboardType={keyboardType}
        onChangeText={onChange}
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        selectTextOnFocus
        style={[styles.targetInput, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]}
        value={value}
      />
    </View>
  );
}

function TargetsEditor({
  draft, error, onChange, onSave, pending, saved,
}: {
  draft: TargetsDraft;
  error: string | null;
  onChange: (draft: TargetsDraft) => void;
  onSave: () => void;
  pending: boolean;
  saved: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const [advanced, setAdvanced] = useState(false);
  const updateSet = (index: number, key: 'targetReps' | 'targetWeightKg' | 'targetRir', value: string) => {
    onChange({ ...draft, sets: draft.sets.map((set, position) => position === index ? { ...set, [key]: value } : set) });
  };
  return (
    <View style={styles.editorBody}>
      <AppText accessibilityRole="text" style={{ color: saved ? colors.primary : colors.text }} variant="caption">
        {pending ? 'Guardando…' : saved ? 'Objetivo guardado' : 'Cambios sin guardar'}
      </AppText>
      <AppText variant="label">Series</AppText>
      <View accessibilityElementsHidden style={styles.setHeaderRow}>
        <View style={styles.setNumberSpacer} />
        <AppText muted style={styles.setColumnHeader} variant="caption">Reps</AppText>
        <AppText muted style={styles.setColumnHeader} variant="caption">Peso</AppText>
        <AppText muted style={styles.setColumnHeader} variant="caption">RIR</AppText>
        <View style={styles.setRemoveSpacer} />
      </View>
      {draft.sets.map((set, index) => (
        <View key={`set-${index}`} style={styles.setRow}>
          <View style={[styles.ordinal, { backgroundColor: colors.surfaceRaised }]}>
            <AppText variant="caption">{index + 1}</AppText>
          </View>
          <TargetInput editable={!pending} keyboardType="number-pad" label={`Serie ${index + 1}, reps`} onChange={(value) => updateSet(index, 'targetReps', value)} showLabel={false} value={set.targetReps} />
          <TargetInput editable={!pending} label={`Serie ${index + 1}, peso`} onChange={(value) => updateSet(index, 'targetWeightKg', value)} showLabel={false} value={set.targetWeightKg} />
          <TargetInput editable={!pending} keyboardType="number-pad" label={`Serie ${index + 1}, RIR`} onChange={(value) => updateSet(index, 'targetRir', value)} showLabel={false} value={set.targetRir} />
          <Pressable
            accessibilityLabel={`Quitar serie ${index + 1}`}
            accessibilityRole="button"
            disabled={pending || draft.sets.length <= 1}
            onPress={() => onChange(removeSet(draft, index))}
            style={styles.setRemove}
          ><AppText style={{ color: colors.danger }} variant="label">×</AppText></Pressable>
        </View>
      ))}
      <Button disabled={pending || draft.sets.length >= 50} label="+ Agregar serie" onPress={() => onChange(addSet(draft))} variant="secondary" />

      <Separator />
      <AppText variant="label">Descanso</AppText>
      <View style={styles.restRow}>
        <TargetInput editable={!pending} keyboardType="numbers-and-punctuation" label="Mínimo (mm:ss)" onChange={(value) => onChange({ ...draft, restMin: value })} value={draft.restMin} />
        <TargetInput editable={!pending} keyboardType="numbers-and-punctuation" label="Máximo (mm:ss)" onChange={(value) => onChange({ ...draft, restMax: value })} value={draft.restMax} />
      </View>
      <Separator />
      <AppText variant="label">Próxima vez</AppText>
      <View style={styles.adjustmentRow}>
        {([
          ['increase_weight', '+ Peso'], ['increase_reps', '+ Repeticiones'],
        ] as const).map(([value, label]) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: draft.nextAdjustment === value }}
            disabled={pending}
            key={value}
            onPress={() => onChange({ ...draft, nextAdjustment: toggleAdjustment(draft.nextAdjustment, value) })}
            style={[styles.adjustmentChip, { borderColor: draft.nextAdjustment === value ? colors.primary : colors.border, backgroundColor: draft.nextAdjustment === value ? colors.brandSubtle : colors.surface }]}
          ><AppText variant="caption">{label}</AppText></Pressable>
        ))}
      </View>
      {draft.nextAdjustment === 'custom' ? <AppText muted variant="caption">Ajuste personalizado anterior conservado.</AppText> : null}
      <Separator />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(!advanced)} style={styles.expandHeader}>
        <AppText variant="label">Opciones avanzadas · Observaciones</AppText>
        <AppIcon color={colors.textMuted} name="chevronRight" size={16} />
      </Pressable>
      {advanced ? (
        <TextInput
          accessibilityLabel="Observaciones del ejercicio"
          editable={!pending}
          multiline
          onChangeText={(value) => onChange({ ...draft, notes: value })}
          placeholder="Técnica, agarre o posición"
          placeholderTextColor={colors.textMuted}
          style={[styles.notesInput, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]}
          value={draft.notes}
        />
      ) : null}
      {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="caption">{error}</AppText> : null}
      <Button disabled={pending || saved} label={pending ? 'Guardando…' : 'Guardar objetivos'} onPress={onSave} />
    </View>
  );
}

function EditorSkeleton() {
  return (
    <ScrollScreen testID="routine-editor-loading">
      <SkeletonBlock height={64} width="70%" />
      <SkeletonBlock height={48} />
      <SkeletonBlock height={84} />
      <SkeletonBlock height={84} />
    </ScrollScreen>
  );
}

export function RoutineEditorScreen() {
  const params = useLocalSearchParams<{ id: string; editIdentity?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { client } = useMobileApi();
  const { colors, isDark } = useOwnlevelTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const [detail, setDetail] = useState<RoutineDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, TargetsDraft>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  // "Iniciar entrenamiento" asks first (anchored native confirmation), then starts with no chooser.
  const starter = useSessionStarter({ onSession: sessionId => router.replace(`/(tabs)/train/session/${sessionId}`) });
  const confirmPointerEvents = useStartConfirmPointerEvents();
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const identityOpenRef = useRef(false);
  const mutationEpoch = useRef(0);
  const lastAppliedReadEpoch = useRef(-1);

  const load = useCallback((signal: AbortSignal) => {
    const epoch = mutationEpoch.current;
    return client && id
    ? fetchRoutineDetail(client, id, signal).then((result) => {
        if (result.status === 'ok' && !dirtyRef.current && !identityOpenRef.current &&
          !pendingRef.current && !signal.aborted &&
          epoch === mutationEpoch.current) {
          lastAppliedReadEpoch.current = epoch;
          if (result.data.kind === 'not_found') {
            setNotFound(true);
            setDetail(null);
            setDrafts({});
          } else {
            setNotFound(false);
            setDetail(result.data.detail);
            setDrafts({});
          }
        }
        return result;
      })
    : Promise.resolve({
        status: 'unavailable' as const, reason: 'invalid_response' as const,
        meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const },
      });
  }, [client, id]);
  const { refresh, state } = useApiResource(load);
  const dirty = Boolean(detail?.items.some((item) => drafts[item.routineExerciseId] &&
    isTargetsDirty(drafts[item.routineExerciseId]!, item.targets)));
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { identityOpenRef.current = identityOpen; }, [identityOpen]);

  const identityRequestHandled = useRef(false);
  useEffect(() => {
    if (params.editIdentity === '1' && detail && !identityRequestHandled.current && !dirtyRef.current && !pendingRef.current) {
      identityRequestHandled.current = true;
      identityOpenRef.current = true;
      setIdentityOpen(true);
    }
  }, [detail, params.editIdentity]);

  const refreshAfterConflict = useCallback(async () => {
    await refresh();
    // A pre-mutation foreground read can have occupied the resource slot.
    if (lastAppliedReadEpoch.current !== mutationEpoch.current) await refresh();
  }, [refresh]);

  usePreventRemove(dirty || Boolean(pending), ({ data }) => {
    if (pendingRef.current) return;
    Alert.alert('Tenés cambios sin guardar', 'Volver ahora descarta esos objetivos locales. Las sesiones anteriores no se modifican.', [
      { text: 'Seguir editando', style: 'cancel' },
      {
        text: 'Salir sin guardar',
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  const announce = useCallback((message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    void AccessibilityInfo.announceForAccessibility(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 3_500);
  }, []);

  const guardStructure = useCallback(() => {
    if (dirtyRef.current) {
      announce('Guardá los objetivos pendientes antes de cambiar la estructura de la rutina.');
      return false;
    }
    return true;
  }, [announce]);

  const runTemplate = useCallback(async (payload: RoutineTemplatePayload, success: string, expandExerciseId?: string, savedItemId?: string) => {
    if (!client || !detail || pendingRef.current) return;
    mutationEpoch.current += 1;
    pendingRef.current = true;
    setPending('template');
    const result = await replaceRoutineTemplate(client, id, payload);
    pendingRef.current = false;
    setPending(null);
    if (result.status === 'ok') {
      setDetail(result.data);
      const remainingDrafts = savedItemId
        ? Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== savedItemId))
        : {};
      setDrafts(remainingDrafts);
      dirtyRef.current = result.data.items.some((item) => remainingDrafts[item.routineExerciseId] &&
        isTargetsDirty(remainingDrafts[item.routineExerciseId]!, item.targets));
      setFormError(null);
      if (expandExerciseId) {
        const added = result.data.items.find((item) => item.exercise.id === expandExerciseId);
        setExpandedId(added?.routineExerciseId ?? null);
      } else if (expandedId && !result.data.items.some((item) => item.routineExerciseId === expandedId)) {
        setExpandedId(null);
      }
      setPickerOpen(false);
      announce(success);
      if (!dirtyRef.current) void refresh();
    } else if (result.status === 'conflict' && result.code === 'ROUTINE_TEMPLATE_CHANGED') {
      setDrafts({});
      dirtyRef.current = false;
      setFormError(null);
      announce('La rutina cambió en otro lugar. Actualizamos la versión más reciente.');
      await refreshAfterConflict();
    } else if (result.status === 'not_found') {
      dirtyRef.current = false;
      setDrafts({});
      setNotFound(true);
      setDetail(null);
    } else {
      setFormError(result.status === 'validation' ? result.message : null);
      announce(errorMessage(result));
    }
  }, [announce, client, detail, drafts, expandedId, id, refresh, refreshAfterConflict]);

  const updateDraft = useCallback((itemId: string, next: TargetsDraft) => {
    if (pendingRef.current) return;
    setDrafts((old) => ({ ...old, [itemId]: next }));
    setFormError(null);
  }, []);

  const saveTargets = useCallback((itemId: string) => {
    if (!detail || pendingRef.current) return;
    const draft = drafts[itemId];
    if (!draft) return;
    try {
      const targets = targetsFromDraft(draft);
      void runTemplate(templatePayload(detail, new Map([[itemId, targets]])), 'Objetivos guardados.', undefined, itemId);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Revisá los objetivos.');
    }
  }, [detail, drafts, runTemplate]);

  const submitIdentity = useCallback(async (name: string, color: MobileRoutineColorKey | null) => {
    if (!client || !detail || pendingRef.current) return;
    mutationEpoch.current += 1;
    pendingRef.current = true;
    setPending('identity');
    const result = await updateRoutineIdentity(client, id, {
      name, color, expectedUpdatedAt: detail.routine.updatedAt,
    });
    pendingRef.current = false;
    setPending(null);
    if (result.status === 'ok') {
      setDetail((previous) => previous ? { ...previous, routine: result.data.routine } : previous);
      identityOpenRef.current = false;
      setIdentityOpen(false);
      announce('Rutina actualizada.');
    } else if (result.status === 'conflict' && result.code === 'ROUTINE_CHANGED') {
      identityOpenRef.current = false;
      setIdentityOpen(false);
      setDrafts({});
      dirtyRef.current = false;
      announce('La rutina cambió en otro lugar. Actualizamos los datos.');
      await refreshAfterConflict();
    } else if (result.status === 'not_found') {
      identityOpenRef.current = false;
      setIdentityOpen(false);
      dirtyRef.current = false;
      setDrafts({});
      setNotFound(true);
      setDetail(null);
    } else {
      announce(errorMessage(result));
    }
  }, [announce, client, detail, id, refreshAfterConflict]);

  const setStatus = useCallback(async (isActive: boolean) => {
    if (!client || !detail || pendingRef.current || !guardStructure()) return;
    mutationEpoch.current += 1;
    pendingRef.current = true;
    setPending('status');
    const result = await setMobileTrainingRoutineStatus(client, id, isActive);
    pendingRef.current = false;
    setPending(null);
    if (result.status === 'ok') {
      setDetail((previous) => previous ? {
        ...previous,
        routine: { ...previous.routine, isActive: result.data.routine.isActive, updatedAt: result.data.routine.updatedAt },
      } : previous);
      announce(isActive ? 'Rutina restaurada.' : 'Rutina archivada.');
    } else if (result.status === 'not_found') {
      dirtyRef.current = false;
      setDrafts({});
      setNotFound(true);
      setDetail(null);
    } else announce(errorMessage(result));
  }, [announce, client, detail, guardStructure, id]);

  const confirmStatus = useCallback(() => {
    if (!detail || !guardStructure()) return;
    const restoring = !detail.routine.isActive;
    Alert.alert(restoring ? 'Restaurar rutina' : 'Archivar rutina',
      restoring ? 'Volverá a aparecer entre tus rutinas activas.' : 'Se quitará de las rutinas activas sin modificar su historial.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: restoring ? 'Restaurar' : 'Archivar', style: restoring ? 'default' : 'destructive', onPress: () => void setStatus(restoring) },
      ]);
  }, [detail, guardStructure, setStatus]);

  const addExercise = useCallback((exercise: MobileTrainingExercise) => {
    if (!detail || !guardStructure()) return;
    try {
      const payload = templatePayload(detail);
      payload.items.push({ routineExerciseId: null, exerciseId: exercise.id, targets: targetsFromCatalog(exercise) });
      void runTemplate(payload, 'Ejercicio agregado.', exercise.id);
    } catch (error) {
      announce(error instanceof Error ? error.message : 'No pudimos agregar el ejercicio.');
    }
  }, [announce, detail, guardStructure, runTemplate]);

  const removeExercise = useCallback((itemId: string, name: string) => {
    if (!detail || !guardStructure()) return;
    Alert.alert(`¿Quitar ${name}?`, 'Se quitará de esta rutina. El ejercicio seguirá en tu biblioteca y las sesiones anteriores no cambian.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => {
        const payload = templatePayload(detail);
        payload.items = payload.items.filter((item) => item.routineExerciseId !== itemId);
        void runTemplate(payload, 'Ejercicio quitado.');
      } },
    ]);
  }, [detail, guardStructure, runTemplate]);

  const moveExercise = useCallback((index: number, direction: -1 | 1) => {
    if (!detail || !guardStructure()) return;
    void runTemplate(reorderTemplate(templatePayload(detail), index, direction), 'Orden actualizado.');
  }, [detail, guardStructure, runTemplate]);

  const showItemActions = useCallback((index: number) => {
    if (!detail || pendingRef.current) return;
    const item = detail.items[index];
    if (!item) return;
    Alert.alert(item.exercise.name, 'Opciones de la rutina', [
      ...(index > 0 ? [{ text: 'Mover arriba', onPress: () => moveExercise(index, -1) }] : []),
      ...(index < detail.items.length - 1 ? [{ text: 'Mover abajo', onPress: () => moveExercise(index, 1) }] : []),
      { text: 'Quitar de la rutina', style: 'destructive', onPress: () => removeExercise(item.routineExerciseId, item.exercise.name) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [detail, moveExercise, removeExercise]);

  if (!detail && !notFound && state.status === 'loading') return <EditorSkeleton />;
  if (notFound) return (
    <ScrollScreen testID="routine-editor-not-found">
      <UnavailableState action={<Button label="Volver a Rutinas" onPress={() => router.back()} />} description="Esta rutina ya no está disponible." title="No encontramos la rutina" />
    </ScrollScreen>
  );
  if (!detail) return (
    <ScrollScreen testID="routine-editor-unavailable">
      <UnavailableState action={<Button label="Reintentar" onPress={() => void refresh()} />} description="Tu rutina sigue segura. Revisá la conexión e intentá nuevamente." title="No pudimos cargar la rutina" />
    </ScrollScreen>
  );

  const count = detail.items.reduce((total, item) => total + item.targets.sets.length, 0);
  const strip = detail.routine.color ? trainingRoutineColor(detail.routine.color, isDark) : null;
  return (
    <>
      <Stack.Screen options={{ headerBackButtonMenuEnabled: false, title: 'Rutinas' }} />
      <ScrollScreen
        pointerEvents={confirmPointerEvents}
        refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => {
          if (dirtyRef.current) announce('Guardá los objetivos pendientes antes de actualizar.');
          else void refresh();
        }} tintColor={colors.primary} />}
        testID="routine-editor-screen"
      >
        <View style={styles.identityHeader}>
          {strip ? <View style={[styles.headerStrip, { backgroundColor: strip }]} /> : null}
          <View style={styles.flex}>
            <Heading>{detail.routine.name}</Heading>
            <AppText muted numeric variant="caption">{plural(detail.items.length, 'ejercicio', 'ejercicios')} · {plural(count, 'serie', 'series')}</AppText>
            {!detail.routine.isActive ? <AppText style={{ color: colors.text }} variant="caption">Archivada</AppText> : null}
          </View>
          <Pressable accessibilityLabel="Editar identidad de rutina" accessibilityRole="button" disabled={Boolean(pending)} onPress={() => { if (guardStructure()) { identityOpenRef.current = true; setIdentityOpen(true); } }} style={[styles.editButton, { borderColor: colors.border }]}>
            <AppIcon color={colors.text} name="settings" size={18} />
          </Pressable>
        </View>
        {state.status !== 'ready' ? (
          <Surface><InlineUnavailable actionLabel="Reintentar" message="Mostramos la última lectura confirmada." onAction={() => void refresh()} /></Surface>
        ) : null}
        {dirty ? <AppText muted variant="caption">Hay cambios sin guardar; las actualizaciones se posponen hasta guardarlos.</AppText> : null}
        {detail.routine.isActive ? (
          <View>
            <StartConfirm onCancel={() => setStartOpen(false)} onConfirm={() => { setStartOpen(false); starter.start({ routineId: detail.routine.id }); }} open={startOpen}
              routineName={detail.routine.name} />
            <Button disabled={Boolean(pending)} label="Iniciar entrenamiento" onPress={() => { if (guardStructure()) setStartOpen(true); }} />
          </View>
        ) : (
          <Surface style={styles.archivedNotice}>
            <AppText variant="label">Rutina archivada</AppText>
            <AppText muted variant="caption">Podés revisar y editar su estructura. Restaurala para volver a iniciarla.</AppText>
            <Button disabled={Boolean(pending) || dirty} label="Restaurar rutina" onPress={confirmStatus} variant="secondary" />
          </Surface>
        )}
        <View style={styles.sectionHeader}>
          <View style={styles.flex}>
            <Heading level={2}>Ejercicios</Heading>
            {detail.items.length > 0 ? <AppText muted variant="caption">Abrí uno para editarlo</AppText> : null}
          </View>
        </View>
        {detail.items.length === 0 ? (
          <EmptyState action={<Button label="Agregar ejercicio" onPress={() => { if (guardStructure()) setPickerOpen(true); }} />} description="Agregá el primero para empezar a armar esta rutina." title="Todavía no tiene ejercicios" />
        ) : (
          <Surface elevated style={styles.listSurface}>
            {detail.items.map((item, index) => {
              const opened = expandedId === item.routineExerciseId;
              const draft = drafts[item.routineExerciseId] ?? draftFromTargets(item.targets);
              const saved = !isTargetsDirty(draft, item.targets);
              const identity = [item.exercise.implement, item.exercise.weightMode].filter(Boolean).join(' · ');
              return (
                <View key={item.routineExerciseId}>
                  {index > 0 ? <Separator /> : null}
                  <View style={styles.itemRow}>
                    {strip ? <View style={[styles.itemStrip, { backgroundColor: strip }]} /> : null}
                    <Pressable
                      accessibilityLabel={`${item.exercise.name}, ${opened ? 'contraer' : 'expandir'}`}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: opened }}
                      onPress={() => setExpandedId(opened ? null : item.routineExerciseId)}
                      style={styles.itemMain}
                    >
                      <View style={[styles.ordinal, { backgroundColor: colors.surfaceRaised }]}><AppText variant="caption">{index + 1}</AppText></View>
                      <View style={styles.flex}>
                        <AppText variant="label">{item.exercise.name}</AppText>
                        {identity ? <AppText muted variant="caption">{identity}</AppText> : null}
                        {!item.exercise.isActive ? <AppText muted variant="caption">Ejercicio archivado</AppText> : null}
                      </View>
                      <AppIcon color={colors.textMuted} name="chevronRight" size={16} />
                    </Pressable>
                    <Pressable accessibilityLabel={`Más acciones para ${item.exercise.name}`} accessibilityRole="button" onPress={() => showItemActions(index)} style={styles.overflow}>
                      <AppText style={{ color: colors.textMuted }} variant="label">•••</AppText>
                    </Pressable>
                  </View>
                  {opened ? <TargetsEditor draft={draft} error={formError} onChange={(next) => updateDraft(item.routineExerciseId, next)} onSave={() => saveTargets(item.routineExerciseId)} pending={pending === 'template'} saved={saved} /> : null}
                </View>
              );
            })}
          </Surface>
        )}
        {detail.items.length > 0 ? <Button disabled={Boolean(pending)} label="+ Agregar ejercicio" onPress={() => { if (guardStructure()) setPickerOpen(true); }} variant="secondary" /> : null}
        <View style={styles.advancedSection}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(!advanced)} style={styles.expandHeader}>
            <AppText variant="label">Opciones de rutina</AppText>
            <AppIcon color={colors.textMuted} name="chevronRight" size={16} />
          </Pressable>
          {advanced && detail.routine.isActive ? (
            <Surface style={styles.archivedNotice}>
              <AppText muted variant="caption">Archivarla la quita de tus rutinas activas sin modificar su historial.</AppText>
              <Button disabled={Boolean(pending) || dirty} label="Archivar rutina" onPress={confirmStatus} variant="secondary" />
            </Surface>
          ) : null}
        </View>
      </ScrollScreen>
      {notice ? <View pointerEvents="none" style={[styles.toastContainer, { bottom: insets.bottom + spacing.xxxl }]}>
        <Surface accessibilityRole="alert" elevated style={styles.toast}><AppText variant="caption">{notice}</AppText></Surface>
      </View> : null}
      {identityOpen ? <IdentityModal detail={detail} onClose={() => { identityOpenRef.current = false; setIdentityOpen(false); void refresh(); }} onSubmit={(name, color) => void submitIdentity(name, color)} pending={pending === 'identity'} /> : null}
      {pickerOpen ? <ExercisePicker client={client} detail={detail} onAdd={addExercise} onClose={() => setPickerOpen(false)} pending={pending === 'template'} /> : null}
      {starter.element}
    </>
  );
}

const styles = StyleSheet.create({
  advancedSection: { gap: spacing.sm, marginTop: spacing.lg },
  adjustmentChip: { alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: sizes.touchTarget, paddingHorizontal: spacing.lg },
  adjustmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  archivedNotice: { gap: spacing.md },
  closeButton: { alignItems: 'center', height: sizes.touchTarget, justifyContent: 'center', width: sizes.touchTarget },
  closeText: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  editButton: { alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, height: sizes.touchTarget, justifyContent: 'center', width: sizes.touchTarget },
  editorBody: { gap: spacing.md, padding: spacing.lg },
  expandHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: sizes.touchTarget },
  flex: { flex: 1, gap: spacing.xs },
  groupChip: { borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', marginRight: spacing.sm, minHeight: sizes.touchTarget, paddingHorizontal: spacing.md },
  groupScroll: { flexGrow: 0 },
  headerStrip: { alignSelf: 'stretch', borderRadius: radius.pill, width: 4 },
  identityHeader: { flexDirection: 'row', gap: spacing.md, minHeight: 70 },
  input: { borderRadius: radius.md, borderWidth: 1, minHeight: sizes.touchTarget, paddingHorizontal: spacing.md },
  itemMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 70, paddingVertical: spacing.sm },
  itemRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  itemStrip: { alignSelf: 'stretch', borderRadius: radius.pill, marginVertical: spacing.sm, width: 3 },
  listSurface: { padding: spacing.sm },
  modalContent: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxxl },
  modalFooter: { borderTopWidth: 1, padding: spacing.lg },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, padding: spacing.lg },
  modalRoot: { flex: 1 },
  noColorIndicator: { alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  noColorOption: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: sizes.touchTarget, paddingHorizontal: spacing.md },
  notesInput: { borderRadius: radius.md, borderWidth: 1, minHeight: 90, padding: spacing.md, textAlignVertical: 'top' },
  ordinal: { alignItems: 'center', borderRadius: radius.pill, height: 30, justifyContent: 'center', width: 30 },
  overflow: { alignItems: 'center', height: sizes.touchTarget, justifyContent: 'center', width: sizes.touchTarget },
  pickerControls: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  pickerList: { gap: spacing.sm, padding: spacing.lg },
  pickerRow: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 60, padding: spacing.md },
  restRow: { flexDirection: 'row', gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', marginTop: spacing.lg },
  setColumnHeader: { flex: 1, minWidth: 45, textAlign: 'center' },
  setHeaderRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  setNumberSpacer: { width: 30 },
  setRemove: { alignItems: 'center', height: sizes.touchTarget, justifyContent: 'center', width: sizes.touchTarget },
  setRemoveSpacer: { width: sizes.touchTarget },
  setRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  targetInput: { borderRadius: radius.sm, borderWidth: 1, minHeight: sizes.touchTarget, minWidth: 45, paddingHorizontal: spacing.xs },
  targetInputWrap: { flex: 1, gap: spacing.xs },
  toast: { maxWidth: 360 },
  toastContainer: { alignItems: 'center', left: spacing.lg, position: 'absolute', right: spacing.lg },
});
