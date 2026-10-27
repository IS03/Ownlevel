import { act, renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, type AppStateStatus } from 'react-native';
import type { MobileApiClient } from '@/api/client';
import { testDetail, SESSION_ID, EXERCISE_ID, NEXT_VERSION } from './active-session-test-fixtures';
import { useActiveSession } from './use-active-session';

let mockFocus: (() => void | (() => void)) | null = null;
const mockValues = new Map<string, string>();
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => { mockFocus = callback; } }));
jest.mock('./active-session-native-storage', () => ({ activeSessionStorage: {
  getItem: async (key: string) => mockValues.get(key) ?? null,
  setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  removeItem: async (key: string) => { mockValues.delete(key); },
  getAllKeys: async () => [...mockValues.keys()],
} }));
describe('native active-session lifecycle', () => {
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); mockValues.clear(); mockFocus = null; });
  it('keeps the same controller and edits through inactive/background while the foreground response is slow', async () => {
    let listener!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => { listener = handler; return { remove: jest.fn() }; });
    const meta = { durationMs: 0, httpStatus: 200, outcome: 'ok' as const };
    const request = jest.fn<MobileApiClient['request']>().mockResolvedValue({ status: 'ok', data: testDetail(), meta });
    const client = { request, read: jest.fn() } as MobileApiClient;
    const view = renderHook(() => useActiveSession(client, 'owner', SESSION_ID));
    await waitFor(() => expect(view.result.current.state.status).toBe('ready'));
    const controller = view.result.current.controller; jest.useFakeTimers(); request.mockClear();
    let resolve!: (result: Awaited<ReturnType<MobileApiClient['request']>>) => void;
    request.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    request.mockResolvedValue({ status: 'ok', data: { sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION }, meta });
    act(() => { listener('inactive'); listener('background'); listener('active'); (mockFocus as unknown as () => void)(); });
    expect(view.result.current.controller).toBe(controller); expect(controller.canEdit(EXERCISE_ID)).toBe(true);
    expect(view.result.current.state.refreshing).toBe(true);
    await act(async () => {
      controller.change(EXERCISE_ID, draft => ({ ...draft, sets: draft.sets.map(set => ({ ...set, actualReps: '13', actualWeightKg: '48,5', targetRir: 1 })) }));
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(request).toHaveBeenCalledTimes(1); expect(controller.getExercise(EXERCISE_ID)?.draft.sets[0].actualReps).toBe('13');
    await act(async () => { resolve({ status: 'ok', data: testDetail(), meta }); await controller.refresh(); await controller.flush(EXERCISE_ID); });
    expect(view.result.current.controller).toBe(controller); expect(controller.getExercise(EXERCISE_ID)?.draft.sets[0].actualWeightKg).toBe('48,5');
    expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[1][0].method).toBe('PUT'); view.unmount();
  });
  it('reconciles foreground/focus through one in-flight read and removes its listener', async () => {
    let listener: ((state: AppStateStatus) => void) | null = null;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => { listener = handler; return { remove }; });
    const request = jest.fn<MobileApiClient['request']>().mockResolvedValue({ status: 'ok', data: testDetail(), meta: { durationMs: 0, httpStatus: 200, outcome: 'ok' } });
    const client = { request, read: jest.fn() } as MobileApiClient;
    const view = renderHook(() => useActiveSession(client, 'owner', SESSION_ID));
    await waitFor(() => expect(view.result.current.state.status).toBe('ready'));
    request.mockClear();
    await act(async () => {
      (listener as unknown as (state: AppStateStatus) => void)('background');
      (listener as unknown as (state: AppStateStatus) => void)('active');
      (mockFocus as unknown as () => void)();
      await view.result.current.controller.refresh();
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].path).toBe(`/api/mobile/v1/training/sessions/${SESSION_ID}?routineAdditions=1`);
    view.unmount(); expect(remove).toHaveBeenCalled();
  });
});
