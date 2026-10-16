import { useEffect, useRef, useState } from 'react';
import type { NutritionDayMeal } from '@/api/nutrition-day';
import type { MealController } from './meal-controller';
import type { QuickController } from './quick-controller';
import { mealShown } from './meal-sheet';
export type MealNotice = { date: string; meal: NutritionDayMeal; message: string };
/** A brief confirmation once a delete, an undo or an edit is confirmed by the server. */
export type MealResult = { message: string };
const RESULT_MS = 1600;
export function useMealNotice(meals: MealController | undefined, quick: QuickController | undefined, date: string) {
  const [notice, setNotice] = useState<MealNotice | null>(null);
  const [undoing, setUndoing] = useState<'undo' | 'delete' | null>(null);
  const [result, setResult] = useState<MealResult | null>(null);
  const [owner, setOwner] = useState(meals);
  if (owner !== meals) { setOwner(meals); setNotice(null); setUndoing(null); setResult(null); }
  useEffect(() => { if (!notice || undoing) return; const timer = setTimeout(() => setNotice(null), 10000); return () => clearTimeout(timer); }, [notice, undoing]);
  useEffect(() => { if (!result) return; const timer = setTimeout(() => setResult(null), RESULT_MS); return () => clearTimeout(timer); }, [result]);
  const undoKey = useRef<string | null>(null), undoKind = useRef<'undo' | 'delete'>('delete');
  useEffect(() => {
    const show = (meal: NutritionDayMeal, destination: string) => { setResult(null); setNotice({ date: destination, meal, message: `${meal.title || meal.description || 'Comida'} · ${mealShown(meal.calories)} kcal` }); };
    const unsubscribeQuick = quick?.subscribeConfirmed(show);
    const unsubscribeMeal = meals?.subscribeConfirmed(stored => {
      const receipt = stored.receipt!, fields = stored.intent.fields;
      if (stored.intent.operation === 'delete') {
        if (undoKey.current) quick?.removeAdded(undoKey.current);
        undoKey.current = null; setUndoing(null); setNotice(null);
        setResult({ message: undoKind.current === 'undo' ? 'Deshecho' : 'Comida eliminada' });
        undoKind.current = 'delete';
        return;
      }
      if (stored.intent.operation === 'edit') { setNotice(null); setResult({ message: 'Cambios guardados' }); return; }
      if (stored.intent.operation === 'create' && fields) show({ id: receipt.mealId, updatedAt: receipt.updatedAt, title: fields.title, description: fields.description, calories: fields.calories, proteinG: fields.proteinG, carbsG: fields.carbsG, fatG: fields.fatG, mealLabel: fields.mealLabel ?? null, consumedAt: fields.consumedAt ?? receipt.updatedAt, timeKnown: !!fields.consumedAt, sourceType: 'manual', entryKind: 'meal', precision: null }, receipt.destinationDate);
    });
    return () => { unsubscribeQuick?.(); unsubscribeMeal?.(); };
  }, [meals, quick]);
  /**
   * Deletes the meal without opening the editor: from the notice's "Deshacer" (no arguments), from the quick list's
   * "Agregado · Deshacer" (with its key) or from the day's delete actions. The notice shows it running, then confirmed.
   */
  const undo = async (meal = notice?.meal, destination = notice?.date, key?: string) => {
    if (!meals || !meal || !destination || meals.getSnapshot().phase !== 'idle' || meals.getSnapshot().intent) return;
    const kind = key || meal.id === notice?.meal.id ? 'undo' : 'delete';
    undoKey.current = key ?? null; undoKind.current = kind; setResult(null); setUndoing(kind);
    await meals.undo(meal, destination);
    setUndoing(null);
  };
  return { notice: notice?.date === date ? notice : null, undoing, result, undo, dismiss: () => setNotice(null) };
}
