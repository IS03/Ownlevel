import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createMobileTrainingExercise, fetchMobileTrainingExercises, useApiResource } from '@/api';
import type { MobileApiClient } from '@/api/client';
import type { MobileTrainingExercise, MobileTrainingMuscleGroup } from '@/api/exercises';
import type { RoutineDetail } from '@/api/routine-editor';
import { AppText, Button, InlineUnavailable, SkeletonBlock, spacing } from '@/design-system';
import { pickerExercises } from './routine-editor-model';
import { ExerciseEditorModal } from './exercise-editor-modal';
import { RoutineEditorSheet } from './routine-editor-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
import { RoutineExercisePickerBody } from './routine-exercise-picker-body';

export function RoutineExercisePicker({ client, detail, onAdd, onClose, pending, createIdempotencyKey, error }: {
  client: MobileApiClient | null; detail: RoutineDetail; onAdd: (exercises: MobileTrainingExercise[]) => void; onClose: () => void;
  pending: boolean; createIdempotencyKey: () => string; error?: string;
}) {
  const [query, setQuery] = useState(''), [group, setGroup] = useState<MobileTrainingMuscleGroup | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [created, setCreated] = useState<MobileTrainingExercise[]>([]);
  const creationBusy = useRef(false);
  const [creating, setCreating] = useState(false), [createPending, setCreatePending] = useState(false);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const load = useCallback((signal: AbortSignal) => client ? fetchMobileTrainingExercises(client, signal) : Promise.resolve({ status: 'unavailable' as const, reason: 'invalid_response' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } }), [client]);
  const { state, refresh } = useApiResource(load);
  const current = state.status === 'ready' ? state.current : state.status === 'loading' ? undefined : state.previous;
  const catalog = current?.data.catalog;
  const existing = useMemo(() => new Set(detail.items.map(item => item.exercise.id)), [detail.items]);
  const exercises = useMemo(() => {
    const byId = new Map((catalog?.status === 'ok' ? catalog.data.exercises : []).map(exercise => [exercise.id, exercise]));
    created.forEach(exercise => byId.set(exercise.id, exercise)); return [...byId.values()];
  }, [catalog, created]);
  const rows = pickerExercises(exercises, new Set(), query, group);
  const picked = selected.map(id => exercises.find(exercise => exercise.id === id)).filter((exercise): exercise is MobileTrainingExercise => Boolean(exercise?.isActive && !existing.has(exercise.id)));
  const toggle = (id: string) => { if (!pending && !existing.has(id)) setSelected(old => old.includes(id) ? old.filter(key => key !== id) : [...old, id]); };
  const close = () => { if (!pending && !creationBusy.current) onClose(); };
  return <>
    <RoutineEditorSheet open pending={pending || createPending} onClose={close}>
      <View style={styles.root} testID="routine-exercise-picker">
        <View style={styles.header}><RoutineSheetButton label="Cerrar agregar ejercicios" icon="close" disabled={pending || createPending} onPress={close} />
          <AppText accessibilityRole="header" style={styles.title} variant="headline">Agregar ejercicios</AppText><View style={{ width: 44 }} /></View>
        {!current && state.status === 'loading' ? <SkeletonBlock height={200} /> : catalog?.status !== 'ok' ? <InlineUnavailable actionLabel="Reintentar" message="No pudimos cargar la biblioteca." onAction={() => void refresh()} /> : <>
          {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
          <RoutineExercisePickerBody key={`created-${created.length}`} query={query} onQuery={setQuery} group={group} onGroup={setGroup} rows={rows} existing={existing} selected={selected}
            disabled={pending || createPending} onToggle={toggle} onCreate={() => setCreating(true)} />
        </>}
        <View style={styles.footer}>
          {error || createNotice ? <AppText accessibilityRole="alert" variant="footnote">{error ?? createNotice}</AppText> : null}
          <Button numeric label={pending ? 'Agregando…' : `Agregar ${picked.length} ${picked.length === 1 ? 'ejercicio' : 'ejercicios'}`} disabled={pending || createPending || catalog?.status !== 'ok' || picked.length === 0 || picked.length !== selected.length}
            onPress={() => onAdd(picked)} />
        </View>
      </View>
    </RoutineEditorSheet>
    {creating ? <ExerciseEditorModal initialName={query.trim()} purpose="routine" target={{ mode: 'create' }} routines={[]} pending={createPending}
      createIdempotencyKey={createIdempotencyKey} onClose={() => { if (!creationBusy.current) setCreating(false); }} onSetStatus={() => undefined}
      onSave={async (exercise, _routineIds, key) => {
        if (!client || creationBusy.current || pending) return 'Esperá a que termine la acción actual.';
        creationBusy.current = true; setCreatePending(true);
        try {
          const result = await createMobileTrainingExercise(client, { exercise, routineIds: [], idempotencyKey: key ?? '' });
          if (result.status !== 'ok') return result.status === 'validation' || result.status === 'conflict' ? result.message : 'No pudimos confirmar el alta. Reintentá con los mismos datos para verificarla.';
          setCreated(old => [...old.filter(item => item.id !== result.data.exercise.id), result.data.exercise]);
          setSelected(old => old.includes(result.data.exercise.id) ? old : [...old, result.data.exercise.id]);
          setCreating(false); setQuery(''); setGroup(null); setCreateNotice(result.data.warning ?? null); return null;
        } catch { return 'No pudimos confirmar el alta. Reintentá con los mismos datos para verificarla.'; }
        finally { creationBusy.current = false; setCreatePending(false); }
      }} /> : null}
  </>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg }, title: { flex: 1, textAlign: 'center' }, footer: { padding: spacing.lg, gap: spacing.sm } });
