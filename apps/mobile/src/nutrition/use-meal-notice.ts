import { useCallback, useEffect, useRef, useState } from 'react';
import type { NutritionDayMeal } from '@/api/nutrition-day';
import type { MealController } from './meal-controller';
import type { QuickController } from './quick-controller';
import { mealShown } from './meal-sheet';
export type MealNotice = { date: string; meal: NutritionDayMeal; message: string; id?: number };
/** A brief confirmation once a delete, an undo or an edit is confirmed by the server. */
export type MealResult = { message: string };
const RESULT_MS = 1600;
/** Each confirmation keeps its own Undo window, counted from the moment it was confirmed. */
export const MEAL_NOTICE_MS = 10000;
/**
 * One still-reversible confirmation. `meal` is the snapshot of what was confirmed: its `updatedAt` is the CAS token the undo
 * sends, so an entry can only ever undo its own meal. `paused` is only true while an undo of that very meal is in flight.
 */
type Entry = MealNotice & { id: number; expiresAt: number; paused: boolean; owner: MealController | undefined };
/** Drops what has run out (wall clock). Returns the same array when nothing did, so callers can skip a pointless update. */
const prune = (rows: Entry[], now: number) => { const live = rows.filter(row => row.paused || row.expiresAt > now); return live.length === rows.length ? rows : live; };
const front = (rows: Entry[], date: string) => rows.find(row => row.date === date);
const without = (rows: Entry[], drop: (row: Entry) => boolean) => { const kept = rows.filter(row => !drop(row)); return kept.length === rows.length ? rows : kept; };

export function useMealNotice(meals: MealController | undefined, quick: QuickController | undefined, date: string) {
  // Newest first. The queue lives in a ref (handlers and timers always read the current one, never a render closure) and
  // is mirrored in state only so the screen re-renders; every change goes through `commit`.
  const [entries, setEntries] = useState<Entry[]>([]);
  const queue = useRef<Entry[]>([]);
  const sequence = useRef(0);
  const commit = useCallback((next: Entry[]) => { if (next === queue.current) return; queue.current = next; setEntries(next); }, []);
  const [undoing, setUndoing] = useState<'undo' | 'delete' | null>(null);
  const [result, setResult] = useState<MealResult | null>(null);
  // The meal being deleted (its row shakes and dims), then the one confirmed gone (its row breaks away once the day
  // re-reads without it).
  const [removing, setRemoving] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [owner, setOwner] = useState(meals);
  if (owner !== meals) { setOwner(meals); setEntries([]); setUndoing(null); setResult(null); setRemoving(null); }
  const visible = entries.find(row => row.date === date) ?? null;
  // What handlers need from the latest render: the controller, the day shown and which entry the user is looking at.
  const live = useRef({ meals, date, shown: null as number | null });
  useEffect(() => { live.current = { meals, date, shown: visible?.id ?? null }; });
  useEffect(() => () => { queue.current = []; }, [meals]);
  // One timeout for the soonest window that is running; it re-arms whenever the queue changes and is gone with the hook.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const running = queue.current.filter(row => !row.paused);
      if (!running.length) return;
      timer = setTimeout(() => { commit(prune(queue.current, Date.now())); arm(); },
        Math.max(0, Math.min(...running.map(row => row.expiresAt)) - Date.now()));
    };
    arm();
    return () => clearTimeout(timer);
  }, [entries, commit]);
  useEffect(() => { if (!result) return; const timer = setTimeout(() => setResult(null), RESULT_MS); return () => clearTimeout(timer); }, [result]);
  const undoKey = useRef<string | null>(null), undoKind = useRef<'undo' | 'delete'>('delete');
  useEffect(() => {
    const show = (meal: NutritionDayMeal, destination: string) => {
      const now = Date.now(), rows = prune(queue.current, now);
      const same = rows.find(row => row.meal.id === meal.id && row.owner === meals);
      // The same confirmation again (e.g. from a recovery) is neither a second entry nor a longer window.
      if (same && same.meal.updatedAt === meal.updatedAt) { commit(rows); return; }
      setResult(null);
      // A newer version of a queued meal carries a new CAS: it replaces the old entry, with a window of its own.
      commit([{ id: ++sequence.current, date: destination, meal, message: `${meal.title || meal.description || 'Comida'} · ${mealShown(meal.calories)} kcal`,
        expiresAt: now + MEAL_NOTICE_MS, paused: false, owner: meals }, ...without(rows, row => row === same)]);
    };
    const unsubscribeQuick = quick?.subscribeConfirmed(show);
    const unsubscribeMeal = meals?.subscribeConfirmed(stored => {
      const receipt = stored.receipt!, fields = stored.intent.fields;
      // An edit or a delete retires only the entry of that very meal: another meal's CAS is untouched.
      const retire = () => commit(without(prune(queue.current, Date.now()), row => row.meal.id === stored.intent.mealId));
      if (stored.intent.operation === 'delete') {
        if (undoKey.current) quick?.removeAdded(undoKey.current);
        undoKey.current = null; setUndoing(null); retire(); setRemoved(stored.intent.mealId);
        setResult({ message: undoKind.current === 'undo' ? 'Deshecho' : 'Comida eliminada' });
        undoKind.current = 'delete';
        return;
      }
      if (stored.intent.operation === 'edit') { retire(); setResult({ message: 'Cambios guardados' }); return; }
      if (stored.intent.operation === 'create' && fields) show({ id: receipt.mealId, updatedAt: receipt.updatedAt, title: fields.title, description: fields.description, calories: fields.calories, proteinG: fields.proteinG, carbsG: fields.carbsG, fatG: fields.fatG, mealLabel: fields.mealLabel ?? null, consumedAt: fields.consumedAt ?? receipt.updatedAt, timeKnown: !!fields.consumedAt, sourceType: 'manual', entryKind: 'meal', precision: null }, receipt.destinationDate);
    });
    return () => { unsubscribeQuick?.(); unsubscribeMeal?.(); };
  }, [meals, quick, commit]);
  /**
   * Deletes the meal without opening the editor: from the notice's "Deshacer" (no arguments: the entry on screen, with its
   * own snapshot) or from the day's delete actions (swipe, long-press menu, detail). The notice shows it running, then confirmed.
   */
  const undo = async (meal?: NutritionDayMeal, destination?: string, key?: string) => {
    const { meals: controller, date: shownDate, shown } = live.current, now = Date.now();
    const head = front(queue.current, shownDate);
    commit(prune(queue.current, now));
    if (!meal) {
      // Only the entry the user saw, still running, still first and of this owner. If it ran out meanwhile (or a newer one
      // took its place), do nothing: never fall through to a different meal.
      if (!head || head.id !== shown || (!head.paused && head.expiresAt <= now) || head.owner !== controller) return;
    }
    const target = meal ?? head?.meal, to = destination ?? head?.date;
    if (!controller || !target || !to || controller.getSnapshot().phase !== 'idle' || controller.getSnapshot().intent) return;
    const kind = key || target.id === front(queue.current, shownDate)?.meal.id ? 'undo' : 'delete';
    // Its window waits while its own undo runs; if it comes back without removing it, a full window starts again.
    const paused = queue.current.find(row => row.meal.id === target.id && row.owner === controller);
    if (paused) commit(queue.current.map(row => row === paused ? { ...row, paused: true } : row));
    undoKey.current = key ?? null; undoKind.current = kind; setResult(null); setUndoing(kind); setRemoving(target.id);
    try { await controller.undo(target, to); }
    finally {
      setUndoing(null); setRemoving(null);
      if (paused && queue.current.some(row => row.id === paused.id && row.paused)) commit(queue.current.map(row => row.id === paused.id ? { ...row, paused: false, expiresAt: Date.now() + MEAL_NOTICE_MS } : row));
    }
  };
  /** Hides the entry on screen only; it never sends anything. */
  const dismiss = () => { const rows = prune(queue.current, Date.now()), head = front(rows, live.current.date); commit(without(rows, row => row === head)); };
  /** Brings an earlier still-valid confirmation of this day to the front (the visible one goes to the back; no window changes). */
  const previous = () => {
    const rows = prune(queue.current, Date.now()), head = front(rows, live.current.date);
    commit(head && rows.some(row => row !== head && row.date === head.date) ? [...rows.filter(row => row !== head), head] : rows);
  };
  return { notice: visible ? { id: visible.id, date: visible.date, meal: visible.meal, message: visible.message } : null, queuedCount: visible ? entries.filter(row => row.date === date).length - 1 : 0,
    undoing, result, removing, removed, undo, dismiss, previous };
}
