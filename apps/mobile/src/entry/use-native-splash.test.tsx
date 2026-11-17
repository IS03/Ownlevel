import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as SplashScreen from 'expo-splash-screen';
import { useNativeSplash } from './use-native-splash';
import * as gate from './first-data';
jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(async () => undefined),
}));
describe('Native splash session boundary', () => {
  it('stays visible during restoration and fades after a restored session', () => {
    const hook = renderHook((props: { status: string }) => useNativeSplash(props.status), {
      initialProps: { status: 'BOOTSTRAPPING' },
    });
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    hook.rerender({ status: 'SIGNED_IN' });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
  it.each(['SIGNED_OUT', 'TRANSIENT_ERROR'])(
    'also releases it once restoration resolves as %s',
    (status) => {
      renderHook(() => useNativeSplash(status));
      expect(SplashScreen.hideAsync).toHaveBeenCalled();
    },
  );
});

describe('Native splash first data (#536)', () => {
  const hide = SplashScreen.hideAsync as jest.Mock;
  beforeEach(() => { jest.useFakeTimers(); hide.mockClear(); gate.resetFirstData(); });
  afterEach(() => { jest.useRealTimers(); });
  it('with a restored session waits for Inicio\'s first data, then fades once', () => {
    const hook = renderHook((props: { status: string }) => useNativeSplash(props.status, true), { initialProps: { status: 'BOOTSTRAPPING' } });
    hook.rerender({ status: 'SIGNED_IN' });
    act(() => { jest.advanceTimersByTime(gate.FIRST_DATA_HOLD_MS / 2); });
    expect(hide).not.toHaveBeenCalled();
    act(() => { gate.markFirstData(); });
    expect(hide).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(gate.FIRST_DATA_HOLD_MS); });
    expect(hide).toHaveBeenCalledTimes(1);
    const timings = gate.startupTimings();
    expect(timings.firstDataMs).not.toBeNull(); expect(timings.splashHiddenMs).not.toBeNull();
  });
  it('never holds past the limit (slow network, offline, another route)', () => {
    renderHook(() => useNativeSplash('SIGNED_IN', true));
    act(() => { jest.advanceTimersByTime(gate.FIRST_DATA_HOLD_MS - 1); });
    expect(hide).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(hide).toHaveBeenCalledTimes(1);
    expect(gate.FIRST_DATA_HOLD_MS).toBeLessThanOrEqual(1000);
  });
  it('without a session fades as soon as restoration ends, and data that already arrived releases it at once', () => {
    renderHook(() => useNativeSplash('SIGNED_OUT', false));
    expect(hide).toHaveBeenCalledTimes(1);
    hide.mockClear(); gate.markFirstData();
    renderHook(() => useNativeSplash('SIGNED_IN', true));
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
