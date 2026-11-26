import { act, renderHook } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import * as SplashScreen from 'expo-splash-screen';
import { useNativeSplash } from './use-native-splash';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => undefined) }));

it('reveals the branded React view once it has layout, once per launch', () => {
  const hook = renderHook(({ laidOut }: { laidOut: boolean }) => useNativeSplash(laidOut), { initialProps: { laidOut: false } });
  act(() => hook.result.current());
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  hook.rerender({ laidOut: true });
  act(() => {
    hook.result.current();
    hook.result.current();
  });
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
});
