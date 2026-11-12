import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NutritionDayMeal } from '@/api/nutrition-day';
import type { MealController } from './meal-controller';
import type { QuickController } from './quick-controller';
import type { StoredMealIntent } from './meal-storage';
import { MEAL_NOTICE_MS, useMealNotice } from './use-meal-notice';

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

describe('meal notice queue (#472)', () => {
  it('keeps the first meal reachable behind the second: Anterior brings it forward and each undo sends its own snapshot', async () => {
    const { meals, now, sent } = setup();
    confirmWithTime(() => meals.create('A', { updatedAt: 'vA' })); confirmWithTime(() => meals.create('B', { updatedAt: 'vB' }));
    expect(now().notice?.meal).toMatchObject({ id: 'B', updatedAt: 'vB' }); expect(now().queuedCount).toBe(1);
    await act(async () => { await now().undo(); });
    expect(sent()).toEqual([{ id: 'B', updatedAt: 'vB', to: DAY }]);
    // B is gone, A is next with its remaining time.
    expect(now().notice?.meal.id).toBe('A'); expect(now().queuedCount).toBe(0); expect(now().result).toEqual({ message: 'Deshecho' });
    await act(async () => { await now().undo(); });
    expect(sent()).toEqual([{ id: 'B', updatedAt: 'vB', to: DAY }, { id: 'A', updatedAt: 'vA', to: DAY }]);
    expect(now().notice).toBeNull();
  });
  it('undo of the earlier one after previous() sends the FIRST snapshot and leaves the visible one queued', async () => {
    const { meals, now, sent } = setup();
    confirmWithTime(() => meals.create('A', { updatedAt: 'vA' })); confirmWithTime(() => meals.create('B', { updatedAt: 'vB' }));
    act(() => now().previous());
    expect(now().notice?.meal.id).toBe('A'); expect(now().queuedCount).toBe(1);
    await act(async () => { await now().undo(); });
    expect(sent()).toEqual([{ id: 'A', updatedAt: 'vA', to: DAY }]); expect(sent().some(row => row.id === 'B')).toBe(false);
    expect(now().notice?.meal.id).toBe('B'); expect(now().queuedCount).toBe(0); expect(now().result).toEqual({ message: 'Deshecho' });
  });
  it('three in a row: newest first, count, and previous() rotates through all of them', () => {
    const { meals, now } = setup();
    for (const id of ['A', 'B', 'C']) confirmWithTime(() => meals.create(id));
    expect([now().notice?.meal.id, now().queuedCount]).toEqual(['C', 2]);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { act(() => now().previous()); seen.push(now().notice!.meal.id); expect(now().queuedCount).toBe(2); }
    expect(seen).toEqual(['B', 'A', 'C', 'B']);
  });
  it('previous() with a single entry changes nothing', () => {
    const { meals, now } = setup(); confirmWithTime(() => meals.create('A')); const before = now().notice;
    act(() => now().previous()); expect(now().notice).toEqual(before); expect(now().queuedCount).toBe(0);
  });
  it('manual and quick confirmations share the one queue', async () => {
    const { meals, quick, now, sent } = setup();
    confirmWithTime(() => meals.create('M', { updatedAt: 'vM' })); confirmWithTime(() => quick.confirm('Q', DAY, 'vQ'));
    expect(now().notice?.meal).toMatchObject({ id: 'Q', updatedAt: 'vQ' }); expect(now().queuedCount).toBe(1);
    act(() => now().previous());
    await act(async () => { await now().undo(); });
    expect(sent()).toEqual([{ id: 'M', updatedAt: 'vM', to: DAY }]); expect(now().notice?.meal.id).toBe('Q');
  });
  it('an entry of another day is not offered here, is offered when that day is shown, and expires like the others', () => {
    const { meals, now, view } = setup();
    confirmWithTime(() => meals.create('T', { date: OTHER }));
    expect(now().notice).toBeNull(); expect(now().queuedCount).toBe(0);
    act(() => { jest.advanceTimersByTime(4000); });
    view.rerender({ meals, date: OTHER }); expect(now().notice?.meal.id).toBe('T');
    act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS - 4000 - 1); }); expect(now().notice?.meal.id).toBe('T');
    act(() => { jest.advanceTimersByTime(1); }); expect(now().notice).toBeNull();
    // and one that was never looked at is gone too
    view.rerender({ meals, date: DAY }); confirmWithTime(() => meals.create('U', { date: OTHER })); act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS); });
    view.rerender({ meals, date: OTHER }); expect(now().notice).toBeNull();
  });
  it('only counts the entries of the day shown', () => {
    const { meals, now, view } = setup();
    confirmWithTime(() => meals.create('A')); confirmWithTime(() => meals.create('X', { date: OTHER })); confirmWithTime(() => meals.create('B'));
    expect(now().queuedCount).toBe(1); view.rerender({ meals, date: OTHER }); expect(now().queuedCount).toBe(0);
    act(() => now().previous()); expect(now().notice?.meal.id).toBe('X');
  });

  describe('windows', () => {
    it('is exactly 10 s from its own confirmation: 9 999 ms valid, 10 000 ms gone', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A'));
      act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS - 1); }); expect(now().notice?.meal.id).toBe('A');
      act(() => { jest.advanceTimersByTime(1); }); expect(now().notice).toBeNull();
    });
    it('a newer arrival does not restart the visible one, and the older one is not prolonged when it comes back', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A'));
      act(() => { jest.advanceTimersByTime(6000); }); confirmWithTime(() => meals.create('B'));
      act(() => { jest.advanceTimersByTime(3999); });
      // A has 1 ms left, B has 6 001 ms.
      act(() => now().previous()); expect(now().notice?.meal.id).toBe('A');
      act(() => { jest.advanceTimersByTime(1); }); expect(now().notice?.meal.id).toBe('B'); expect(now().queuedCount).toBe(0);
      act(() => { jest.advanceTimersByTime(5999); }); expect(now().notice?.meal.id).toBe('B');
      act(() => { jest.advanceTimersByTime(1); }); expect(now().notice).toBeNull();
    });
    it('when the visible one expires, the next one shows with ITS remaining time, not a fresh window', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A'));
      act(() => { jest.advanceTimersByTime(7000); }); confirmWithTime(() => meals.create('B'));
      act(() => { jest.advanceTimersByTime(3000); }); expect(now().notice?.meal.id).toBe('B'); expect(now().queuedCount).toBe(0);
      act(() => { jest.advanceTimersByTime(6999); }); expect(now().notice?.meal.id).toBe('B');
      act(() => { jest.advanceTimersByTime(1); }); expect(now().notice).toBeNull();
    });
    it('an undo in flight pauses its window; if it returns without removing the entry, a full 10 s starts again', async () => {
      const { meals, now } = setup(); meals.hold = true; meals.outcome = 'stays';
      confirmWithTime(() => meals.create('A')); act(() => { jest.advanceTimersByTime(6000); });
      let pending!: Promise<void>; act(() => { pending = now().undo(); });
      expect(now().undoing).toBe('undo');
      act(() => { jest.advanceTimersByTime(60000); }); expect(now().notice?.meal.id).toBe('A');
      await act(async () => { meals.gates[0].release(); await pending; });
      expect(now().undoing).toBeNull(); expect(now().notice?.meal.id).toBe('A');
      act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS - 1); }); expect(now().notice?.meal.id).toBe('A');
      act(() => { jest.advanceTimersByTime(1); }); expect(now().notice).toBeNull();
    });
    it('an undo of one entry does not pause the others', async () => {
      const { meals, now } = setup(); meals.hold = true;
      confirmWithTime(() => meals.create('A')); act(() => { jest.advanceTimersByTime(5000); }); confirmWithTime(() => meals.create('B'));
      let pending!: Promise<void>; act(() => { pending = now().undo(); });
      act(() => { jest.advanceTimersByTime(5000); }); // A runs out while B's undo is in flight
      await act(async () => { meals.gates[0].release(); await pending; });
      expect(now().notice).toBeNull();
    });
  });

  describe('eligibility', () => {
    it('dismiss hides only the visible entry and never calls undo', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A')); confirmWithTime(() => meals.create('B'));
      act(() => now().dismiss());
      expect(meals.undo).not.toHaveBeenCalled(); expect(now().notice?.meal.id).toBe('A'); expect(now().queuedCount).toBe(0);
      act(() => now().dismiss()); expect(now().notice).toBeNull(); expect(meals.undo).not.toHaveBeenCalled();
    });
    it('a dismissed entry does not come back by rotating', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A')); confirmWithTime(() => meals.create('B'));
      act(() => now().dismiss()); act(() => now().previous()); expect(now().notice?.meal.id).toBe('A'); expect(now().queuedCount).toBe(0);
    });
    it('a later edit of A retires only A; a later delete of B retires only B', () => {
      const { meals, now } = setup();
      for (const id of ['A', 'B', 'C']) confirmWithTime(() => meals.create(id));
      confirmWithTime(() => meals.emit('edit', 'A', { updatedAt: 'v2' }));
      expect(now().result).toEqual({ message: 'Cambios guardados' }); expect(now().notice?.meal.id).toBe('C'); expect(now().queuedCount).toBe(1);
      confirmWithTime(() => meals.emit('delete', 'B'));
      expect(now().notice?.meal.id).toBe('C'); expect(now().queuedCount).toBe(0); expect(now().removed).toBe('B');
      expect(now().result).toEqual({ message: 'Comida eliminada' });
    });
    it('an edit or a delete of an unrelated meal removes nothing', () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A')); confirmWithTime(() => meals.create('B'));
      confirmWithTime(() => meals.emit('edit', 'Z')); confirmWithTime(() => meals.emit('delete', 'Y'));
      expect(now().notice?.meal.id).toBe('B'); expect(now().queuedCount).toBe(1);
    });
    it('the same confirmation twice is neither a second entry nor a longer window', () => {
      const { meals, quick, now } = setup();
      confirmWithTime(() => meals.create('A', { updatedAt: 'vA' })); act(() => { jest.advanceTimersByTime(6000); });
      confirmWithTime(() => meals.create('A', { updatedAt: 'vA' })); confirmWithTime(() => quick.confirm('A', DAY, 'vA'));
      expect(now().notice?.meal.id).toBe('A'); expect(now().queuedCount).toBe(0);
      act(() => { jest.advanceTimersByTime(4000); }); expect(now().notice).toBeNull();
    });
    it('a newer version of a queued meal replaces its entry (new CAS, new window) without duplicating it', async () => {
      const { meals, now, sent } = setup();
      confirmWithTime(() => meals.create('A', { updatedAt: 'v1' })); act(() => { jest.advanceTimersByTime(8000); });
      confirmWithTime(() => meals.create('A', { updatedAt: 'v2' }));
      expect(now().queuedCount).toBe(0); act(() => { jest.advanceTimersByTime(5000); }); expect(now().notice?.meal.updatedAt).toBe('v2');
      await act(async () => { await now().undo(); }); expect(sent()).toEqual([{ id: 'A', updatedAt: 'v2', to: DAY }]);
    });
    it('undo of an earlier entry through an explicit delete of that meal removes only that entry and says "Comida eliminada"', async () => {
      const { meals, now, sent } = setup(); confirmWithTime(() => meals.create('A', { updatedAt: 'vA' })); confirmWithTime(() => meals.create('B'));
      await act(async () => { await now().undo({ id: 'A', updatedAt: 'vA' } as NutritionDayMeal, DAY); });
      expect(sent()).toEqual([{ id: 'A', updatedAt: 'vA', to: DAY }]); expect(now().notice?.meal.id).toBe('B'); expect(now().queuedCount).toBe(0);
      expect(now().result).toEqual({ message: 'Comida eliminada' });
    });
    it('an explicit delete of the visible meal is "Deshecho", with the quick row released', async () => {
      const { meals, quick, now } = setup(); confirmWithTime(() => quick.confirm('Q'));
      await act(async () => { await now().undo({ id: 'Q', updatedAt: 'x' } as NutritionDayMeal, DAY, 'saved:q'); });
      expect(quick.removeAdded).toHaveBeenCalledWith('saved:q'); expect(now().result).toEqual({ message: 'Deshecho' }); expect(meals.undo).toHaveBeenCalledTimes(1);
    });
    it('the controller busy or not idle: nothing is sent and the entries keep running', async () => {
      const { meals, now } = setup(); confirmWithTime(() => meals.create('A'));
      meals.state = { phase: 'pending', intent: {}, editor: null };
      await act(async () => { await now().undo(); }); expect(meals.undo).not.toHaveBeenCalled(); expect(now().undoing).toBeNull(); expect(now().notice?.meal.id).toBe('A');
      meals.state = { phase: 'idle', intent: null, editor: null };
      await act(async () => { await now().undo(); }); expect(meals.undo).toHaveBeenCalledTimes(1);
    });
    it('an uncertain undo leaves the controller\'s recovery in charge: the entry stays, nothing is retried, the others stay queued', async () => {
      const { meals, now } = setup(); meals.outcome = 'stays';
      confirmWithTime(() => meals.create('A')); confirmWithTime(() => meals.create('B'));
      await act(async () => { await now().undo(); });
      expect(meals.undo).toHaveBeenCalledTimes(1); expect(now().undoing).toBeNull(); expect(now().result).toBeNull();
      expect(now().notice?.meal.id).toBe('B'); expect(now().queuedCount).toBe(1);
      // Recovery (controller phase != idle) blocks any new send from the queue.
      await act(async () => { await now().undo(); }); expect(meals.undo).toHaveBeenCalledTimes(1);
      // The recovery later confirms the delete of B: only B goes.
      meals.state = { phase: 'idle', intent: null, editor: null }; confirmWithTime(() => meals.emit('delete', 'B'));
      expect(now().notice?.meal.id).toBe('A'); expect(now().queuedCount).toBe(0);
    });
    it('the owner switching clears the whole queue; the new owner starts empty', () => {
      const { meals, quick, now, view } = setup(); confirmWithTime(() => meals.create('A')); confirmWithTime(() => meals.create('B'));
      const next = new FakeMeals(); view.rerender({ meals: next, date: DAY });
      expect(now().notice).toBeNull(); expect(now().queuedCount).toBe(0); expect(jest.getTimerCount()).toBe(0);
      expect(meals.listeners.size).toBe(0); expect(quick.listeners.size).toBe(1);
      confirmWithTime(() => next.create('C')); expect(now().notice?.meal.id).toBe('C'); expect(now().queuedCount).toBe(0);
    });
  });

  describe('no stale state', () => {
    it('a captured undo / dismiss called after a newer confirmation acts on the current visible entry', async () => {
      const { meals, now, sent } = setup(); confirmWithTime(() => meals.create('A', { updatedAt: 'vA' }));
      const staleUndo = now().undo, staleDismiss = now().dismiss;
      confirmWithTime(() => meals.create('B', { updatedAt: 'vB' }));
      act(() => staleDismiss()); expect(now().notice?.meal.id).toBe('A');
      confirmWithTime(() => meals.create('C', { updatedAt: 'vC' }));
      await act(async () => { await staleUndo(); });
      expect(sent()).toEqual([{ id: 'C', updatedAt: 'vC', to: DAY }]); expect(now().notice?.meal.id).toBe('A');
    });
    it('a captured undo after the day changed acts on the day now shown', async () => {
      const { meals, now, view, sent } = setup(); confirmWithTime(() => meals.create('A')); confirmWithTime(() => meals.create('T', { date: OTHER, updatedAt: 'vT' }));
      const stale = now().undo; view.rerender({ meals, date: OTHER });
      await act(async () => { await stale(); }); expect(sent()).toEqual([{ id: 'T', updatedAt: 'vT', to: OTHER }]);
    });
    it('Deshacer on an entry whose window ran out meanwhile does nothing and never falls through to an older meal', async () => {
      const { meals, now, sent } = setup(); confirmWithTime(() => meals.create('A', { updatedAt: 'vA' }));
      act(() => { jest.advanceTimersByTime(6000); }); confirmWithTime(() => meals.create('B', { updatedAt: 'vB' }));
      const tap = now().undo;
      // The clock passes A's deadline... and B's: nothing has had time to re-render yet.
      jest.setSystemTime(Date.now() + MEAL_NOTICE_MS + 1);
      await act(async () => { await tap(); }); expect(sent()).toEqual([]); expect(now().notice).toBeNull();
    });
    it('the visible one running out between render and tap does not undo the one behind it', async () => {
      const { meals, now, sent } = setup(); confirmWithTime(() => meals.create('A'));
      act(() => { jest.advanceTimersByTime(1000); }); confirmWithTime(() => meals.create('B'));
      act(() => now().previous()); expect(now().notice?.meal.id).toBe('A');
      const tap = now().undo;
      // A (on screen) runs out first; B behind it is still valid. No render has happened yet.
      jest.setSystemTime(Date.now() + MEAL_NOTICE_MS - 1000 + 500);
      await act(async () => { await tap(); });
      expect(sent()).toEqual([]);
    });
    it('a newer arrival between render and tap is not undone by a tap meant for the entry that was on screen', async () => {
      const { meals, now, sent } = setup(); confirmWithTime(() => meals.create('A'));
      const tap = now().undo;
      // Arrives and is committed, but the notice has not been re-rendered for the tap yet (same event turn).
      await act(async () => { meals.create('B'); await tap(); });
      expect(sent()).toEqual([]);
    });
  });

  describe('bounded', () => {
    it('after every window has passed the queue is empty and no timer remains', () => {
      const { meals, quick, now } = setup();
      confirmWithTime(() => meals.create('A')); confirmWithTime(() => quick.confirm('Q')); confirmWithTime(() => meals.create('T', { date: OTHER }));
      act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS); });
      expect(now().notice).toBeNull(); expect(now().queuedCount).toBe(0);
      // The brief result (1.6 s) is the only other timer; none is left once it passed.
      act(() => { jest.advanceTimersByTime(2000); }); expect(jest.getTimerCount()).toBe(0);
    });
    it('many rapid confirmations stay within what the 10 s window allows, then drain to nothing', () => {
      const { meals, now } = setup(); let max = 0;
      for (let i = 0; i < 100; i++) { confirmWithTime(() => meals.create(`M${i}`)); max = Math.max(max, now().queuedCount + 1); act(() => { jest.advanceTimersByTime(250); }); }
      // 250 ms apart: at most 40 can be inside a 10 s window.
      expect(max).toBeLessThanOrEqual(40); expect(now().queuedCount + 1).toBeLessThanOrEqual(40);
      act(() => { jest.advanceTimersByTime(MEAL_NOTICE_MS); }); expect(now().notice).toBeNull(); expect(now().queuedCount).toBe(0);
      act(() => { jest.advanceTimersByTime(2000); }); expect(jest.getTimerCount()).toBe(0);
    });
    it('unmounting leaves no timer and no listener behind', () => {
      const { meals, quick, view } = setup(); confirmWithTime(() => meals.create('A')); confirmWithTime(() => quick.confirm('Q'));
      expect(jest.getTimerCount()).toBeGreaterThan(0); view.unmount();
      expect(jest.getTimerCount()).toBe(0); expect(meals.listeners.size).toBe(0); expect(quick.listeners.size).toBe(0);
    });
  });
});
