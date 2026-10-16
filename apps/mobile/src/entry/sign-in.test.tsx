import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { withSpring, withTiming } from 'react-native-reanimated';
import type { MobileAuthState } from '@/auth/state';
import { authMessages } from '@/auth/errors';
import { OwnlevelThemeProvider } from '@/design-system';
import SignInScreen from '../../app/(auth)/sign-in';
import { EntryTransitionProvider } from './transition';

let mockState: MobileAuthState;
let mockReduced = false;
const mockGoogle = jest.fn<() => Promise<void>>();
const mockRetry = jest.fn<() => Promise<void>>();
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ state: mockState, signInWithGoogle: mockGoogle, retry: mockRetry }) }));
jest.mock('@/design-system/motion', () => ({
  ...jest.requireActual<typeof import('@/design-system/motion')>('@/design-system/motion'),
  useReduceMotion: () => mockReduced,
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));

function EntryHarness({ theme = 'light', routeReady = true }: { theme?: 'light' | 'dark'; routeReady?: boolean }) {
  return <SafeAreaProvider initialMetrics={{ insets: { top: 44, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}>
    <OwnlevelThemeProvider initialMode={theme}><EntryTransitionProvider>
      {mockState.status === 'BOOTSTRAPPING' || !routeReady ? null : mockState.status === 'SIGNED_IN' ? <Text>Inicio real</Text> : <SignInScreen />}
    </EntryTransitionProvider></OwnlevelThemeProvider>
  </SafeAreaProvider>;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockState = { status: 'SIGNED_OUT' };
  mockReduced = false;
  mockGoogle.mockResolvedValue(undefined);
  mockRetry.mockResolvedValue(undefined);
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('EN-C entry presentation', () => {
  it('uses the dark graphite artwork even when the app theme is light', () => {
    const view = render(<EntryHarness />);
    expect(StyleSheet.flatten(view.getByTestId('native-sign-in-screen').props.style).backgroundColor).toBe('#09090B');
    expect(view.getByLabelText('OWNLEVEL')).toBeTruthy();
    expect(view.getAllByRole('button')).toHaveLength(4);
    expect(view.getByText('Al continuar aceptás los Términos y la Política de privacidad.')).toBeTruthy();
    const bars = view.getByTestId('entry-bars', { includeHiddenElements: true });
    expect(bars.props.accessibilityElementsHidden).toBe(true);
    expect(bars.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(bars.children).toHaveLength(7);
  });

  it.each(['Continuar con Apple', 'Continuar con tu mail', 'Usar una passkey'])(
    '%s shows only a brief neutral notice', label => {
      const view = render(<EntryHarness />);
      fireEvent.press(view.getByRole('button', { name: label }));
      expect(view.getByText('Muy pronto vas a poder entrar así.')).toBeTruthy();
      expect(view.getByTestId('entry-notice').props.accessibilityLiveRegion).toBe('polite');
      expect(mockGoogle).not.toHaveBeenCalled();
      expect(mockRetry).not.toHaveBeenCalled();
      act(() => { jest.advanceTimersByTime(3500); });
      expect(view.queryByText('Muy pronto vas a poder entrar así.')).toBeNull();
    },
  );

  it('only Google calls signInWithGoogle and clears the local notice', () => {
    const view = render(<EntryHarness />);
    fireEvent.press(view.getByRole('button', { name: 'Continuar con Apple' }));
    fireEvent.press(view.getByRole('button', { name: 'Continuar con Google' }));
    expect(mockGoogle).toHaveBeenCalledTimes(1);
    expect(mockRetry).not.toHaveBeenCalled();
    expect(view.queryByTestId('entry-notice')).toBeNull();
  });

  it('bootstraps with logo and bars, no controls or loose loading text', () => {
    mockState = { status: 'BOOTSTRAPPING' };
    const view = render(<EntryHarness />);
    expect(view.getByTestId('entry-bootstrap')).toBeTruthy();
    expect(view.getByLabelText('OWNLEVEL')).toBeTruthy();
    expect(view.getByTestId('entry-bars', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryAllByRole('button')).toHaveLength(0);
    expect(view.queryByText(/Cargando|Comprobando/)).toBeNull();
    mockState = { status: 'SIGNED_OUT' };
    view.rerender(<EntryHarness />);
    expect(view.queryByTestId('entry-bootstrap')).toBeNull();
    expect(view.getAllByRole('button')).toHaveLength(4);
  });

  it('dims and disables controls while the Google button keeps its native indicator', () => {
    mockState = { status: 'SIGNING_IN' };
    const view = render(<EntryHarness />);
    expect(view.getByTestId('entry-google-indicator')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Continuar con Google' }).props.accessibilityState).toEqual({ disabled: true, busy: true });
    for (const button of view.getAllByRole('button')) {
      expect(button.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(button);
    }
    expect(mockGoogle).not.toHaveBeenCalled();
    expect(view.queryByTestId('entry-notice')).toBeNull();
  });

  it('keeps the artwork visible between bootstrap completing and the sign-in route mounting', () => {
    mockState = { status: 'BOOTSTRAPPING' };
    const view = render(<EntryHarness routeReady={false} />);
    mockState = { status: 'SIGNED_OUT' };
    view.rerender(<EntryHarness routeReady={false} />);
    expect(view.getByTestId('entry-bootstrap')).toBeTruthy();
    expect(view.getByLabelText('OWNLEVEL')).toBeTruthy();
    view.rerender(<EntryHarness />);
    expect(view.queryByTestId('entry-bootstrap')).toBeNull();
    expect(view.getAllByRole('button')).toHaveLength(4);
  });

  it('retains the signed-out service notice but keeps deliberate cancellation silent', () => {
    mockState = { status: 'SIGNED_OUT', notice: 'No pudimos completar el ingreso.' };
    const view = render(<EntryHarness />);
    expect(view.getByText('No pudimos completar el ingreso.')).toBeTruthy();
    mockState = { status: 'SIGNING_IN' };
    view.rerender(<EntryHarness />);
    mockState = { status: 'SIGNED_OUT', notice: authMessages.oauthCancelled };
    view.rerender(<EntryHarness />);
    expect(view.queryByTestId('entry-notice')).toBeNull();
    expect(view.getAllByRole('button')).toHaveLength(4);
    expect(view.queryByTestId('entry-success-transition')).toBeNull();
  });

  it('shows a service failure, restores bars and retries using the existing service', () => {
    mockState = { status: 'SIGNING_IN' };
    const view = render(<EntryHarness />);
    jest.mocked(withTiming).mockClear();
    mockState = { status: 'TRANSIENT_ERROR', message: authMessages.signInFailed, session: null };
    view.rerender(<EntryHarness />);
    expect(view.getByText(authMessages.signInFailed)).toBeTruthy();
    expect(withTiming).toHaveBeenCalledWith(0, { duration: 300 });
    expect(view.queryByTestId('entry-google-indicator')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(mockGoogle).not.toHaveBeenCalled();
    mockState = { status: 'BOOTSTRAPPING' };
    view.rerender(<EntryHarness />);
    expect(view.getByTestId('entry-bootstrap')).toBeTruthy();
    expect(view.queryAllByRole('button')).toHaveLength(0);
  });

  it.each([authMessages.configurationMissing, authMessages.callbackInvalid])('keeps technical diagnostics out of the screen: %s', message => {
    mockState = { status: 'TRANSIENT_ERROR', message, session: null };
    const view = render(<EntryHarness />);
    expect(view.queryByText(message)).toBeNull();
    expect(view.getByTestId('entry-notice')).toBeTruthy();
  });

  it('keeps the confirmation overlay alive after the sign-in route unmounts, then reveals Home', () => {
    mockState = { status: 'SIGNING_IN' };
    const view = render(<EntryHarness />);
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness />);
    expect(view.getByTestId('entry-success-transition')).toBeTruthy();
    // Home has mounted already; only the presentation covers it temporarily.
    expect(view.getByText('Inicio real', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId('entry-google-indicator')).toBeNull();
    act(() => { jest.advanceTimersByTime(900); });
    expect(view.queryByTestId('entry-success-transition')).toBeNull();
    expect(view.getByText('Inicio real')).toBeTruthy();
  });

  it('uses only fades with Reduce Motion, no shine, stair climb or press spring', () => {
    mockReduced = true;
    const view = render(<EntryHarness />);
    expect(view.queryByTestId('entry-wordmark-shine', { includeHiddenElements: true })).toBeNull();
    jest.mocked(withSpring).mockClear();
    fireEvent(view.getByRole('button', { name: 'Continuar con Google' }), 'pressIn');
    expect(withSpring).not.toHaveBeenCalled();
    jest.mocked(withTiming).mockClear();
    mockState = { status: 'SIGNING_IN' };
    view.rerender(<EntryHarness />);
    expect(jest.mocked(withTiming).mock.calls.some(([value]) => value === 7.5)).toBe(false);
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness />);
    expect(view.getByTestId('entry-success-transition')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(500); });
    expect(view.queryByTestId('entry-success-transition')).toBeNull();
    expect(view.getByText('Inicio real')).toBeTruthy();
  });

  it('retires an interrupted confirmation and cancels its pending dismissal before a new attempt', () => {
    mockState = { status: 'SIGNING_IN' };
    const view = render(<EntryHarness />);
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness />);
    act(() => { jest.advanceTimersByTime(200); });
    mockState = { status: 'SIGNED_OUT' };
    view.rerender(<EntryHarness />);
    expect(view.queryByTestId('entry-success-transition')).toBeNull();
    expect(view.getAllByRole('button')).toHaveLength(4);
    mockState = { status: 'SIGNING_IN' };
    view.rerender(<EntryHarness />);
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness />);
    act(() => { jest.advanceTimersByTime(700); });
    expect(view.getByTestId('entry-success-transition')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(200); });
    expect(view.queryByTestId('entry-success-transition')).toBeNull();
  });

  it('never covers Home when the service restores an existing session', () => {
    mockState = { status: 'BOOTSTRAPPING' };
    const view = render(<EntryHarness />);
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness />);
    expect(view.queryByTestId('entry-success-transition')).toBeNull();
    expect(view.getByText('Inicio real')).toBeTruthy();
  });
});
