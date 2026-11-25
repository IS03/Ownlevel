import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { createLiveActivitySync, type LiveActivityApi } from '@/training/live-activity-sync';
import type { MealController, MealEditorState } from './meal-controller';
import type { MealDraft } from './meal-form-model';
import { MEAL_DISCARD, mealActivityState, type MealActivityProps } from './meal-activity-model';
import type { PlateController, PlateState } from './plate-controller';
import { UnfinishedMealRepository, type UnfinishedMeals } from './unfinished-meal-storage';
import { useNoticePreferences } from '@/notices/notice-preferences';

let api: LiveActivityApi<MealActivityProps> | null | undefined;
function nativeMealActivities(): LiveActivityApi<MealActivityProps> | null {
  if (api !== undefined) return api;
  if (Platform.OS !== 'ios') return (api = null);
  try {
    // Resolved only when used, so a build without the widget extension still opens Nutrición.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    api = (require('./meal-live-activity') as typeof import('./meal-live-activity')).mealActivities();
  } catch { api = null; }
  return api;
}
/** Tapping the activity opens Nutrición on the meal where it was left. */
export const syncMealActivity = createLiveActivitySync<MealActivityProps>(nativeMealActivities, {
  url: () => Linking.createURL('/nutrition', { queryParams: { add: 'resume' } }),
  stale: props => new Date(props.until),
});

type Interaction = { target?: string; timestamp?: number };
type Listen = (listener: (event: Interaction) => void) => { remove: () => void };
function nativeListen(): Listen | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-widgets') as typeof import('expo-widgets')).addUserInteractionListener as unknown as Listen;
  } catch { return null; }
}

/** «Dejar para después» for the manual meal sheet; null outside Nutrición. */
export const UnfinishedMealContext = createContext<{ park: (draft: MealDraft) => void } | null>(null);
export const useUnfinishedMealPark = () => useContext(UnfinishedMealContext);

type Plate = { controller: PlateController; state: PlateState } | null;
type Meals = { controller: MealController; state: MealEditorState } | null;

/**
 * #645 · «Continuar carga»: keeps a plate and a manual meal left without saving or discarding on this device, offers them
 * as a Live Activity («Plato sin terminar» / «Comida sin terminar») and takes them back where they were left. Nothing is
 * sent: registering stays the usual flow. Per account: another account starts empty and ends the activity.
 */
export function useUnfinishedMeals({ userId, plate, meals, today, listen = nativeListen(), sync = syncMealActivity, storage = AsyncStorage }: {
  userId: string; plate: Plate; meals: Meals; today: string;
  listen?: Listen | null; sync?: typeof syncMealActivity; storage?: ConstructorParameters<typeof UnfinishedMealRepository>[0];
}) {
  const repository = useMemo(() => new UnfinishedMealRepository(storage, userId), [storage, userId]);
  // Read per account: what another account's repository answered is never shown here.
  const [loaded, setLoaded] = useState<{ repository: UnfinishedMealRepository; value: UnfinishedMeals } | null>(null);
  const stored = loaded?.repository === repository ? loaded.value : null;
  const setStored = useCallback((value: UnfinishedMeals) => setLoaded({ repository, value }), [repository]);
  const [now, setNow] = useState(() => Date.now());
  // The manual draft taken back from storage: saving or discarding it ends it; leaving it again keeps it.
  const resuming = useRef(false);
  const written = useRef<PlateState['draft'] | undefined>(undefined);
  const plateController = plate?.controller, mealController = meals?.controller;

  useEffect(() => {
    let live = true;
    written.current = undefined;
    void repository.read().then(value => { if (live) setStored(value); });
    return () => { live = false; };
  }, [repository, setStored]);
  // Back to the plate kept from before the app was closed, once it can take it.
  useEffect(() => {
    if (!stored?.plate || !plateController || plate?.state.phase !== 'idle' || plate.state.draft) return;
    if (plateController.restore(stored.plate.draft)) written.current = stored.plate.draft;
  }, [plate?.state.draft, plate?.state.phase, plateController, stored?.plate]);
  // The plate as it is, every time it changes (a registration or «Vaciar» empties it, and then nothing is kept).
  const draft = plate?.state.draft, plateReady = !!stored && plate?.state.phase === 'idle' && !plate.state.intent;
  useEffect(() => {
    if (!plateReady || draft === undefined || draft === written.current) return;
    if (written.current === undefined && !draft && stored?.plate) return; // not restored yet: never erase what is kept
    written.current = draft;
    void repository.writePlate(draft).then(setStored).catch(() => undefined);
  }, [draft, plateReady, repository, setStored, stored?.plate]);
  // A resumed manual meal: registered or discarded, it is no longer unfinished.
  useEffect(() => mealController?.subscribeConfirmed(confirmed => {
    if (!resuming.current || confirmed.intent.operation !== 'create') return;
    resuming.current = false;
    void repository.writeManual(null).then(setStored).catch(() => undefined);
  }), [mealController, repository, setStored]);
  const editor = meals?.state.editor ?? null;
  useEffect(() => {
    if (editor || !resuming.current || meals?.state.intent) return;
    resuming.current = false;
    void repository.writeManual(null).then(setStored).catch(() => undefined);
  }, [editor, meals?.state.intent, repository, setStored]);

  const park = useCallback((value: MealDraft) => {
    resuming.current = false;
    void repository.writeManual(value).then(setStored).catch(() => undefined);
  }, [repository, setStored]);
  /** «Continuar»: the latest one left, where it was left. */
  const resume = useCallback(() => {
    const plateLeft = stored?.plate, manualLeft = stored?.manual;
    if (manualLeft && (!plateLeft || manualLeft.savedAt > plateLeft.savedAt)) {
      if (mealController?.resume(manualLeft.draft)) resuming.current = true;
    } else if (plateLeft) plateController?.open(plateLeft.draft.date);
  }, [mealController, plateController, stored]);

  const { preferences } = useNoticePreferences(userId);
  // Turned off in «Avisos y actividades en vivo»: the meals are still kept, only the activity goes.
  const state = stored && preferences.mealActivity
    ? mealActivityState(stored, { plate: !!plate?.state.open, manual: !!editor && !editor.mealId }, today, now, preferences.lockDetail) : null;
  const shown = state?.props.kind, stateKey = JSON.stringify(state);
  useEffect(() => { void sync(JSON.parse(stateKey) as typeof state); }, [stateKey, sync]);
  useEffect(() => () => { void sync(null); }, [sync, userId]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') setNow(Date.now()); });
    return () => subscription.remove();
  }, []);
  // «Descartar» from the activity: drops only this device's draft of the meal it showed; nothing is written anywhere.
  useEffect(() => {
    if (!listen) return;
    let subscription: { remove: () => void } | null = null;
    const seen = new Set<string>();
    try {
      subscription = listen(event => {
        if (event.target !== MEAL_DISCARD) return;
        const key = String(event.timestamp ?? '');
        if (seen.has(key)) return;
        seen.add(key);
        if (shown === 'plate') {
          plateController?.clear();
          void repository.writePlate(null).then(setStored).catch(() => undefined);
        } else if (shown === 'manual') void repository.writeManual(null).then(setStored).catch(() => undefined);
      });
    } catch { subscription = null; }
    return () => subscription?.remove();
  }, [listen, plateController, repository, setStored, shown]);

  return { park, resume, stored };
}
