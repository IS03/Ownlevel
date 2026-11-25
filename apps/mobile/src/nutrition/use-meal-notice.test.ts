import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NutritionDayMeal } from '@/api/nutrition-day';
import type { MealController } from './meal-controller';
import type { QuickController } from './quick-controller';
import type { StoredMealIntent } from './meal-storage';
import { MEAL_NOTICE_MS, useMealNotice } from './use-meal-notice';

/** Points inside the window, as fractions of it (the timeline does not depend on its exact length). */
const at = (fraction: number) => Math.round(MEAL_NOTICE_MS * fraction);

const DAY = '2026-10-02', OTHER = '2026-10-03';
type Gate = { release: (outcome?: 'deleted' | 'stays') => void };
/** Minimal stand-in for the controllers: the hook only subscribes, reads the snapshot and calls undo / removeAdded. */
class FakeMeals {
  listeners = new Set<(stored: StoredMealIntent) => void>();
  state: { phase: string; intent: unknown; editor: unknown } = { phase: 'idle', intent: null, editor: null };
  undo = jest.fn(async (meal: NutritionDayMeal, date: string) => { void date; await this.run(meal); });
  gates: Gate[] = []; hold = false; outcome: 'deleted' | 'stays' = 'deleted';
  getSnapshot = () => this.state;
  subscribeConfirmed = (f: (stored: StoredMealIntent) => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
  private async run(meal: NutritionDayMeal) {
    this.state = { phase: 'pending', intent: {}, editor: null };
    let outcome = this.outcome;
    if (this.hold) await new Promise<void>(resolve => { this.gates.push({ release: o => { if (o) outcome = o; resolve(); } }); });
    if (outcome === 'deleted') { this.state = { phase: 'idle', intent: null, editor: null }; this.emit('delete', meal.id); }
    else this.state = { phase: 'uncertain', intent: {}, editor: { headless: true } };
  }
  emit(operation: 'create' | 'edit' | 'delete', mealId: string | null, patch: { updatedAt?: string; date?: string; title?: string } = {}) {
    const date = patch.date ?? DAY, updatedAt = patch.updatedAt ?? `${date}T12:00:00Z`;
    const fields = operation === 'delete' ? null : { title: patch.title ?? `Comida ${mealId}`, description: null, calories: 100, proteinG: null, carbsG: null, fatG: null, date, mealLabel: null };
    this.listeners.forEach(f => f({ version: 1, intent: { operation, sourceDate: date, mealId, expectedUpdatedAt: null, idempotencyKey: 'k', fields, forceDuplicate: false },
      draft: {}, receipt: { status: operation === 'delete' ? 'deleted' : 'saved', mealId: mealId ?? 'new', sourceDate: date, destinationDate: date, updatedAt } } as unknown as StoredMealIntent));
  }
  /** A create confirmed by the server for `id`. */
  create(id: string, patch: { updatedAt?: string; date?: string; title?: string } = {}) { this.emit('create', id, patch); }
}
class FakeQuick {
  listeners = new Set<(meal: NutritionDayMeal, date: string) => void>(); removeAdded = jest.fn();
  subscribeConfirmed = (f: (meal: NutritionDayMeal, date: string) => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
  confirm(id: string, date = DAY, updatedAt = `${date}T12:30:00Z`) { this.listeners.forEach(f => f({ id, title: `Rápida ${id}`, description: null, calories: 300, updatedAt } as NutritionDayMeal, date)); }
}
const setup = (date = DAY) => {
  const meals = new FakeMeals(), quick = new FakeQuick();
  const view = renderHook((props: { meals?: FakeMeals; date: string }) => useMealNotice(props.meals as unknown as MealController, quick as unknown as QuickController, props.date), { initialProps: { meals, date } });
  const sent = () => meals.undo.mock.calls.map(([meal, to]) => ({ id: meal.id, updatedAt: meal.updatedAt, to }));
  return { meals, quick, view, sent, now: () => view.result.current };
};
const confirmWithTime = (run: () => void) => act(run);
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-02T15:00:00Z')); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

/** «Deshacer» on the notice on screen now. */
const tapUndo = (now: () => ReturnType<typeof useMealNotice>) => now().undoNotice(now().notice!.id);

describe('one meal notice (#635)', () => {
  it('a newer confirmation replaces the previous for good: closing or waiting never brings it back', () => {
    const { meals, quick, now } = setup();
    confirmWithTime(() => meals.create('A', { updatedAt: 'vA' })); confirmWithTime(() => quick.confirm('Q', DAY, 'vQ'));
    expect(now().notice?.meal).toMatchObject({ id: 'Q', updatedAt: 'vQ' });
    act(() => now().dismiss(now().notice!.id)); expect(now().notice).toBeNull();
    act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS * 2); }); expect(now().notice).toBeNull();
    expect(meals.undo).not.toHaveBeenCalled();
  });
  it('Deshacer sends the snapshot of the notice on screen and nothing else', async () => {
    const { meals, now, sent } = setup();
    confirmWithTime(() => meals.create('A', { updatedAt: 'vA' })); confirmWithTime(() => meals.create('B', { updatedAt: 'vB' }));
    await act(async () => { await tapUndo(now); });
    expect(sent()).toEqual([{ id: 'B', updatedAt: 'vB', to: DAY }]);
    expect(now().notice).toBeNull(); expect(now().result).toMatchObject({ message: 'Deshecho' });
  });
  it('a notice of another day is not offered here, is offered when that day is shown, and expires from its confirmation', () => {
    const { meals, now, view } = setup();
    confirmWithTime(() => meals.create('T', { date: OTHER }));
    expect(now().notice).toBeNull();
    act(() => { jest.advanceTimersByTime(4000); });
    view.rerender({ meals, date: OTHER }); expect(now().notice?.meal.id).toBe('T');
    act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS - 4000 - 1); }); expect(now().notice?.meal.id).toBe('T');
    act(() => { jest.advanceTimersByTime(1); }); expect(now().notice).toBeNull();
  });
  it('a newer one on another day retires the one of this day', () => {
    const { meals, now, view } = setup();
    confirmWithTime(() => meals.create('A')); confirmWithTime(() => meals.create('X', { date: OTHER }));
    expect(now().notice).toBeNull(); view.rerender({ meals, date: OTHER }); expect(now().notice?.meal.id).toBe('X');
    view.rerender({ meals, date: DAY }); expect(now().notice).toBeNull();
  });

  describe('windows', () => {
    it('is exactly its window from its own confirmation: 1 ms before valid, at the window gone', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A'));
      act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS - 1); }); expect(now().notice?.meal.id).toBe('A');
      act(() => { jest.advanceTimersByTime(1); }); expect(now().notice).toBeNull();
    });
    it('a replacement gets a window of its own', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A'));
      act(() => { jest.advanceTimersByTime(at(0.6)); }); confirmWithTime(() => meals.create('B'));
      act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS - 1); }); expect(now().notice?.meal.id).toBe('B');
      act(() => { jest.advanceTimersByTime(1); }); expect(now().notice).toBeNull();
    });
    it('an undo in flight pauses its window; if it returns without removing the meal, a full window starts again', async () => {
      const { meals, now } = setup(); meals.hold = true; meals.outcome = 'stays';
      confirmWithTime(() => meals.create('A')); act(() => { jest.advanceTimersByTime(at(0.6)); });
      let pending!: Promise<void>; act(() => { pending = tapUndo(now); });
      expect(now().undoing).toBe('undo');
      act(() => { jest.advanceTimersByTime(60000); }); expect(now().notice?.meal.id).toBe('A');
      await act(async () => { meals.gates[0].release(); await pending; });
      expect(now().undoing).toBeNull(); expect(now().notice?.meal.id).toBe('A');
      act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS - 1); }); expect(now().notice?.meal.id).toBe('A');
      act(() => { jest.advanceTimersByTime(1); }); expect(now().notice).toBeNull();
    });
  });

  describe('eligibility', () => {
    it('dismiss hides it and never calls undo', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A'));
      act(() => now().dismiss(now().notice!.id)); expect(now().notice).toBeNull(); expect(meals.undo).not.toHaveBeenCalled();
    });
    it('a later edit of that meal retires it; an edit or a delete of another meal does not', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A'));
      confirmWithTime(() => meals.emit('edit', 'Z')); confirmWithTime(() => meals.emit('delete', 'Y'));
      expect(now().notice?.meal.id).toBe('A');
      confirmWithTime(() => meals.emit('edit', 'A', { updatedAt: 'v2' }));
      expect(now().notice).toBeNull(); expect(now().result).toMatchObject({ message: 'Cambios guardados' });
    });
    it('the same confirmation twice is neither a new notice nor a longer window', () => {
      const { meals, quick, now } = setup();
      confirmWithTime(() => meals.create('A', { updatedAt: 'vA' })); const id = now().notice!.id; act(() => { jest.advanceTimersByTime(at(0.6)); });
      confirmWithTime(() => meals.create('A', { updatedAt: 'vA' })); confirmWithTime(() => quick.confirm('A', DAY, 'vA'));
      expect(now().notice?.id).toBe(id);
      act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS - at(0.6)); }); expect(now().notice).toBeNull();
    });
    it('a newer version of the meal replaces the notice with its new CAS', async () => {
      const { meals, now, sent } = setup();
      confirmWithTime(() => meals.create('A', { updatedAt: 'v1' })); act(() => { jest.advanceTimersByTime(3000); });
      confirmWithTime(() => meals.create('A', { updatedAt: 'v2' }));
      await act(async () => { await tapUndo(now); }); expect(sent()).toEqual([{ id: 'A', updatedAt: 'v2', to: DAY }]);
    });
    it('an explicit delete of another meal says "Comida eliminada" and keeps the notice', async () => {
      const { meals, now, sent } = setup(); confirmWithTime(() => meals.create('B'));
      await act(async () => { await now().undo({ id: 'A', updatedAt: 'vA' } as NutritionDayMeal, DAY); });
      expect(sent()).toEqual([{ id: 'A', updatedAt: 'vA', to: DAY }]); expect(now().notice?.meal.id).toBe('B');
      expect(now().result).toMatchObject({ message: 'Comida eliminada' });
    });
    it('an explicit delete of the visible meal is "Deshecho", with the quick row released', async () => {
      const { meals, quick, now } = setup(); confirmWithTime(() => quick.confirm('Q'));
      await act(async () => { await now().undo({ id: 'Q', updatedAt: 'x' } as NutritionDayMeal, DAY, 'saved:q'); });
      expect(quick.removeAdded).toHaveBeenCalledWith('saved:q'); expect(now().result).toMatchObject({ message: 'Deshecho' }); expect(meals.undo).toHaveBeenCalledTimes(1);
    });
    it('the controller busy or not idle: nothing is sent and the notice keeps running', async () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A'));
      meals.state = { phase: 'pending', intent: {}, editor: null };
      await act(async () => { await tapUndo(now); }); expect(meals.undo).not.toHaveBeenCalled(); expect(now().undoing).toBeNull(); expect(now().notice?.meal.id).toBe('A');
      meals.state = { phase: 'idle', intent: null, editor: null };
      await act(async () => { await tapUndo(now); }); expect(meals.undo).toHaveBeenCalledTimes(1);
    });
    it('an uncertain undo leaves the controller\'s recovery in charge: the notice stays and nothing is retried', async () => {
      const { meals, now } = setup(); meals.outcome = 'stays';
      confirmWithTime(() => meals.create('A'));
      await act(async () => { await tapUndo(now); });
      expect(meals.undo).toHaveBeenCalledTimes(1); expect(now().undoing).toBeNull(); expect(now().result).toBeNull(); expect(now().notice?.meal.id).toBe('A');
      await act(async () => { await tapUndo(now); }); expect(meals.undo).toHaveBeenCalledTimes(1);
      meals.state = { phase: 'idle', intent: null, editor: null }; confirmWithTime(() => meals.emit('delete', 'A'));
      expect(now().notice).toBeNull();
    });
    it('the owner switching clears it; the new owner starts empty', () => {
      const { meals, quick, now, view } = setup(); confirmWithTime(() => meals.create('A'));
      const next = new FakeMeals(); view.rerender({ meals: next, date: DAY });
      expect(now().notice).toBeNull(); expect(jest.getTimerCount()).toBe(0);
      expect(meals.listeners.size).toBe(0); expect(quick.listeners.size).toBe(1);
      confirmWithTime(() => next.create('C')); expect(now().notice?.meal.id).toBe('C');
    });
  });

  describe('late taps', () => {
    it('a tap begun on a notice since replaced undoes nothing, neither the old meal nor the new one', async () => {
      const { meals, now, sent } = setup(); confirmWithTime(() => meals.create('A', { updatedAt: 'vA' }));
      const shown = now().notice!.id;
      confirmWithTime(() => meals.create('B', { updatedAt: 'vB' }));
      await act(async () => { await now().undoNotice(shown); });
      expect(sent()).toEqual([]); expect(now().notice?.meal.id).toBe('B');
      act(() => now().dismiss(shown)); expect(now().notice?.meal.id).toBe('B');
    });
    it('a newer arrival in the same event turn is not undone by a tap meant for the one on screen', async () => {
      const { meals, now, sent } = setup(); confirmWithTime(() => meals.create('A'));
      const shown = now().notice!.id;
      await act(async () => { meals.create('B'); await now().undoNotice(shown); });
      expect(sent()).toEqual([]);
    });
    it('Deshacer on a notice whose window ran out before the screen caught up does nothing', async () => {
      const { meals, now, sent } = setup(); confirmWithTime(() => meals.create('A'));
      const shown = now().notice!.id;
      jest.setSystemTime(Date.now() + MEAL_NOTICE_MS + 1);
      await act(async () => { await now().undoNotice(shown); }); expect(sent()).toEqual([]); expect(now().notice).toBeNull();
    });
    it('a tap for a notice of another day than the one shown does nothing', async () => {
      const { meals, now, view, sent } = setup(); confirmWithTime(() => meals.create('T', { date: OTHER }));
      view.rerender({ meals, date: OTHER }); const shown = now().notice!.id; view.rerender({ meals, date: DAY });
      await act(async () => { await now().undoNotice(shown); }); expect(sent()).toEqual([]);
    });
  });

  describe('bounded', () => {
    it('many rapid confirmations leave one notice, then nothing and no timer', () => {
      const { meals, quick, now } = setup();
      for (let i = 0; i < 100; i++) { confirmWithTime(() => (i % 2 ? quick.confirm(`Q${i}`) : meals.create(`M${i}`))); act(() => { jest.advanceTimersByTime(250); }); }
      expect(now().notice?.meal.id).toBe('Q99');
      act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS); }); expect(now().notice).toBeNull();
      act(() => { jest.advanceTimersByTime(2000); }); expect(jest.getTimerCount()).toBe(0);
    });
    it('unmounting leaves no timer and no listener behind', () => {
      const { meals, quick, view } = setup(); confirmWithTime(() => meals.create('A')); confirmWithTime(() => quick.confirm('Q'));
      expect(jest.getTimerCount()).toBeGreaterThan(0); view.unmount();
      expect(jest.getTimerCount()).toBe(0); expect(meals.listeners.size).toBe(0); expect(quick.listeners.size).toBe(0);
    });
  });
});
