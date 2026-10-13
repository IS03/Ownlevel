import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { createMobileTrainingExercise, fetchMobileTrainingExercises, setMobileTrainingExerciseStatus, updateMobileTrainingExerciseIdentity, useApiResource, useMobileApi } from '@/api';
import type { MobileTrainingExercise, MobileTrainingExerciseMutation, MobileTrainingExercisesResponse } from '@/api/exercises';
import type { MobileApiMutationResult } from '@/api/results';
export const exerciseUnavailable = { status: 'unavailable' as const, reason: 'invalid_response' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } };
export function exerciseWriteError(result: MobileApiMutationResult<unknown>): string {
  return result.status === 'validation' || result.status === 'not_found' || result.status === 'conflict' ? result.message : 'No pudimos confirmar el cambio. Revisá la conexión e intentá de nuevo.';
}
export function useExerciseLibrary() {
  const { client } = useMobileApi();
  const [pending, setPending] = useState(false), busy = useRef(false), epoch = useRef(0), alive = useRef(true);
  const [lastCatalog, setLastCatalog] = useState<Extract<MobileTrainingExercisesResponse['catalog'], { status: 'ok' }>['data'] | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, MobileTrainingExercise>>({});
  const [notice, setNotice] = useState<{ message: string; undo?: { exercise: MobileTrainingExercise; active: boolean }; error?: boolean } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(timer); }, [notice]);
  const announce = (message: string, extra: Omit<NonNullable<typeof notice>, 'message'> = {}) => {
    if (alive.current) { setNotice({ message, ...extra }); void AccessibilityInfo.announceForAccessibility(message); }
  };
  const load = useCallback(async (signal: AbortSignal) => {
    if (!client) return exerciseUnavailable;
    const readEpoch = epoch.current, result = await fetchMobileTrainingExercises(client, signal);
    if (alive.current && !signal.aborted && readEpoch === epoch.current && result.status === 'ok' && result.data.catalog.status === 'ok') { setLastCatalog(result.data.catalog.data); setConfirmed({}); }
    return result;
  }, [client]);
  const { state, refresh } = useApiResource(load);
  const runRefresh = useCallback(() => { if (!busy.current) void refresh(); }, [refresh]);
  const current = state.status === 'ready' ? state.current : state.status === 'loading' ? undefined : state.previous;
  const catalog = current?.data.catalog.status === 'ok' ? current.data.catalog.data : lastCatalog;
  const stale = state.status !== 'ready' || current?.data.catalog.status !== 'ok';
  const base = catalog?.exercises ?? [];
  const exercises = [...base.map(exercise => confirmed[exercise.id] ?? exercise), ...Object.values(confirmed).filter(exercise => !base.some(item => item.id === exercise.id))];
  const start = () => { if (!client || busy.current) return false; busy.current = true; epoch.current++; setPending(true); return true; };
  const finish = () => { epoch.current++; busy.current = false; if (alive.current) setPending(false); };
  const status = async (exercise: MobileTrainingExercise, active = !exercise.isActive) => {
    if (!start() || !client) return;
    // Status replies are partial: retain the identity version until a complete catalog read.
    try { const result = await setMobileTrainingExerciseStatus(client, exercise.id, active);
      if (result.status === 'ok') { epoch.current++; if (alive.current) setConfirmed(old => ({ ...old, [exercise.id]: { ...exercise, isActive: result.data.exercise.isActive } }));
        announce(`${exercise.name} ${active ? 'restaurado' : 'archivado'}`, { undo: { exercise: { ...exercise, isActive: result.data.exercise.isActive }, active: exercise.isActive } }); await refresh().catch(() => undefined);
      } else announce(exerciseWriteError(result), { error: true });
    } catch { announce('No pudimos confirmar el estado. Actualizá la biblioteca para verificarlo.', { error: true }); }
    finally { finish(); }
  };
  const save = async (original: MobileTrainingExercise | undefined, mutation: MobileTrainingExerciseMutation, key?: string): Promise<string | null> => {
    if (!start() || !client) return 'Esperá a que termine la acción actual.';
    try {
      let result;
      if (!original) result = await createMobileTrainingExercise(client, { exercise: mutation, routineIds: [], idempotencyKey: key ?? '' });
      else result = await updateMobileTrainingExerciseIdentity(client, original.id, mutation, original.updatedAt);
      if (result.status !== 'ok') {
        if (result.status === 'conflict' || result.status === 'not_found') await refresh().catch(() => undefined);
        return exerciseWriteError(result);
      }
      epoch.current++; if (alive.current) setConfirmed(old => ({ ...old, [result.data.exercise.id]: result.data.exercise }));
      announce(result.data.warning ?? (original ? 'Cambios guardados' : 'Ejercicio creado')); await refresh().catch(() => undefined); return null;
    } catch { return 'No pudimos confirmar el cambio. Reintentá con los mismos datos para verificarlo.'; }
    finally { finish(); }
  };
  return { client, state, current, catalog, stale, exercises, runRefresh, routines: catalog?.routines ?? [], refresh, pending, busy, notice, announce, save, status };
}
