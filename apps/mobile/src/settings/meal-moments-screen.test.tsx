import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from '@/api/client';
import { OwnlevelThemeProvider } from '@/design-system';
import { MealMomentBandsProvider } from '@/nutrition/moment-bands-provider';
import { currentMealMomentBands } from '@/nutrition/moment-bands-store';
import { suggestedMealLabel } from '@/nutrition/meal-timing-model';
import { quickDraft } from '@/nutrition/quick-model';
import { mealDraft } from '@/nutrition/meal-form-model';
import { DEFAULT_MEAL_MOMENT_BANDS, type MealMomentBands } from '@/api/nutrition-moment-bands';
import type { QuickOption } from '@/api/nutrition-quick';
import { MealMomentsScreen } from './meal-moments-screen';

const mockRead = jest.fn<MobileApiClient['read']>();
const mockRequest = jest.fn<MobileApiClient['request']>();
const mockClient = { read: mockRead, request: mockRequest };
let mockUser: string | null = 'owner';
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: mockUser ? { user: { id: mockUser } } : null }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useIsFocused: () => true, useRouter: () => ({ push: jest.fn() }), useNavigation: () => ({ dispatch: jest.fn() }) }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const mine: MealMomentBands = { breakfastFrom: 420, lunchFrom: 720, snackFrom: 960, dinnerFrom: 1200, dinnerUntil: 1410 };
const read = (revision: number, bands: MealMomentBands | null) => ({ status: 'ok' as const, data: { status: 'ok' as const, revision, bands }, meta });
const unknown = { status: 'unavailable' as const, reason: 'network' as const, meta: { ...meta, httpStatus: null, outcome: 'unavailable' as const } };
const element = () => <OwnlevelThemeProvider initialMode="light"><MealMomentBandsProvider><MealMomentsScreen /></MealMomentBandsProvider></OwnlevelThemeProvider>;
const value = (view: ReturnType<typeof render>, key: keyof MealMomentBands) => view.getByTestId(`moment-band-${key}-value`).props.children as string;
// 11:30 in Córdoba (UTC−3) on 17/11.
const at1130 = new Date('2026-11-17T14:30:00Z');

describe('Horarios de comidas', () => {
  beforeEach(() => { mockUser = 'owner'; mockRead.mockReset(); mockRequest.mockReset(); });

  it('the suggestion follows the bands: 11:30 is lunch with the fixed ones and breakfast when breakfast runs until 12', () => {
    expect(suggestedMealLabel('2026-11-17', at1130, DEFAULT_MEAL_MOMENT_BANDS)).toBe('lunch');
    expect(suggestedMealLabel('2026-11-17', at1130, mine)).toBe('breakfast');
    // Only today gets a guess; late night has none.
    expect(suggestedMealLabel('2026-11-16', at1130, mine)).toBeUndefined();
    expect(suggestedMealLabel('2026-11-17', new Date('2026-11-18T02:45:00Z'), mine)).toBeUndefined();
  });

  it('a never-set account shows the fixed bands; the read bands become the suggestion of every new draft', async () => {
    mockRead.mockResolvedValueOnce(read(0, null) as never);
    const view = render(element());
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1));
    expect(mockRead.mock.calls[0]![0].path).toBe('/api/mobile/v1/nutrition/moment-bands');
    expect(value(view, 'breakfastFrom')).toBe('05:00'); expect(value(view, 'dinnerUntil')).toBe('23:00');
    expect(currentMealMomentBands()).toEqual(DEFAULT_MEAL_MOMENT_BANDS);
    view.unmount();

    mockRead.mockResolvedValueOnce(read(3, mine) as never);
    const again = render(element());
    await waitFor(() => expect(value(again, 'lunchFrom')).toBe('12:00'));
    expect(currentMealMomentBands()).toEqual(mine);
    jest.useFakeTimers({ now: at1130, doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const option = { source: { kind: 'saved', id: 'x', version: 'v' }, name: 'X', description: null, templateType: 'manual', calories: 1, proteinG: null, carbsG: null, fatG: null, items: [], useCount: null, lastUsedDate: null } as unknown as QuickOption;
      expect(quickDraft('2026-11-17', option).mealLabel).toBe('breakfast');
      expect(mealDraft('2026-11-17').mealLabel).toBe('breakfast');
    } finally { jest.useRealTimers(); }
    // Signing out drops back to the fixed bands.
    mockUser = null; again.rerender(element());
    await waitFor(() => expect(currentMealMomentBands()).toEqual(DEFAULT_MEAL_MOMENT_BANDS));
  });

  it('moves a limit by half an hour within its neighbours and saves the five limits once, against the revision read', async () => {
    mockRead.mockResolvedValueOnce(read(3, mine) as never);
    const view = render(element());
    await waitFor(() => expect(value(view, 'lunchFrom')).toBe('12:00'));
    const save = view.getByTestId('moment-bands-save');
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(view.getByLabelText('Desayuno hasta, media hora después'));
    expect(value(view, 'lunchFrom')).toBe('12:30');
    // The start of the day is a quiet line until «Cambiar»; breakfast cannot start before midnight.
    fireEvent.press(view.getByText('Cambiar'));
    for (let i = 0; i < 20; i++) fireEvent.press(view.getByLabelText('Arranque del día, media hora antes'));
    expect(value(view, 'breakfastFrom')).toBe('00:00');
    expect(view.getByLabelText('Arranque del día, media hora antes').props.accessibilityState).toMatchObject({ disabled: true });
    const next = { ...mine, breakfastFrom: 0, lunchFrom: 750 };
    mockRequest.mockResolvedValueOnce({ status: 'ok', data: { revision: 4, bands: next }, meta } as never);
    await act(async () => { fireEvent.press(view.getByTestId('moment-bands-save')); });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    const sent = mockRequest.mock.calls[0]![0];
    expect(sent).toMatchObject({ method: 'PUT', path: '/api/mobile/v1/nutrition/moment-bands', body: { bands: next, expectedRevision: 3 } });
    expect((sent.body as { idempotencyKey: string }).idempotencyKey).toMatch(/^moment-bands:[A-Za-z0-9.:_-]+$/);
    expect(currentMealMomentBands()).toEqual(next);
  });

  it('an unknown outcome keeps the change and retries it with the same key; a conflict shows the saved bands', async () => {
    mockRead.mockResolvedValueOnce(read(3, mine) as never);
    const view = render(element());
    await waitFor(() => expect(value(view, 'snackFrom')).toBe('16:00'));
    fireEvent.press(view.getByLabelText('Almuerzo hasta, media hora después'));
    mockRequest.mockResolvedValueOnce(unknown as never);
    await act(async () => { fireEvent.press(view.getByTestId('moment-bands-save')); });
    expect(view.getByText('No sabemos si se guardó. Probá de nuevo: no se guarda dos veces.')).toBeTruthy();
    expect(currentMealMomentBands()).toEqual(mine);
    const truth = { ...mine, dinnerFrom: 1230 };
    mockRequest.mockResolvedValueOnce({ status: 'conflict', code: 'MEAL_MOMENT_BANDS_CHANGED', message: 'x', data: { error: 'MEAL_MOMENT_BANDS_CHANGED', message: 'x', current: { revision: 5, bands: truth } }, meta } as never);
    await act(async () => { fireEvent.press(view.getByTestId('moment-bands-save')); });
    const [first, second] = mockRequest.mock.calls.map(call => call[0].body as { idempotencyKey: string; bands: MealMomentBands });
    expect(second!.idempotencyKey).toBe(first!.idempotencyKey); expect(second!.bands).toEqual(first!.bands);
    expect(view.getByText('Tus horarios cambiaron en otro dispositivo. Te mostramos los guardados.')).toBeTruthy();
    expect(currentMealMomentBands()).toEqual(truth);
  });

  it('unreadable bands are said as such: the fixed ones are used and nothing can be saved', async () => {
    mockRead.mockResolvedValueOnce({ status: 'ok', data: { status: 'unavailable' }, meta } as never);
    const view = render(element());
    await view.findByText('No pudimos leer tus horarios. Mientras tanto usamos los de siempre.');
    expect(view.getByLabelText('Desayuno hasta, media hora después').props.accessibilityState).toMatchObject({ disabled: true });
    expect(currentMealMomentBands()).toEqual(DEFAULT_MEAL_MOMENT_BANDS);
    mockRead.mockResolvedValueOnce(read(1, mine) as never);
    await act(async () => { fireEvent.press(view.getByText('Reintentar')); });
    await waitFor(() => expect(value(view, 'lunchFrom')).toBe('12:00'));
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
