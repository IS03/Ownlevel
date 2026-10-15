import { useEffect, useRef, useState } from 'react';
import type { NutritionDayMeal } from '@/api/nutrition-day';
import type { MealController } from './meal-controller';
import type { QuickController } from './quick-controller';
import { mealShown } from './meal-sheet';
export type MealNotice = { date: string; meal: NutritionDayMeal; message: string };
export function useMealNotice(meals: MealController | undefined, quick: QuickController | undefined, date: string) {
  const [notice, setNotice] = useState<MealNotice | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [owner, setOwner] = useState(meals);
  if (owner !== meals) { setOwner(meals); setNotice(null); setUndoing(false); }
  useEffect(() => { if (!notice || undoing) return; const timer = setTimeout(() => setNotice(null), 10000); return () => clearTimeout(timer); }, [notice, undoing]);
  const undoKey = useRef<string | null>(null);
  useEffect(() => {
    const show = (meal: NutritionDayMeal, destination: string) => { setNotice({ date: destination, meal, message: `${meal.title || meal.description || 'Comida'} · ${mealShown(meal.calories)} kcal` }); };
    const unsubscribeQuick = quick?.subscribeConfirmed(show);
    const unsubscribeMeal = meals?.subscribeConfirmed(stored => {
      const receipt = stored.receipt!, fields = stored.intent.fields;
      if (stored.intent.operation === 'delete') {
        if (undoKey.current) quick?.removeAdded(undoKey.current);
        undoKey.current = null; setUndoing(false); setNotice(null); return;
      }
      if (stored.intent.operation === 'create' && fields) show({ id: receipt.mealId, updatedAt: receipt.updatedAt, title: fields.title, description: fields.description, calories: fields.calories, proteinG: fields.proteinG, carbsG: fields.carbsG, fatG: fields.fatG, mealLabel: fields.mealLabel ?? null, consumedAt: fields.consumedAt ?? receipt.updatedAt, timeKnown: !!fields.consumedAt, sourceType: 'manual', entryKind: 'meal', precision: null }, receipt.destinationDate);
    });
    return () => { unsubscribeQuick?.(); unsubscribeMeal?.(); };
  }, [meals, quick]);
  const undo = async (meal = notice?.meal, destination = notice?.date, key?: string) => {
    if (!meals || !meal || !destination || meals.getSnapshot().phase !== 'idle' || meals.getSnapshot().intent) return;
    undoKey.current = key ?? null; setUndoing(true);
    await meals.undo(meal, destination);
    setUndoing(false);
  };
  return { notice: notice?.date === date ? notice : null, undoing, undo, dismiss: () => setNotice(null) };
}
