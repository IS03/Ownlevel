import { act, renderHook } from '@testing-library/react-native';
import { afterEach, expect, it, jest } from '@jest/globals';
import { useEffect, type PropsWithChildren } from 'react';
import { MobileApiProvider, useMobileApi } from './provider';
import { confirmedReads } from './confirmed-read-cache';

let mockOwner: string | null = 'a';
const mockAccess = jest.fn(), mockRevalidate = jest.fn();
const mockMount = jest.fn();
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ getAccessTokenForApi: mockAccess, revalidateApiSession: mockRevalidate,
  session: mockOwner ? { user: { id: mockOwner } } : null }) }));
jest.mock('./config', () => ({ readMobileApiConfig: () => ({ appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1000 }) }));
jest.mock('./runtime', () => ({ createMobileClientRuntime: () => ({ appVersion: '1', build: '1', platform: 'ios' }), createMobileClientHeaders: () => ({}) }));
function OwnerLifetime({ children }: PropsWithChildren) { useEffect(() => { mockMount(); }, []); return children; }
function TestProvider({ children }: PropsWithChildren) { return <MobileApiProvider><OwnerLifetime>{children}</OwnerLifetime></MobileApiProvider>; }
afterEach(() => { mockOwner = 'a'; mockMount.mockClear(); });
it('keeps one client through same-user renders, replaces it on account changes and retires the previous cache', async () => {
  const view = renderHook(() => useMobileApi(), { wrapper: TestProvider });
  const first = view.result.current.client!;
  const entry = confirmedReads(first).get('body', '30', async () => ({ status: 'ok', data: 9, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } }));
  await act(async () => { await confirmedReads(first).ensure(entry, 'initial'); });
  view.rerender({}); expect(view.result.current.client).toBe(first);
  expect(mockMount).toHaveBeenCalledTimes(1);
  mockOwner = 'b'; view.rerender({}); const second = view.result.current.client!; expect(second).not.toBe(first);
  expect(mockMount).toHaveBeenCalledTimes(2);
  expect(confirmedReads(second).get('body', '30', async () => ({ status: 'auth_required', meta: { durationMs: 0, httpStatus: null, outcome: 'auth_required' } })).resource.getSnapshot().status).toBe('loading');
  expect(confirmedReads(first).get('body', '30', async () => ({ status: 'auth_required', meta: { durationMs: 0, httpStatus: null, outcome: 'auth_required' } })).resource).not.toBe(entry.resource);
  mockOwner = null; view.rerender({}); expect(view.result.current.client).toBeNull();
  mockOwner = 'a'; view.rerender({}); expect(view.result.current.client).not.toBe(first); view.unmount();
});
