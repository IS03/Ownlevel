import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type PropsWithChildren } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { MobileAuthProvider, useMobileAuth } from './provider';
import { AUTH_OPERATION_TIMEOUT_MS } from './constants';

const session = { access_token: 'test-token', user: { id: 'owner' } } as Session;
const mockAuth = {
  getSession: jest.fn<() => Promise<{ data: { session: Session | null }; error: Error | null }>>(),
  getUser: jest.fn<() => Promise<{ data: { user: Session['user'] }; error: null }>>(),
  startAutoRefresh: jest.fn<() => Promise<void>>(), stopAutoRefresh: jest.fn<() => Promise<void>>(),
  onAuthStateChange: jest.fn<(callback: (event: AuthChangeEvent, session: Session | null) => void) => { data: { subscription: { unsubscribe: () => void } } }>(),
};
jest.mock('./client', () => ({ getMobileSupabaseClient: () => ({ auth: mockAuth }) }));
jest.mock('expo-linking', () => ({ getInitialURL: async () => null }));
jest.mock('expo-web-browser', () => ({}));

let mounts = 0, unmounts = 0;
let appStateListener: (state: AppStateStatus) => void;
function ProtectedRoute() {
  useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
  return null;
}
function Probe({ children }: PropsWithChildren) {
  const current = useMobileAuth();
  return <>{current.session ? <ProtectedRoute /> : null}{children}</>;
}
function TestProvider({ children }: PropsWithChildren) {
  return <MobileAuthProvider><Probe>{children}</Probe></MobileAuthProvider>;
}
async function signedIn() {
  const view = renderHook(() => useMobileAuth(), { wrapper: TestProvider });
  await waitFor(() => expect(view.result.current.state.status).toBe('SIGNED_IN'));
  return view;
}
beforeEach(() => {
  jest.clearAllMocks(); mounts = 0; unmounts = 0;
  mockAuth.getSession.mockResolvedValue({ data: { session }, error: null });
  mockAuth.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
  mockAuth.startAutoRefresh.mockResolvedValue(); mockAuth.stopAutoRefresh.mockResolvedValue();
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { appStateListener = listener; return { remove: jest.fn() }; });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('retained auth navigation during resume', () => {
  it.each(['token', 'revalidation'])('keeps the protected route mounted on transient %s failure without granting a token', async operation => {
    const view = await signedIn(), retained = view.result.current.session; mockAuth.getSession.mockRejectedValueOnce(new Error('transient'));
    await act(async () => {
      const result = operation === 'token' ? await view.result.current.getAccessTokenForApi() : await view.result.current.revalidateApiSession('test-token');
      expect(result.status).toBe('unavailable');
      expect(result).not.toHaveProperty('accessToken');
    });
    expect(view.result.current.state.status).toBe('TRANSIENT_ERROR'); expect(view.result.current.session).toBe(retained);
    expect(mounts).toBe(1); expect(unmounts).toBe(0); view.unmount();
  });
  it('keeps navigation on a token timeout and a subsequent transient foreground restore', async () => {
    const view = await signedIn(), retained = view.result.current.session; jest.useFakeTimers();
    mockAuth.getSession.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      const token = view.result.current.getAccessTokenForApi();
      await jest.advanceTimersByTimeAsync(AUTH_OPERATION_TIMEOUT_MS);
      expect((await token).status).toBe('unavailable');
    });
    expect(view.result.current.session).toBe(retained); expect(unmounts).toBe(0);
    mockAuth.getSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('network') });
    await act(async () => { appStateListener('background'); appStateListener('active'); });
    expect(view.result.current.session).toBe(retained); expect(unmounts).toBe(0);
    await act(async () => { appStateListener('background'); appStateListener('active'); });
    expect(view.result.current.state.status).toBe('SIGNED_IN'); expect(mounts).toBe(1); view.unmount();
  });
  it('still removes protected navigation when local absence is confirmed', async () => {
    const view = await signedIn(); mockAuth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await act(async () => { expect((await view.result.current.getAccessTokenForApi()).status).toBe('auth_required'); });
    expect(view.result.current.session).toBeNull(); expect(unmounts).toBe(1); view.unmount();
  });
  it('still handles a confirmed sign-out event immediately', async () => {
    const view = await signedIn();
    act(() => mockAuth.onAuthStateChange.mock.calls[0][0]('SIGNED_OUT', null));
    expect(view.result.current.session).toBeNull(); expect(unmounts).toBe(1); view.unmount();
  });
  it('does not resurrect navigation when an unavailable result arrives after confirmed sign-out', async () => {
    const view = await signedIn(); let reject!: (error: Error) => void;
    mockAuth.getSession.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    await act(async () => {
      const request = view.result.current.getAccessTokenForApi();
      mockAuth.onAuthStateChange.mock.calls[0][0]('SIGNED_OUT', null);
      reject(new Error('network')); await request;
    });
    expect(view.result.current.session).toBeNull(); expect(mounts).toBe(1); expect(unmounts).toBe(1); view.unmount();
  });
});
