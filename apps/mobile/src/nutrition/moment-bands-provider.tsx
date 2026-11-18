import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import type { MobileApiClient } from '@/api/client';
import { DEFAULT_MEAL_MOMENT_BANDS, fetchMealMomentBands, putMealMomentBands, type MealMomentBands, type MealMomentBandsSnapshot,
  type MealMomentBandsWrite } from '@/api/nutrition-moment-bands';
import { adoptMealMomentBands } from './moment-bands-store';

export type MealMomentBandsState = {
  /** `unavailable`: the person's bands could not be read; the fixed ones are used meanwhile and nothing can be saved. */
  availability: 'loading' | 'ok' | 'unavailable';
  snapshot: MealMomentBandsSnapshot | null;
  saving: boolean;
  /** A save whose outcome is unknown: retrying sends the same body with the same key (never applied twice). */
  pending: MealMomentBandsWrite | null;
  message: string | null;
};
export type SaveOutcome = 'saved' | 'conflict' | 'unknown' | 'refused';
type ContextValue = { state: MealMomentBandsState; bands: MealMomentBands; reload: () => void; save: (bands: MealMomentBands) => Promise<SaveOutcome> };
const MESSAGES = {
  changed: 'Tus horarios cambiaron en otro dispositivo. Te mostramos los guardados.',
  unknown: 'No sabemos si se guardó. Probá de nuevo: no se guarda dos veces.',
  invalid: 'Revisá los horarios: cada uno tiene que empezar después del anterior.',
  session: 'Tu sesión venció. Entrá de nuevo para guardar.',
  unreadable: 'No pudimos leer tus horarios. Mientras tanto usamos los de siempre.',
};
const initial: MealMomentBandsState = { availability: 'loading', snapshot: null, saving: false, pending: null, message: null };
const Context = createContext<ContextValue | null>(null);
const newKey = () => `moment-bands:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
const same = (a: MealMomentBands, b: MealMomentBands) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The signed-in person's meal moment bands: read once per account, shared by Ajustes and by every new meal draft (through
 * moment-bands-store). A user switch or sign-out drops them back to the fixed bands before anything else is read.
 */
export function MealMomentBandsProvider({ children }: PropsWithChildren) {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  const userId = session?.user.id ?? null;
  // Kept per account: another account (or none) reads as the initial state until its own read lands.
  const [stored, setStored] = useState<{ owner: string | null; value: MealMomentBandsState }>({ owner: null, value: initial });
  const state = stored.owner === userId ? stored.value : initial;
  const setState = useCallback((next: (s: MealMomentBandsState) => MealMomentBandsState) =>
    setStored(s => ({ owner: userId, value: next(s.owner === userId ? s.value : initial) })), [userId]);
  // Answers that arrive after a user switch belong to the previous account: ignored.
  const generation = useRef(0);
  const load = useCallback(async (api: MobileApiClient, at: number) => {
    const result = await fetchMealMomentBands(api);
    if (at !== generation.current) return;
    if (result.status === 'ok' && result.data.status === 'ok') {
      const snapshot = { revision: result.data.revision, bands: result.data.bands };
      adoptMealMomentBands(snapshot.bands);
      setState(s => ({ ...s, availability: 'ok', snapshot, message: s.message === MESSAGES.unreadable ? null : s.message }));
    } else {
      adoptMealMomentBands(null);
      setState(s => ({ ...s, availability: 'unavailable', message: MESSAGES.unreadable }));
    }
  }, [setState]);
  useEffect(() => {
    const at = ++generation.current;
    adoptMealMomentBands(null);
    if (userId && client) void load(client, at);
    return () => { if (generation.current === at) generation.current = at + 1; };
  }, [client, load, userId]);
  const reload = useCallback(() => {
    if (!client || !userId) return;
    setState(s => ({ ...s, availability: s.snapshot ? s.availability : 'loading' }));
    void load(client, generation.current);
  }, [client, load, setState, userId]);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const save = useCallback(async (bands: MealMomentBands): Promise<SaveOutcome> => {
    const current = stateRef.current;
    if (!client || current.saving || current.availability !== 'ok' || !current.snapshot) return 'refused';
    // Retrying the same change keeps its key; anything else is a new operation against the revision last read.
    const write = current.pending && same(current.pending.bands, bands) && current.pending.expectedRevision === current.snapshot.revision
      ? current.pending : { bands, expectedRevision: current.snapshot.revision, idempotencyKey: newKey() };
    const at = generation.current;
    setState(s => ({ ...s, saving: true, message: null }));
    const result = await putMealMomentBands(client, write);
    if (at !== generation.current) return 'refused';
    if (result.status === 'ok' && !('error' in result.data)) {
      const snapshot = result.data;
      adoptMealMomentBands(snapshot.bands);
      setState(s => ({ ...s, saving: false, pending: null, snapshot, message: null }));
      return 'saved';
    }
    if (result.status === 'conflict' && result.code === 'MEAL_MOMENT_BANDS_CHANGED') {
      const truth = result.data && 'error' in result.data ? result.data.current : null;
      if (truth) adoptMealMomentBands(truth.bands);
      setState(s => ({ ...s, saving: false, pending: null, snapshot: truth ?? s.snapshot, message: MESSAGES.changed }));
      if (!truth) void load(client, at);
      return 'conflict';
    }
    if (result.status === 'validation') { setState(s => ({ ...s, saving: false, pending: null, message: MESSAGES.invalid })); return 'refused'; }
    if (result.status === 'unauthorized' || result.status === 'auth_required') { setState(s => ({ ...s, saving: false, pending: write, message: MESSAGES.session })); return 'unknown'; }
    // Unknown outcome (network, server, a reused key): keep the write to replay it as is.
    setState(s => ({ ...s, saving: false, pending: write, message: MESSAGES.unknown }));
    return 'unknown';
  }, [client, load, setState]);
  const value = useMemo(() => ({ state, bands: state.snapshot?.bands ?? DEFAULT_MEAL_MOMENT_BANDS, reload, save }), [reload, save, state]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Null outside the provider (tests of unrelated screens). */
export function useMealMomentBands() { return useContext(Context); }
