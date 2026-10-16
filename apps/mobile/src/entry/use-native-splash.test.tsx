import { renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as SplashScreen from 'expo-splash-screen';
import { useNativeSplash } from './use-native-splash';
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
