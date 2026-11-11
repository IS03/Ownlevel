import { renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type { QuickOption, QuickOptions } from '@/api/nutrition-quick';

import { parseAddEntry, parseQuickEntry, useNutritionHomeEntry } from './home-entry';
import type { QuickController, QuickState } from './quick-controller';

const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: mockSetParams }) }));

const ID = '00000000-0000-4000-8000-000000000001';
const option = (kind: 'saved' | 'suggestion', id: string): QuickOption => ({
  source: { kind, id, version: 'a'.repeat(64) }, name: id, description: null, templateType: null, items: [],
  calories: 1, proteinG: null, carbsG: null, fatG: null, useCount: null, lastUsedDate: null,
});
const options: QuickOptions = { today: '2026-10-10', saved: { status: 'ok', items: [] }, suggested: { status: 'ok', items: [option('suggestion', ID)] }, pins: { status: 'ok', revision: 0, items: [] } };
const baseState = { phase: 'idle', open: false, date: null, options: null, optionsLoading: false, optionsError: false, draft: null, previousDraft: null,
  preview: null, previewLoading: false, intent: null, truth: null, message: null, errors: {} } as QuickState;

function setup(params: { add?: string; quick?: string }, editable = true) {
  const controller = { open: jest.fn(), choose: jest.fn() } as unknown as QuickController & { open: jest.Mock; choose: jest.Mock };
  const onAdd = jest.fn(), onShowToday = jest.fn();
  const hook = renderHook((props: { state: QuickState; quick?: string; add?: string; editable: boolean }) => useNutritionHomeEntry({
    add: props.add, editable: props.editable, onAdd, onShowToday, quick: { controller, state: props.state }, quickParam: props.quick, today: '2026-10-10',
  }), { initialProps: { add: params.add, editable, quick: params.quick, state: baseState } });
  return { controller, hook, onAdd, onShowToday };
}

describe('Nutrition entry params from Home', () => {
  it('parses only saved/suggestion uuids', () => {
    expect(parseQuickEntry(`suggestion:${ID}`)).toEqual({ kind: 'suggestion', id: ID });
    expect(parseQuickEntry(`saved:${ID.toUpperCase()}`)).toEqual({ kind: 'saved', id: ID });
    expect(parseQuickEntry('food:x')).toBeNull();
    expect(parseQuickEntry(undefined)).toBeNull();
    expect(parseQuickEntry('all')).toEqual({ kind: 'all' });
    expect([parseAddEntry('1'), parseAddEntry('manual'), parseAddEntry('food'), parseAddEntry('x')]).toEqual(['choose', 'manual', 'food', null]);
  });

  it('add=manual / add=food open that flow directly; quick=all opens the quick list without preselecting', () => {
    const manual = setup({ add: 'manual' });
    expect(manual.onAdd).toHaveBeenCalledWith('manual');
    const food = setup({ add: 'food' });
    expect(food.onAdd).toHaveBeenCalledWith('food');
    const all = setup({ quick: 'all' });
    expect(all.controller.open).toHaveBeenCalledWith('2026-10-10');
    all.hook.rerender({ editable: true, quick: 'all', state: { ...baseState, open: true, options } });
    expect(all.controller.choose).not.toHaveBeenCalled();
  });

  it('add=1 opens "Agregar" once, only when the screen can edit', () => {
    mockSetParams.mockReset();
    const { hook, onAdd } = setup({ add: '1' }, false);
    expect(onAdd).not.toHaveBeenCalled();
    hook.rerender({ add: '1', editable: true, quick: undefined, state: baseState });
    hook.rerender({ add: '1', editable: true, quick: undefined, state: { ...baseState } });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('choose');
    expect(mockSetParams).toHaveBeenCalledWith({ add: undefined });
  });

  it('quick=kind:id opens the existing quick registration and preselects that meal (the user still confirms)', () => {
    mockSetParams.mockReset();
    const { controller, hook } = setup({ quick: `suggestion:${ID}` });
    expect(controller.open).toHaveBeenCalledWith('2026-10-10');
    hook.rerender({ editable: true, quick: `suggestion:${ID}`, state: { ...baseState, open: true, optionsLoading: true } });
    expect(controller.choose).not.toHaveBeenCalled();
    hook.rerender({ editable: true, quick: `suggestion:${ID}`, state: { ...baseState, open: true, options } });
    expect(controller.choose).toHaveBeenCalledWith(options.suggested.status === 'ok' ? options.suggested.items[0] : undefined);
    // Closing the flow never reopens it.
    hook.rerender({ editable: true, quick: `suggestion:${ID}`, state: { ...baseState } });
    expect(controller.open).toHaveBeenCalledTimes(1);
  });

  it('a meal no longer offered leaves the quick list open to pick another', () => {
    const other = '00000000-0000-4000-8000-000000000009';
    const { controller, hook } = setup({ quick: `saved:${other}` });
    hook.rerender({ editable: true, quick: `saved:${other}`, state: { ...baseState, open: true, options } });
    expect(controller.choose).not.toHaveBeenCalled();
  });
});
