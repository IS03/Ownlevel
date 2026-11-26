import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { withSpring, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import Svg from 'react-native-svg';
import type { MobileAuthState } from '@/auth/state';
import { authMessages } from '@/auth/errors';
import { OwnlevelThemeProvider } from '@/design-system';
import SignInScreen from '../../app/(auth)/sign-in';
import { EntryTransitionProvider, useEntryMotion, useStartupHomePending } from './transition';
import { ENTRY_BAR_BLEED, ENTRY_FADE_MS, ENTRY_SPREAD_MS, ENTRY_STAIRS_MS, ENTRY_SUCCESS_MS, entryBarFrame } from './motion-model';
import { FIRST_DATA_HOLD_MS } from './first-data';
import { prepareHome } from '@/home/shared-home-read';
import type { MobileApiClient } from '@/api/client';
import * as WebBrowser from 'expo-web-browser';

let mockState: MobileAuthState;
let mockReduced = false;
let observedMotion: ReturnType<typeof useEntryMotion>;
function ObserveMotion() { const motion = useEntryMotion(); useEffect(() => { observedMotion = motion; }, [motion]); return null; }
const mockGoogle = jest.fn<() => Promise<void>>();
const mockRetry = jest.fn<() => Promise<void>>();
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => undefined) }));
jest.mock('@/home/shared-home-read', () => ({ prepareHome: jest.fn() }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ state: mockState, signInWithGoogle: mockGoogle, retry: mockRetry }) }));
jest.mock('@/design-system/motion', () => ({
  ...jest.requireActual<typeof import('@/design-system/motion')>('@/design-system/motion'),
  useReduceMotion: () => mockReduced,
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })), WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' } }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));

function StartupHome() {
  return useStartupHomePending() ? null : <Text>Inicio real</Text>;
}
const startupClient = {} as MobileApiClient;
function EntryHarness({ theme = 'light', routeReady = true, client }: { theme?: 'light' | 'dark'; routeReady?: boolean; client?: MobileApiClient }) {
  return <SafeAreaProvider initialMetrics={{ insets: { top: 44, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}>
    <OwnlevelThemeProvider initialMode={theme}><EntryTransitionProvider client={client}>
      <ObserveMotion />
      {mockState.status === 'BOOTSTRAPPING' || !routeReady ? null : mockState.status === 'SIGNED_IN' ? <StartupHome /> : <SignInScreen />}
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
    expect(view.getByTestId('entry-wordmark', { includeHiddenElements: true }).children).toHaveLength(8);
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
  it('keeps only a six-point lift for the entire Google wait, and starts the big rise only after confirmation', () => {
    mockState = { status: 'SIGNING_IN' };
    const view = render(<EntryHarness />);
    expect(observedMotion.level.value).toBe(1);
    expect(observedMotion.arrival.value).toBe(0);
    expect(observedMotion.spread.value).toBe(0);
    act(() => { jest.advanceTimersByTime(60000); });
    expect(observedMotion.arrival.value).toBe(0);
    expect(observedMotion.spread.value).toBe(0);
    expect(view.getByTestId('entry-google-indicator')).toBeTruthy();
    jest.mocked(withTiming).mockClear();
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness />);
    expect(observedMotion.arrival.value).toBe(1);
    expect(jest.mocked(withTiming).mock.calls.some(([, config]) => config?.duration === ENTRY_STAIRS_MS)).toBe(true);
  });
  it('uses tall, fixed-size SVG fills and closes the gaps with the bars themselves, without a separate cover', () => {
    mockState = { status: 'SIGNING_IN' };
    const view = render(<EntryHarness />);
    const before = StyleSheet.flatten(view.getByTestId('entry-bar-0', { includeHiddenElements: true }).props.style);
    const fill = view.getByTestId('entry-bar-0', { includeHiddenElements: true }).findByType(Svg);
    expect(fill.props.height).toBe(Math.ceil(before.height));
    expect(fill.props.width).toBe(Math.ceil(before.width));
    expect(before.height).toBeGreaterThan(ENTRY_BAR_BLEED);
    jest.mocked(withTiming).mockClear();
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness />);
    const after = StyleSheet.flatten(view.getByTestId('entry-bar-0', { includeHiddenElements: true }).props.style);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(view.queryByTestId('entry-cover', { includeHiddenElements: true })).toBeNull();
    expect(after.transform[1].scaleX).toBeGreaterThan(1);
    expect(jest.mocked(withTiming).mock.calls.some(([, config]) => config?.duration === ENTRY_SPREAD_MS)).toBe(true);
    expect(view.queryByTestId('entry-watermark', { includeHiddenElements: true })).toBeNull();
    expect(view.queryByTestId('entry-logo-watermark', { includeHiddenElements: true })).toBeNull();
    for (let i = 0; i < 7; i++) {
      const waiting = entryBarFrame(i, 390, 844, 1, 0);
      const entering = entryBarFrame(i, 390, 844, 1, 0.5);
      expect(entering.left).toBe(waiting.left);
      expect(entering.width).toBe(waiting.width);
    }
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
    act(() => { jest.advanceTimersByTime(ENTRY_SUCCESS_MS); });
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
    expect(jest.mocked(withTiming).mock.calls.some(([, config]) => config?.duration === ENTRY_STAIRS_MS)).toBe(false);
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness />);
    expect(view.getByTestId('entry-success-transition')).toBeTruthy();
    expect(view.queryByTestId('entry-watermark', { includeHiddenElements: true })).toBeNull();
    act(() => { jest.advanceTimersByTime(ENTRY_FADE_MS); });
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
    act(() => { jest.advanceTimersByTime(ENTRY_SUCCESS_MS - 1); });
    expect(view.getByTestId('entry-success-transition')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(1); });
    expect(view.queryByTestId('entry-success-transition')).toBeNull();
  });

  it('starts loading before Home mounts and reveals it after the priority reads settle', async () => {
    let resolve!: (value: [void, void]) => void;
    jest.mocked(prepareHome).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    mockState = { status: 'BOOTSTRAPPING' };
    const view = render(<EntryHarness client={startupClient} />);
    fireEvent(view.getByTestId('entry-bootstrap'), 'layout');
    expect(prepareHome).not.toHaveBeenCalled();
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness client={startupClient} />);
    expect(prepareHome).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Inicio real', { includeHiddenElements: true })).toBeNull();
    await act(async () => resolve([undefined, undefined]));
    expect(view.getByTestId('entry-success-transition')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(ENTRY_SUCCESS_MS); });
    expect(view.getByText('Inicio real')).toBeTruthy();
  });
  it('mounts Home at the deadline even when the two priority reads are still pending', () => {
    jest.mocked(prepareHome).mockReturnValueOnce(new Promise(() => {}));
    mockState = { status: 'BOOTSTRAPPING' };
    const view = render(<EntryHarness client={startupClient} />);
    fireEvent(view.getByTestId('entry-bootstrap'), 'layout');
    mockState = { status: 'SIGNED_IN', session: {} as never };
    view.rerender(<EntryHarness client={startupClient} />);
    act(() => { jest.advanceTimersByTime(FIRST_DATA_HOLD_MS - ENTRY_FADE_MS - 1); });
    expect(view.queryByText('Inicio real', { includeHiddenElements: true })).toBeNull();
    act(() => { jest.advanceTimersByTime(1); });
    expect(view.getByText('Inicio real', { includeHiddenElements: true })).toBeTruthy();
    act(() => { jest.advanceTimersByTime(ENTRY_FADE_MS); });
    expect(view.queryByTestId('entry-success-transition')).toBeNull();
  });
  it('opens the Terms and the Privacy Policy from the legal line', () => {
    const view = render(<EntryHarness />);
    fireEvent.press(view.getByText('Términos'));
    fireEvent.press(view.getByText('Política de privacidad'));
    expect(jest.mocked(WebBrowser.openBrowserAsync).mock.calls.map(([url]) => url)).toEqual([
      'https://www.ownlevel.fit/terminos', 'https://www.ownlevel.fit/privacidad',
    ]);
  });
});
