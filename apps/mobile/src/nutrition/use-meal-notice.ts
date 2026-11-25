import { useCallback, useEffect, useRef, useState } from 'react';
import type { NutritionDayMeal } from '@/api/nutrition-day';
import { useConfirmationSlot } from '@/design-system/notice-host';
import type { MealController } from './meal-controller';
import type { QuickController } from './quick-controller';
import { mealShown } from './meal-sheet';
import { NOTICE_SCREEN_READER_MS, useScreenReader } from './use-metric-entry';
export type MealNotice = { date: string; meal: NutritionDayMeal; message: string; id?: number };
/** A brief confirmation once a delete, an undo or an edit is confirmed by the server. */
export type MealResult = { message: string; id?: number };
const RESULT_MS = 1600;
/** The confirmation keeps its Undo window, counted from the moment it was confirmed: six seconds, ten with a screen reader. */
export const MEAL_NOTICE_MS = 6000;
/**
 * #635: the one still-reversible confirmation, the latest (a newer one replaces it for good, never queues it). `meal` is the
 * snapshot of what was confirmed: its `updatedAt` is the CAS token the undo sends, so it can only ever undo its own meal.
 * `paused` is only true while an undo of that very meal is in flight.
 */
type Entry = MealNotice & { id: number; expiresAt: number; paused: boolean; owner: MealController | undefined };
const alive = (row: Entry | null, now: number) => row && (row.paused || row.expiresAt > now) ? row : null;

/** Another source of registered meals (Plato): same notice and «Deshacer» as Rápido. */
export type MealConfirmedSource = { subscribeConfirmed: (f: (meal: NutritionDayMeal, date: string) => void) => () => void };
export function useMealNotice(meals: MealController | undefined, quick: QuickController | undefined, date: string, plate?: MealConfirmedSource) {
  // Lives in a ref (handlers and timers always read the current one, never a render closure) and is mirrored in state only so
  // the screen re-renders; every change goes through `commit`.
  const [entry, setEntry] = useState<Entry | null>(null);
  const current = useRef<Entry | null>(null);
  const sequence = useRef(0);
  const screenReader = useScreenReader();
  const windowMs = useRef(MEAL_NOTICE_MS);
  useEffect(() => { windowMs.current = screenReader ? NOTICE_SCREEN_READER_MS : MEAL_NOTICE_MS; }, [screenReader]);
  const commit = useCallback((next: Entry | null) => { if (next === current.current) return; current.current = next; setEntry(next); }, []);
  const [undoing, setUndoing] = useState<'undo' | 'delete' | null>(null);
  const [result, setResultState] = useState<MealResult | null>(null);
  const setResult = useCallback((message: string | null) => setResultState(message === null ? null : { message, id: ++sequence.current }), []);
  // The meal being deleted (its row shakes and dims), then the one confirmed gone (its row breaks away once the day
  // re-reads without it).
  const [removing, setRemoving] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [owner, setOwner] = useState(meals);
  if (owner !== meals) { setOwner(meals); setEntry(null); setUndoing(null); setResultState(null); setRemoving(null); }
  const visible = entry?.date === date ? entry : null;
  // What handlers need from the latest render: the controller and the day shown.
  const live = useRef({ meals, date });
  useEffect(() => { live.current = { meals, date }; });
  useEffect(() => () => { current.current = null; }, [meals]);
  useEffect(() => {
    if (!entry || entry.paused) return;
    const timer = setTimeout(() => commit(alive(current.current, Date.now())), Math.max(0, entry.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [entry, commit]);
  useEffect(() => { if (!result) return; const timer = setTimeout(() => setResultState(null), RESULT_MS); return () => clearTimeout(timer); }, [result]);
  // One confirmation across Inicio and Nutrición: held while it lives (also on another day), retired by a newer one.
  useConfirmationSlot(entry ? `meal:${entry.id}` : result ? `meal-result:${result.id}` : null, () => { commit(null); setResultState(null); });
  const undoKey = useRef<string | null>(null), undoKind = useRef<'undo' | 'delete'>('delete');
  useEffect(() => {
    const show = (meal: NutritionDayMeal, destination: string) => {
      const now = Date.now(), row = alive(current.current, now);
      // The same confirmation again (e.g. from a recovery) is neither a new notice nor a longer window.
      if (row && row.meal.id === meal.id && row.owner === meals && row.meal.updatedAt === meal.updatedAt) { commit(row); return; }
      setResult(null);
      commit({ id: ++sequence.current, date: destination, meal, message: `${meal.title || meal.description || 'Comida'} · ${mealShown(meal.calories)} kcal`,
        expiresAt: now + windowMs.current, paused: false, owner: meals });
    };
    const unsubscribeQuick = quick?.subscribeConfirmed(show);
    const unsubscribePlate = plate?.subscribeConfirmed(show);
    const unsubscribeMeal = meals?.subscribeConfirmed(stored => {
      const receipt = stored.receipt!, fields = stored.intent.fields;
      // An edit or a delete retires the notice only when it is of that very meal: another meal's CAS is untouched.
      const retire = () => { const row = alive(current.current, Date.now()); commit(row?.meal.id === stored.intent.mealId ? null : row); };
      if (stored.intent.operation === 'delete') {
        if (undoKey.current) quick?.removeAdded(undoKey.current);
        undoKey.current = null; setUndoing(null); retire(); setRemoved(stored.intent.mealId);
        setResult(undoKind.current === 'undo' ? 'Deshecho' : 'Comida eliminada');
        undoKind.current = 'delete';
        return;
      }
      if (stored.intent.operation === 'edit') { retire(); setResult('Cambios guardados'); return; }
      if (stored.intent.operation === 'create' && fields) show({ id: receipt.mealId, updatedAt: receipt.updatedAt, title: fields.title, description: fields.description, calories: fields.calories, proteinG: fields.proteinG, carbsG: fields.carbsG, fatG: fields.fatG, mealLabel: fields.mealLabel ?? null, consumedAt: fields.consumedAt ?? receipt.updatedAt, timeKnown: !!fields.consumedAt, sourceType: 'manual', entryKind: 'meal', precision: null }, receipt.destinationDate);
    });
    return () => { unsubscribeQuick?.(); unsubscribePlate?.(); unsubscribeMeal?.(); };
  }, [meals, quick, plate, commit, setResult]);
  const run = async (controller: MealController, target: NutritionDayMeal, to: string, kind: 'undo' | 'delete', key?: string) => {
    // Its window waits while its own undo runs; if it comes back without removing it, a full window starts again.
    const paused = current.current?.meal.id === target.id && current.current.owner === controller ? current.current : null;
    if (paused) commit({ ...paused, paused: true });
    undoKey.current = key ?? null; undoKind.current = kind; setResult(null); setUndoing(kind); setRemoving(target.id);
    try { await controller.undo(target, to); }
    finally {
      setUndoing(null); setRemoving(null);
      const now = current.current;
      if (paused && now?.id === paused.id && now.paused) commit({ ...now, paused: false, expiresAt: Date.now() + windowMs.current });
    }
  };
  const ready = (controller: MealController | undefined): controller is MealController =>
    !!controller && controller.getSnapshot().phase === 'idle' && !controller.getSnapshot().intent;
  /** Deletes a meal without opening the editor, from the day's delete actions (swipe, long-press menu, detail). */
  const undo = async (meal: NutritionDayMeal, destination: string, key?: string) => {
    const { meals: controller, date: shownDate } = live.current, row = alive(current.current, Date.now());
    commit(row);
    if (!ready(controller)) return;
    const kind = key || (row?.date === shownDate && row.meal.id === meal.id) ? 'undo' : 'delete';
    await run(controller, meal, destination, kind, key);
  };
  /**
   * «Deshacer» of the notice the user saw, with its own snapshot. If that notice was replaced or ran out meanwhile, nothing
   * happens: a touch begun on it never reaches a different meal.
   */
  const undoNotice = async (id: number) => {
    const { meals: controller, date: shownDate } = live.current, row = alive(current.current, Date.now());
    commit(row);
    if (!row || row.id !== id || row.paused || row.date !== shownDate || row.owner !== controller || !ready(controller)) return;
    await run(controller, row.meal, row.date, 'undo');
  };
  /** Hides the notice for good; it never sends anything. */
  const dismiss = (id?: number) => { const row = current.current; if (row && (id === undefined || row.id === id)) commit(null); };
  return { notice: visible ? { id: visible.id, date: visible.date, meal: visible.meal, message: visible.message } : null,
    undoing, result, removing, removed, undo, undoNotice, dismiss };
}
