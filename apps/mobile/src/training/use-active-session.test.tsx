import { act, renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, type AppStateStatus } from 'react-native';
import type { MobileApiClient } from '@/api/client';
import { testDetail, SESSION_ID } from './active-session-test-fixtures';
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
  afterEach(() => { jest.restoreAllMocks(); mockValues.clear(); mockFocus = null; });
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
