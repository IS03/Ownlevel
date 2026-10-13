import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { fetchMobileTrainingRoutines, fetchRoutineDetail, replaceRoutineTemplate, useApiResource } from '@/api';
import type { MobileApiClient } from '@/api/client';
import type { MobileTrainingExercise } from '@/api/exercises';
import { AppText, InlineUnavailable, ListGroup, ListRow, SkeletonBlock, spacing } from '@/design-system';
import { RoutineEditorSheet } from './routine-editor-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
import { appendExercises } from './routine-editor-model';
import { exerciseUnavailable, exerciseWriteError } from './use-exercise-library';
export function ExerciseAddRoutineSheet({ client, exercise, onClose, onChanged, onAdded }: {
  client: MobileApiClient | null; exercise: MobileTrainingExercise; onClose: () => void; onChanged: () => Promise<void>; onAdded?: () => void;
}) {
  const load = useCallback((signal: AbortSignal) => client ? fetchMobileTrainingRoutines(client, signal) : Promise.resolve(exerciseUnavailable), [client]);
  const { state, refresh } = useApiResource(load);
  const [error, setError] = useState<string | null>(null), [pending, setPending] = useState(false), busy = useRef(false);
  const current = state.status === 'ready' ? state.current : state.status === 'loading' ? undefined : state.previous;
  const routines = current?.data.routines;
  const add = async (id: string) => {
    if (!client || busy.current || !exercise.isActive || state.status !== 'ready') return;
    busy.current = true; setPending(true); setError(null);
    try {
      const detail = await fetchRoutineDetail(client, id);
      if (detail.status !== 'ok' || detail.data.kind !== 'detail' || !detail.data.detail.routine.isActive) { setError('No pudimos verificar la rutina. Actualizá la lista antes de agregarlo.'); return; }
      if (detail.data.detail.items.some(item => item.exercise.id === exercise.id)) { setError('El ejercicio ya está en esta rutina.'); await onChanged(); return; }
      const result = await replaceRoutineTemplate(client, id, appendExercises(detail.data.detail, [exercise]));
      if (result.status === 'ok') { onAdded?.(); await onChanged().catch(() => undefined); onClose(); }
      else if (result.status === 'conflict') { await Promise.all([refresh(), onChanged()]); setError('La rutina cambió. Actualizamos sus datos. Volvé a elegirla para agregar el ejercicio.'); }
      else setError(exerciseWriteError(result));
    } catch { setError('No pudimos confirmar el agregado. Actualizá la ficha antes de volver a intentarlo.'); await onChanged().catch(() => undefined); }
    finally { busy.current = false; setPending(false); }
  };
  return <RoutineEditorSheet open dirty={false} pending={pending} onClose={() => { if (!busy.current) onClose(); }} onDismissed={() => undefined}><View style={{ flex: 1 }}>
    <View style={styles.header}><RoutineSheetButton label="Cerrar rutinas" icon="close" disabled={pending} onPress={onClose} /><AppText variant="headline">Agregar a una rutina</AppText></View>
    <ScrollView contentContainerStyle={styles.content}>
      {!current && state.status === 'loading' ? <SkeletonBlock height={200} /> : routines?.status !== 'ok' ? <InlineUnavailable message="No pudimos cargar las rutinas." actionLabel="Reintentar" onAction={() => void refresh()} /> : <>
        {state.status !== 'ready' ? <InlineUnavailable message="Mostramos la última lectura confirmada. Actualizá antes de agregar." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
        <ListGroup>{routines.data.filter(routine => routine.isActive).map(routine => <ListRow key={routine.id} title={routine.name} value={exercise.routineIds.includes(routine.id) ? 'Ya está' : undefined}
          disabled={pending || state.status !== 'ready' || !exercise.isActive || exercise.routineIds.includes(routine.id)} onPress={() => void add(routine.id)} />)}</ListGroup>
        {!routines.data.some(routine => routine.isActive) ? <AppText muted>No tenés rutinas activas.</AppText> : null}
      </>}
      {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
    </ScrollView>
  </View></RoutineEditorSheet>;
}
const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg }, content: { gap: spacing.md, padding: spacing.lg } });
