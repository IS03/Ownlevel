// #303 C3a: the exercise library as a retained reading of the existing ConfirmedReadCache. Real cache, simulated API
// client and request counters: the counts are simulated requests, never network traffic or latency measurements.
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileTrainingExercise } from '@/api/exercises';

import { useExerciseLibrary } from './use-exercise-library';

const mockFetch = jest.fn<(client: unknown, signal: AbortSignal) => Promise<unknown>>();
const mockUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSetStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
let mockClient: object = {};
let mockFocusEffects: (() => (() => void) | void)[] = [];
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | void) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      mockFocusEffects.push(effect);
      const cleanup = effect(); // on screen while mounted
      return () => { mockFocusEffects = mockFocusEffects.filter(item => item !== effect); cleanup?.(); };
    }, [effect]);
  },
}));
jest.mock('@/api', () => ({
  createMobileTrainingExercise: (...args: unknown[]) => mockCreate(...args),
  fetchMobileTrainingExercises: (client: unknown, signal: AbortSignal) => mockFetch(client, signal),
  setMobileTrainingExerciseStatus: (...args: unknown[]) => mockSetStatus(...args),
  updateMobileTrainingExerciseIdentity: (...args: unknown[]) => mockUpdate(...args),
  useMobileApi: () => ({ client: mockClient }),
}));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const press = (updatedAt = '2026-11-01T10:00:00.000Z', name = 'Press'): MobileTrainingExercise => ({
  id: 'e1', name, muscleGroup: 'pecho', implement: 'Máquina', weightMode: 'Peso total', routineIds: [], isActive: true, notes: null, updatedAt,
} as unknown as MobileTrainingExercise);
const catalog = (...exercises: MobileTrainingExercise[]) => ({ status: 'ok', data: { catalog: { status: 'ok', data: { exercises, routines: [] } } }, meta });
const START = Date.parse('2026-11-13T15:00:00.000Z');
let clock = START;
let listeners: ((state: string) => void)[] = [];
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
const library = () => renderHook(() => useExerciseLibrary());
/** A complete visit: open the screen, let its reading settle, leave. */
async function visit() { const view = library(); await settle(); view.unmount(); }
const names = (view: ReturnType<typeof library>) => view.result.current.exercises.map(exercise => exercise.name);
/** The API client invalidates retained readings when a write settles (client.ts); simulated writes do the same. */
const settledWrite = (path: string, result: unknown) => async () => { invalidateConfirmedReads(mockClient as never, path); return result; };

beforeEach(() => {
  clock = START; listeners = []; mockFocusEffects = [];
  mockClient = {};
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: () => { listeners = listeners.filter(item => item !== listener); } } as never;
  });
  [mockFetch, mockUpdate, mockSetStatus, mockCreate].forEach(mock => mock.mockReset());
  mockFetch.mockImplementation(async () => catalog(press()));
});
afterEach(() => { clearConfirmedReads(mockClient as never); jest.restoreAllMocks(); });

describe('exercise library retention (#303 C3a)', () => {
  it('leaving and coming back within 30 s shows the library with no request; after 30 s it shows it and reads again', async () => {
    const first = library();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    first.unmount();
    clock += 20_000;
    const again = library();
    expect(again.result.current.state.status).toBe('ready'); // at once, no skeleton
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1); // before C3a: 2
    again.unmount();
    clock += 15_000; // 35 s after the read
    const later = library();
    expect(names(later)).toEqual(['Press']); // the retained reading is shown while it revalidates
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    later.unmount();
  });

  it('the library and an exercise detail opened from it share one reading', async () => {
    const list = library();
    await settle();
    const detail = library();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1); // before C3a: 2
    expect(names(detail)).toEqual(['Press']);
    list.unmount(); detail.unmount();
  });

  it.each([
    ['an exercise edit', '/api/mobile/v1/training/exercises/e1'],
    ['an exercise created', '/api/mobile/v1/training/exercises'],
    ['an exercise added to a routine', '/api/mobile/v1/training/routines/r1/template'],
    ['a routine reordered', '/api/mobile/v1/training/routines/order'],
    ['a finished session', '/api/mobile/v1/training/sessions/s1/finish'],
  ])('after %s anywhere, coming back reads it again within 30 s', async (_name, path) => {
    await visit();
    invalidateConfirmedReads(mockClient as never, path);
    clock += 1_000;
    const again = library();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    again.unmount();
  });

  it('an unrelated write (a meal) keeps the reading', async () => {
    await visit();
    invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/nutrition/days/2026-11-13/meals');
    clock += 1_000;
    const again = library();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    again.unmount();
  });

  it('CAS: an edit from a retained reading reads the catalog first and sends that version', async () => {
    await visit();
    clock += 5_000;
    const view = library(); // reuses the 5 s old reading
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    mockFetch.mockImplementation(async () => catalog(press()));
    mockUpdate.mockImplementation(settledWrite('/api/mobile/v1/training/exercises/e1', { status: 'ok', data: { exercise: press('2026-11-13T15:00:06.000Z', 'Press inclinado') }, meta }));
    let error: string | null = 'pending';
    await act(async () => { error = await view.result.current.save(view.result.current.exercises[0], { name: 'Press inclinado' } as never); });
    expect(error).toBeNull();
    // Read again BEFORE writing (not only the post-write read).
    expect(mockFetch.mock.invocationCallOrder[1]).toBeLessThan(mockUpdate.mock.invocationCallOrder[0]);
    expect(mockUpdate.mock.calls[0][3]).toBe('2026-11-01T10:00:00.000Z'); // the version of a reading of this visit
    view.unmount();
  });

  it('CAS: if the exercise changed since the retained reading, nothing is written and the new data is shown', async () => {
    await visit();
    clock += 5_000;
    const view = library();
    await settle();
    const retained = view.result.current.exercises[0];
    mockFetch.mockImplementation(async () => catalog(press('2026-11-13T14:59:59.000Z', 'Press (otro dispositivo)')));
    let error: string | null = null;
    await act(async () => { error = await view.result.current.save(retained, { name: 'Press inclinado' } as never); });
    await settle();
    expect(error).toMatch(/cambió/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(names(view)).toEqual(['Press (otro dispositivo)']);
    view.unmount();
  });

  it('CAS: an edit cannot be verified offline, so it is not written with a retained version', async () => {
    await visit();
    clock += 5_000;
    const view = library();
    await settle();
    mockFetch.mockImplementation(async () => ({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }));
    let error: string | null = null;
    await act(async () => { error = await view.result.current.save(view.result.current.exercises[0], { name: 'X' } as never); });
    expect(error).toMatch(/verificar/);
    expect(mockUpdate).not.toHaveBeenCalled();
    view.unmount();
  });

  it('a read that started before a write never overwrites the state after it, even when it answers last', async () => {
    let finishOld!: (value: unknown) => void;
    const view = library();
    await settle();
    mockFetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementation(async () => catalog({ ...press(), isActive: false } as MobileTrainingExercise));
    await act(async () => { void view.result.current.refresh(); }); // a pull in flight
    const oldSignal = mockFetch.mock.calls[1][1];
    mockSetStatus.mockImplementation(settledWrite('/api/mobile/v1/training/exercises/e1/status', { status: 'ok', data: { exercise: { id: 'e1', isActive: false } }, meta }));
    await act(async () => { await view.result.current.status(view.result.current.exercises[0], false); });
    await settle();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { finishOld(catalog(press())); }); // the pre-write answer (still active) arrives last
    await settle();
    expect(view.result.current.exercises[0].isActive).toBe(false);
    expect(view.result.current.state).toMatchObject({ status: 'ready', current: { data: { catalog: { data: { exercises: [{ isActive: false }] } } } } });
    view.unmount();
  });

  it('an exercise added to a routine from this screen reloads the library without trusting a pre-write read', async () => {
    const view = library();
    await settle();
    invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/training/routines/r1/template');
    await act(async () => { await view.result.current.changed(); });
    expect(mockFetch).toHaveBeenCalledTimes(2); // the focused reading revalidated once; changed() joined it
    view.unmount();
  });

  it('a manual refresh always reads; foreground reads while on screen', async () => {
    const view = library();
    await settle();
    clock += 1_000;
    await act(async () => { await view.result.current.refresh(); });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    act(() => { [...listeners].forEach(l => l('background')); [...listeners].forEach(l => l('active')); });
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it.each([
    ['401', { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } }],
    ['403', { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } }],
  ])('%s: the protected catalog is discarded and never reused', async (_code, denied) => {
    await visit();
    mockFetch.mockImplementationOnce(async () => denied);
    clock += 1_000;
    const view = library();
    await act(async () => { await view.result.current.refresh(); });
    expect((view.result.current.state as { previous?: unknown }).previous).toBeUndefined();
    view.unmount();
    const again = library();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(3); // not reused after the denial
    again.unmount();
  });

  it('offline keeps the last catalog as stale (never fresh), is not reused, and recovers', async () => {
    await visit();
    mockFetch.mockImplementationOnce(async () => ({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }));
    clock += 1_000;
    const view = library();
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.stale).toBe(true);
    expect(names(view)).toEqual(['Press']);
    view.unmount();
    const again = library();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(again.result.current.stale).toBe(false);
    again.unmount();
  });

  it.each([
    ['401', { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } }],
    ['403', { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } }],
  ])('%s while on screen: no exercise, routine or overlay of the protected catalog stays; an authorized read recovers it', async (_code, denied) => {
    mockFetch.mockImplementation(async () => ({ status: 'ok', data: { catalog: { status: 'ok', data: { exercises: [press()], routines: [{ id: 'r1', name: 'PUSH' }] } } }, meta }));
    const view = library();
    await settle();
    // An archive confirmed in this visit (an overlay of the protected catalog).
    mockSetStatus.mockImplementation(async () => ({ status: 'ok', data: { exercise: { id: 'e1', isActive: false } }, meta }));
    mockFetch.mockImplementation(async () => ({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }));
    await act(async () => { await view.result.current.status(view.result.current.exercises[0], false); });
    expect(names(view)).toEqual(['Press']); // network failure: the last catalog stays, marked stale
    expect(view.result.current.stale).toBe(true);
    mockFetch.mockImplementationOnce(async () => denied);
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.exercises).toEqual([]);
    expect(view.result.current.catalog).toBeNull();
    expect(view.result.current.routines).toEqual([]);
    expect(view.result.current.current).toBeUndefined();
    mockFetch.mockImplementation(async () => catalog(press('2026-11-13T15:00:00.000Z', 'Press autorizado')));
    await act(async () => { await view.result.current.refresh(); });
    expect(names(view)).toEqual(['Press autorizado']);
    expect(view.result.current.stale).toBe(false);
    view.unmount();
  });

  it.each([
    ['401', { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } }],
    ['403', { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } }],
  ])('a notice with a name and «Deshacer» (library and detail share it) → %s: it is gone and does not come back after recovery', async (_code, denied) => {
    const view = library();
    await settle();
    mockSetStatus.mockImplementation(settledWrite('/api/mobile/v1/training/exercises/e1/status', { status: 'ok', data: { exercise: { id: 'e1', isActive: false } }, meta }));
    mockFetch.mockImplementation(async () => catalog({ ...press(), isActive: false } as MobileTrainingExercise));
    await act(async () => { await view.result.current.status(view.result.current.exercises[0], false); });
    expect(view.result.current.notice).toMatchObject({ message: 'Press archivado', undo: { exercise: { name: 'Press' } } });
    mockFetch.mockImplementationOnce(async () => denied);
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.notice).toBeNull();
    // Announcing while denied shows and speaks nothing.
    act(() => { view.result.current.announce('Press restaurado', { undo: { exercise: press(), active: false } }); });
    expect(view.result.current.notice).toBeNull();
    await act(async () => { await view.result.current.refresh(); });
    expect(names(view)).toEqual(['Press']);
    expect(view.result.current.notice).toBeNull();
    view.unmount();
  });

  it('CAS regression: archive confirmed, then the re-read fails: editing the identity writes nothing', async () => {
    await visit(); // a retained reading
    const view = library();
    await settle();
    mockSetStatus.mockImplementation(settledWrite('/api/mobile/v1/training/exercises/e1/status', { status: 'ok', data: { exercise: { id: 'e1', isActive: false } }, meta }));
    mockFetch.mockImplementation(async () => ({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }));
    await act(async () => { await view.result.current.status(view.result.current.exercises[0], false); });
    const archived = view.result.current.exercises[0]; // an overlay from a partial reply: updatedAt never confirmed
    expect(archived.isActive).toBe(false);
    let error: string | null = null;
    await act(async () => { error = await view.result.current.save(archived, { name: 'Press inclinado' } as never); });
    expect(error).toMatch(/verificar/);
    expect(mockUpdate).not.toHaveBeenCalled();
    view.unmount();
  });

  it('CAS regression: a restore overlay is not a version either: the edit waits for a verified read', async () => {
    mockFetch.mockImplementation(async () => catalog({ ...press(), isActive: false } as MobileTrainingExercise));
    const view = library();
    await settle();
    mockSetStatus.mockImplementation(settledWrite('/api/mobile/v1/training/exercises/e1/status', { status: 'ok', data: { exercise: { id: 'e1', isActive: true } }, meta }));
    // The server bumped the version on restore; the overlay still carries the old one.
    mockFetch.mockImplementation(async () => catalog(press('2026-11-13T15:00:01.000Z')));
    await act(async () => { await view.result.current.status(view.result.current.exercises[0], true); });
    const stale = { ...press(), isActive: true } as MobileTrainingExercise;
    let error: string | null = null;
    await act(async () => { error = await view.result.current.save(stale, { name: 'Press inclinado' } as never); });
    expect(error).toMatch(/cambió/);
    expect(mockUpdate).not.toHaveBeenCalled();
    view.unmount();
  });

  describe('same millisecond everywhere (fixed clock: confirmedAt === visit start)', () => {
    beforeEach(() => { jest.mocked(Date.now).mockImplementation(() => START); });
    it('a reading retained from a previous visit is read again before an identity write', async () => {
      await visit();
      const view = library();
      await settle();
      expect(mockFetch).toHaveBeenCalledTimes(1); // reused: confirmed in the same millisecond this visit started
      mockUpdate.mockImplementation(settledWrite('/api/mobile/v1/training/exercises/e1', { status: 'ok', data: { exercise: press('2026-11-13T15:00:00.000Z', 'Press inclinado') }, meta }));
      await act(async () => { await view.result.current.save(view.result.current.exercises[0], { name: 'Press inclinado' } as never); });
      expect(mockFetch.mock.invocationCallOrder[1]).toBeLessThan(mockUpdate.mock.invocationCallOrder[0]);
      view.unmount();
    });
    it('another device changed it: nothing is written', async () => {
      await visit();
      const view = library();
      await settle();
      mockFetch.mockImplementation(async () => catalog(press('2026-11-13T14:59:00.000Z', 'Press (otro dispositivo)')));
      let error: string | null = null;
      await act(async () => { error = await view.result.current.save(view.result.current.exercises[0], { name: 'X' } as never); });
      expect(error).toMatch(/cambió/);
      expect(mockUpdate).not.toHaveBeenCalled();
      view.unmount();
    });
    it('the verification read fails: nothing is written', async () => {
      await visit();
      const view = library();
      await settle();
      mockFetch.mockImplementation(async () => ({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }));
      let error: string | null = null;
      await act(async () => { error = await view.result.current.save(view.result.current.exercises[0], { name: 'X' } as never); });
      expect(error).toMatch(/verificar/);
      expect(mockUpdate).not.toHaveBeenCalled();
      view.unmount();
    });
  });

  it('another account never sees this account\'s retained library', async () => {
    await visit();
    const first = mockClient;
    mockClient = {};
    const other = library();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toBe(mockClient);
    other.unmount();
    clearConfirmedReads(first as never);
  });
});
