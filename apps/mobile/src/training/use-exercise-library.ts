import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { createMobileTrainingExercise, fetchMobileTrainingExercises, setMobileTrainingExerciseStatus, updateMobileTrainingExerciseIdentity, useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import type { MobileTrainingExercise, MobileTrainingExerciseMutation, MobileTrainingExercisesResponse } from '@/api/exercises';
import type { MobileApiMutationResult } from '@/api/results';
import { useCachedRead } from '@/api/use-cached-read';
export const exerciseUnavailable = { status: 'unavailable' as const, reason: 'invalid_response' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } };
export function exerciseWriteError(result: MobileApiMutationResult<unknown>): string {
  return result.status === 'validation' || result.status === 'not_found' || result.status === 'conflict' ? result.message : 'No pudimos confirmar el cambio. Revisá la conexión e intentá de nuevo.';
}
/**
 * The exercise library is a retained reading of the existing ConfirmedReadCache (#303 C3a), shared by the library and
 * the exercise detail: coming back within 30 s shows it without a request. Every settled training write (exercise
 * create/edit/archive, routine template and assignment changes, sessions) invalidates it through the API client. The
 * loader only reads; this visit's overlays and notices never live in the retained controller.
 */
const loadExercises = (client: MobileApiClient, signal: AbortSignal) => fetchMobileTrainingExercises(client, signal);
const STALE_VERSION = 'El ejercicio cambió desde la última lectura. Revisá los datos y guardá de nuevo.';
type Catalog = Extract<MobileTrainingExercisesResponse['catalog'], { status: 'ok' }>['data'];
export function useExerciseLibrary() {
  const { client } = useMobileApi();
  const [pending, setPending] = useState(false), busy = useRef(false), alive = useRef(true);
  const [lastCatalog, setLastCatalog] = useState<Catalog | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, MobileTrainingExercise>>({});
  const [notice, setNotice] = useState<{ message: string; undo?: { exercise: MobileTrainingExercise; active: boolean }; error?: boolean } | null>(null);
  /**
   * The confirmed reading shown when the last write of this visit settled (`null`: none yet). Only a DIFFERENT confirmed
   * reading replaces the overlays: provenance by identity, never by comparing millisecond timestamps.
   */
  const writeBaseline = useRef<object | null | undefined>(undefined);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(timer); }, [notice]);
  const announce = (message: string, extra: Omit<NonNullable<typeof notice>, 'message'> = {}) => {
    if (alive.current) { setNotice({ message, ...extra }); void AccessibilityInfo.announceForAccessibility(message); }
  };
  const { state, refresh, reload, snapshot } = useCachedRead(client, 'training', 'exercise-library', loadExercises);
  // A read that started before a write never confirms: the write's invalidation cancels it (ConfirmedReadCache).
  useEffect(() => {
    const baseline = writeBaseline.current;
    if (baseline === undefined || state.status !== 'ready' || state.refreshing || state.current === baseline || state.current.data.catalog.status !== 'ok') return;
    writeBaseline.current = undefined;
    setConfirmed({});
  }, [state]);
  // An explicit authorization denial (401/403) drops every protected fallback: the retained reading (the cache already
  // discards it), the last complete catalog and this visit's overlays. A network failure keeps them, marked stale.
  const denied = state.status === 'auth_required' || state.status === 'unauthorized' || (state.status === 'unavailable' && state.result.meta.httpStatus === 403);
  // The last complete catalog stays shown when a later reading answers without it (derived during render).
  const okCatalog = state.status === 'ready' && state.current.data.catalog.status === 'ok' ? state.current.data.catalog.data : null;
  if (denied && lastCatalog) setLastCatalog(null);
  else if (okCatalog && okCatalog !== lastCatalog) setLastCatalog(okCatalog);
  if (denied && Object.keys(confirmed).length) setConfirmed({});
  const runRefresh = useCallback(() => { if (!busy.current) void refresh(); }, [refresh]);
  const current = denied ? undefined : state.status === 'ready' ? state.current : state.status === 'loading' ? undefined : state.previous;
  const catalog = denied ? null : current?.data.catalog.status === 'ok' ? current.data.catalog.data : lastCatalog;
  const stale = state.status !== 'ready' || current?.data.catalog.status !== 'ok';
  const base = catalog?.exercises ?? [];
  const exercises = denied ? [] : [...base.map(exercise => confirmed[exercise.id] ?? exercise), ...Object.values(confirmed).filter(exercise => !base.some(item => item.id === exercise.id))];
  const start = () => { if (!client || busy.current) return false; busy.current = true; setPending(true); return true; };
  const finish = () => { busy.current = false; if (alive.current) setPending(false); };
  /** After a write settled: never joins a read that may predate it (ConfirmedReadCache.reload). */
  const reloadAfterWrite = async () => { markWriteSettled(); await reload(); };
  /** The confirmed reading at this instant (identity is the provenance; `null`: none). */
  const confirmedReading = () => { const reading = snapshot(); return reading.status === 'ready' ? reading.current : null; };
  function markWriteSettled() { writeBaseline.current = confirmedReading(); }
  /**
   * CAS: the identity version sent with an edit is ALWAYS verified by a catalog read started for this edit (or the read
   * the write's own invalidation started after it settled): never the retained reading, never an archive/restore overlay
   * (their replies are partial and do not confirm `updatedAt`). If that read fails, is denied or offline, or the exercise
   * changed since it was shown, nothing is written.
   */
  const currentVersion = async (original: MobileTrainingExercise): Promise<{ version: string } | { error: string }> => {
    const before = confirmedReading();
    await reload();
    const reading = snapshot();
    // A different confirmed reading proves a read that settled after this edit asked for it (not a millisecond clock).
    if (reading.status !== 'ready' || reading.refreshing || reading.current === before || reading.current.data.catalog.status !== 'ok') {
      return { error: 'No pudimos verificar la versión actual del ejercicio. Revisá la conexión e intentá de nuevo.' };
    }
    const fresh = reading.current.data.catalog.data.exercises.find(exercise => exercise.id === original.id);
    if (!fresh) return { error: 'El ejercicio ya no está disponible.' };
    return fresh.updatedAt === original.updatedAt ? { version: fresh.updatedAt } : { error: STALE_VERSION };
  };
  const status = async (exercise: MobileTrainingExercise, active = !exercise.isActive) => {
    if (!start() || !client) return;
    // Status replies are partial: retain the identity version until a complete catalog read.
    try { const result = await setMobileTrainingExerciseStatus(client, exercise.id, active);
      if (result.status === 'ok') { if (alive.current) setConfirmed(old => ({ ...old, [exercise.id]: { ...exercise, isActive: result.data.exercise.isActive } }));
        announce(`${exercise.name} ${active ? 'restaurado' : 'archivado'}`, { undo: { exercise: { ...exercise, isActive: result.data.exercise.isActive }, active: exercise.isActive } }); await reloadAfterWrite().catch(() => undefined);
      } else announce(exerciseWriteError(result), { error: true });
    } catch { announce('No pudimos confirmar el estado. Actualizá la biblioteca para verificarlo.', { error: true }); }
    finally { finish(); }
  };
  const save = async (original: MobileTrainingExercise | undefined, mutation: MobileTrainingExerciseMutation, key?: string): Promise<string | null> => {
    if (!start() || !client) return 'Esperá a que termine la acción actual.';
    try {
      let result;
      if (!original) result = await createMobileTrainingExercise(client, { exercise: mutation, routineIds: [], idempotencyKey: key ?? '' });
      else {
        const authority = await currentVersion(original);
        if ('error' in authority) return authority.error;
        result = await updateMobileTrainingExerciseIdentity(client, original.id, mutation, authority.version);
      }
      if (result.status !== 'ok') {
        if (result.status === 'conflict' || result.status === 'not_found') await reloadAfterWrite().catch(() => undefined);
        return exerciseWriteError(result);
      }
      if (alive.current) setConfirmed(old => ({ ...old, [result.data.exercise.id]: result.data.exercise }));
      announce(result.data.warning ?? (original ? 'Cambios guardados' : 'Ejercicio creado')); await reloadAfterWrite().catch(() => undefined); return null;
    } catch { return 'No pudimos confirmar el cambio. Reintentá con los mismos datos para verificarlo.'; }
    finally { finish(); }
  };
  /** After a write made elsewhere on this screen (an exercise added to a routine): never trust a pre-write read. */
  const changed = useCallback(() => {
    const reading = snapshot();
    writeBaseline.current = reading.status === 'ready' ? reading.current : null;
    return reload();
  }, [reload, snapshot]);
  /** `denied`: an explicit 401/403. Screens must also drop any sheet or editor built from the protected catalog. */
  return { client, state, current, catalog, stale, denied, exercises, runRefresh, routines: catalog?.routines ?? [], refresh, changed, pending, busy, notice, announce, save, status };
}
