import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, Keyboard, Platform, type AppStateStatus } from 'react-native';
import { invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiClient } from '@/api/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { ActiveSessionController, type ActiveSessionApi } from './active-session-controller';
import { SessionDraftRepository } from './active-session-storage';
import { activeSessionStorage } from './active-session-native-storage';
import { SessionPresenceProvider, useSessionPresenceStore } from './session-presence-provider';
import { SessionReturnDock } from './session-return-dock';
import { useSessionNavigation } from './use-session-navigation';
import type { SessionPresenceStore } from './session-presence-store';
import { EXERCISE_ID, SESSION_ID, testDetail } from './active-session-test-fixtures';
import TabsLayout from '../../app/(tabs)/_layout';
import ActiveWorkoutShortcut from '../../app/(tabs)/active-workout';

const meta = { durationMs: 0, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
let mockPath = '/home';
let mockOwner = 'owner';
const mockNavigate = jest.fn();
const mockRedirect = jest.fn();
const mockTrigger = jest.fn();
const mockTabInsets = jest.fn();
const mockValues = new Map<string, string>();
const mockReadActive = async () => ok({ activeSession: { status: 'ok', data: { id: SESSION_ID, name: 'Sesión libre', logDate: '2026-09-30' } }, calendar: { status: 'ok', data: { month: '2026-09', days: [] } } });
const mockRead = jest.fn().mockImplementation(mockReadActive);
const mockRequest = jest.fn().mockImplementation(async () => ok(testDetail()));
const mockClient = { read: mockRead, request: mockRequest };
const initialAppState = AppState.currentState;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: mockOwner } } }) }));
jest.mock('@/platform/haptics', () => ({ triggerHaptic: (event: string) => mockTrigger(event), haptics: { selection: jest.fn() } }));
jest.mock('expo-router', () => ({ usePathname: () => mockPath, useRouter: () => ({ navigate: mockNavigate }), useIsFocused: () => false, Redirect: ({ href }: { href: unknown }) => { mockRedirect(href); return null; } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('./use-session-navigation', () => ({ ...jest.requireActual<typeof import('./use-session-navigation')>('./use-session-navigation'), supportsNativeSessionNavigation: true }));
jest.mock('expo-router/unstable-native-tabs', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Hidden = React.createContext(false);
  const Trigger = Object.assign(({ name, hidden, accessibilityLabel, listeners, children, disableAutomaticContentInsets }: {
    name: string; hidden?: boolean; accessibilityLabel?: string; listeners?: { tabPress?: () => void }; children?: React.ReactNode; disableAutomaticContentInsets?: boolean;
  }) => {
    mockTabInsets(name, disableAutomaticContentInsets);
    return hidden ? null : <Pressable testID={`native-tab-${name}`} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      onPress={() => listeners?.tabPress?.()}>{children}</Pressable>;
  }, {
    Icon: () => null,
    Label: ({ children, hidden }: { children?: React.ReactNode; hidden?: boolean }) => hidden ? null : <Text>{children}</Text>,
  });
  return { NativeTabs: Object.assign(({ children, unstable_nativeProps }: { children?: React.ReactNode; unstable_nativeProps?: { ios?: { bottomAccessoryHidden?: boolean } } }) =>
    <Hidden.Provider value={!!unstable_nativeProps?.ios?.bottomAccessoryHidden}><View testID="native-tabs">{children}</View></Hidden.Provider>, {
    Trigger,
    BottomAccessory: ({ children }: { children?: React.ReactNode }) => React.useContext(Hidden) ? null : <View testID="native-bottom-accessory">{children}</View>,
  }) };
});
jest.mock('./active-session-native-storage', () => ({ activeSessionStorage: {
  getItem: async (key: string) => mockValues.get(key) ?? null,
  setItem: async (key: string, value: string) => { mockValues.set(key, value); },
  removeItem: async (key: string) => { mockValues.delete(key); }, getAllKeys: async () => [...mockValues.keys()],
} }));

function setup(nativeTabs = false) {
  let store: SessionPresenceStore | null = null;
  function LegacyDock() { return <SessionReturnDock navigation={useSessionNavigation()} />; }
  function Dock() {
    store = useSessionPresenceStore();
    return nativeTabs ? <><TabsLayout /><ActiveWorkoutShortcut /></> : <LegacyDock />;
  }
  const screen = () => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode="light"><SessionPresenceProvider><Dock /></SessionPresenceProvider></OwnlevelThemeProvider>
  </SafeAreaProvider>;
  const controller = new ActiveSessionController({ detail: async () => ok(testDetail()) } as ActiveSessionApi, new SessionDraftRepository(activeSessionStorage, 'owner', SESSION_ID));
  return { ...render(screen()), screen, controller, getStore: () => store! };
}
describe('global session return dock', () => {
  it.each(['ios', 'android'] as const)('respects manual Progress insets without changing the other native tabs (%s)', async platform => {
    jest.replaceProperty(Platform, 'OS', platform);
    mockTabInsets.mockClear();
    const view = setup(true);
    await act(async () => { await view.getStore().refresh(); });
    expect(mockTabInsets).toHaveBeenCalledWith('progress', platform === 'ios');
    for (const tab of ['home', 'train', 'nutrition']) expect(mockTabInsets).toHaveBeenCalledWith(tab, undefined);
    view.controller.dispose();
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); AppState.currentState = initialAppState; mockValues.clear(); mockPath = '/home'; mockOwner = 'owner'; mockNavigate.mockClear(); mockRedirect.mockClear(); mockTrigger.mockClear(); mockRead.mockImplementation(mockReadActive); });
  it.each([false, true])('preserves the native Keyboard receiver when initial visibility is %s', async (visible) => {
    jest.spyOn(Keyboard, 'isVisible').mockImplementation(function (this: typeof Keyboard) {
      expect(this === Keyboard).toBe(true);
      return visible;
    });
    const view = setup();
    await act(async () => { await view.getStore().refresh(); });
    if (visible) expect(view.queryByTestId('session-return-dock')).toBeNull();
    else expect(view.getByTestId('session-return-dock')).toBeTruthy();
    view.controller.dispose();
  });
  it('opens the existing workout from other tabs and hides the dock only in that workout', async () => {
    const view = setup(); await waitFor(() => expect(view.getByRole('button', { name: 'Volver a la rutina en curso: Sesión libre' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Volver a la rutina en curso: Sesión libre' }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/(tabs)/train/session/[id]', params: { id: SESSION_ID } });
    mockPath = `/train/session/${SESSION_ID}`; view.rerender(view.screen()); expect(view.queryByTestId('session-return-dock')).toBeNull();
    mockPath = '/nutrition'; view.rerender(view.screen()); expect(view.getByTestId('session-return-dock')).toBeTruthy();
    await act(async () => { await view.getStore().refresh(); }); view.controller.dispose();
  });
  it('keeps the same countdown and one haptic while changing sections and after the workout screen detaches', async () => {
    jest.useFakeTimers(); AppState.currentState = 'active';
    const view = setup(); await act(async () => { await view.getStore().refresh(); await view.controller.refresh(); });
    let detach!: () => void;
    act(() => { detach = view.getStore().attach(SESSION_ID, view.controller); view.controller.startRest(EXERCISE_ID); });
    act(() => { jest.advanceTimersByTime(0); });
    expect(view.getByText('02:00')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(30_000); }); expect(view.getByText('01:30')).toBeTruthy();
    const deadline = view.controller.getTimer(); detach(); view.controller.dispose();
    mockPath = `/train/session/${SESSION_ID}`; view.rerender(view.screen()); expect(view.queryByText('01:30')).toBeNull();
    act(() => { jest.advanceTimersByTime(30_000); });
    mockPath = '/progress'; view.rerender(view.screen()); expect(view.getByText('01:00')).toBeTruthy();
    await act(async () => { await view.getStore().refresh(); }); expect(view.getStore().getSnapshot().timer).toEqual(deadline);
    act(() => { jest.advanceTimersByTime(60_000); }); expect(view.queryByTestId('session-rest-accessory')).toBeNull();
    expect(view.getByRole('button', { name: 'Volver a la rutina en curso: Sesión libre' })).toBeTruthy();
    expect(mockTrigger.mock.calls).toEqual([['restEnd']]);
    act(() => { jest.advanceTimersByTime(5000); }); expect(mockTrigger.mock.calls).toEqual([['restEnd']]);
  });
  it('clears the previous account’s timer when authentication changes', async () => {
    const view = setup(); await act(async () => { await view.getStore().refresh(); await view.controller.refresh(); });
    let detach!: () => void;
    act(() => { detach = view.getStore().attach(SESSION_ID, view.controller); view.controller.startRest(EXERCISE_ID); });
    await waitFor(() => expect(view.getByText('02:00')).toBeTruthy()); detach(); view.controller.dispose();
    mockOwner = 'other-owner'; view.rerender(view.screen());
    expect(view.queryByText('02:00')).toBeNull();
    await act(async () => { await view.getStore().refresh(); }); expect(view.getStore().getSnapshot().timer).toBeNull();
  });
  it('gets out of the way while the keyboard is open', async () => {
    let show!: () => void, hide!: () => void;
    const subscribe = Keyboard.addListener.bind(Keyboard);
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      if (event === 'keyboardWillShow' || event === 'keyboardDidShow') show = listener as () => void;
      else hide = listener as () => void;
      return subscribe(event, listener);
    });
    const view = setup(); await act(async () => { await view.getStore().refresh(); });
    expect(view.getByTestId('session-return-dock')).toBeTruthy();
    act(() => { show(); }); expect(view.queryByTestId('session-return-dock')).toBeNull();
    act(() => { hide(); }); expect(view.getByTestId('session-return-dock')).toBeTruthy(); view.controller.dispose();
  });
  it('keeps four native sections, opens the existing session and hides the expired native accessory', async () => {
    jest.useFakeTimers(); AppState.currentState = 'active';
    const view = setup(true);
    await act(async () => { await view.getStore().refresh(); await view.controller.refresh(); });
    for (const tab of ['home', 'train', 'nutrition', 'progress']) expect(view.getByTestId(`native-tab-${tab}`)).toBeTruthy();
    expect(view.queryByTestId('session-return-dock')).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(view.queryByTestId('native-bottom-accessory')).toBeNull();
    // Outside the workout there is a fifth, detached tab; inside it there are four.
    expect(view.getByTestId('native-tab-active-workout')).toBeTruthy();
    mockPath = `/train/session/${SESSION_ID}`; view.rerender(view.screen());
    expect(view.queryByTestId('native-tab-active-workout')).toBeNull();
    mockPath = '/train/routines'; view.rerender(view.screen()); // leaving it, from anywhere, brings the tab back
    expect(view.getByTestId('native-tab-active-workout')).toBeTruthy();
    mockPath = '/home'; view.rerender(view.screen());
    fireEvent.press(view.getByTestId('native-tab-active-workout'));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/(tabs)/train/session/[id]', params: { id: SESSION_ID } });
    mockPath = `/train/session/${SESSION_ID}`; view.rerender(view.screen()); mockPath = '/home'; view.rerender(view.screen());
    let detach!: () => void;
    act(() => { detach = view.getStore().attach(SESSION_ID, view.controller); view.controller.startRest(EXERCISE_ID); });
    act(() => { jest.advanceTimersByTime(0); });
    expect(view.getByTestId('native-bottom-accessory')).toBeTruthy();
    fireEvent.press(view.getByTestId('session-rest-accessory'));
    expect(mockNavigate).toHaveBeenCalledTimes(2);
    mockPath = `/train/session/${SESSION_ID}`; view.rerender(view.screen()); mockPath = '/home'; view.rerender(view.screen());
    act(() => { jest.advanceTimersByTime(120_000); });
    expect(view.queryByTestId('native-bottom-accessory')).toBeNull();
    expect(view.getByTestId('native-tab-active-workout')).toBeTruthy();
    expect(mockTrigger.mock.calls).toEqual([['restEnd']]);
    act(() => { view.controller.skipRest(); });
    expect(view.queryByTestId('native-bottom-accessory')).toBeNull();
    detach(); view.controller.dispose();
  });
  it('reads presence once across five quick route changes, and revalidates after a settled write', async () => {
    mockRead.mockClear(); mockRequest.mockClear();
    const view = setup(); await waitFor(() => expect(view.getByTestId('session-return-dock')).toBeTruthy());
    await act(async () => { await Promise.resolve(); });
    for (const path of ['/nutrition', '/progress', '/train', '/settings', '/home']) {
      mockPath = path; view.rerender(view.screen());
      await act(async () => { await Promise.resolve(); });
    }
    expect(mockRead).toHaveBeenCalledTimes(1); expect(mockRequest).toHaveBeenCalledTimes(1);
    invalidateConfirmedReads(mockClient as unknown as MobileApiClient, '/api/mobile/v1/training/sessions/id/finish');
    mockRead.mockImplementationOnce(async () => ok({ activeSession: { status: 'ok', data: null }, calendar: { status: 'ok', data: { month: '2026-09', days: [] } } }));
    mockPath = '/train'; view.rerender(view.screen());
    await waitFor(() => expect(view.queryByTestId('session-return-dock')).toBeNull());
    expect(mockRead).toHaveBeenCalledTimes(2); view.unmount(); view.controller.dispose();
  });
  it('forces one read on real foreground, ignores repeated active events, and leaves the session route to its controller', async () => {
    AppState.currentState = 'active';
    const listeners = new Set<(state: AppStateStatus) => void>();
    const removals: ReturnType<typeof jest.fn>[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      listeners.add(handler);
      const remove = jest.fn(() => { listeners.delete(handler); }); removals.push(remove); return { remove };
    });
    const emit = async (state: AppStateStatus) => {
      await act(async () => { AppState.currentState = state; for (const listener of listeners) listener(state); });
    };
    mockRead.mockClear(); mockRequest.mockClear();
    const view = setup(); await waitFor(() => expect(view.getByTestId('session-return-dock')).toBeTruthy());
    await emit('background'); await emit('active'); await emit('active');
    expect(mockRead).toHaveBeenCalledTimes(2); expect(mockRequest).toHaveBeenCalledTimes(2);
    mockPath = `/train/session/${SESSION_ID}`; view.rerender(view.screen());
    await emit('inactive'); await emit('background'); await emit('active');
    expect(mockRead).toHaveBeenCalledTimes(2); expect(mockRequest).toHaveBeenCalledTimes(2);
    view.unmount(); expect(listeners.size).toBe(0); expect(removals.every(remove => remove.mock.calls.length === 1)).toBe(true); view.controller.dispose();
  });
  it('shows only the original four sections when the server confirms no active session', async () => {
    mockRead.mockImplementation(async () => ok({ activeSession: { status: 'ok', data: null }, calendar: { status: 'ok', data: { month: '2026-09', days: [] } } }));
    const view = setup(true);
    await waitFor(() => expect(mockRead).toHaveBeenCalled());
    await act(async () => { await view.getStore().refresh(); });
    expect(view.queryByTestId('native-tab-active-workout')).toBeNull();
    expect(view.queryByTestId('native-bottom-accessory')).toBeNull();
    for (const tab of ['home', 'train', 'nutrition', 'progress']) expect(view.getByTestId(`native-tab-${tab}`)).toBeTruthy();
    view.controller.dispose();
  });
});
