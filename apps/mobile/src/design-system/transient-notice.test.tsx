import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as RN from 'react-native';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Dimensions, KeyboardAvoidingView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { OwnlevelThemeProvider } from './theme';
import { layout } from './brand';
import { spacing } from './tokens';
import { NoticeStack, TransientNotice } from './transient-notice';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
// The real useWindowDimensions reads Dimensions, so a width/font scale is set there before rendering.
const atWindow = (width: number, fontScale = 1) => Dimensions.set({ window: { ...original.window, width, fontScale }, screen: original.screen });
beforeEach(() => { atWindow(320); });
afterEach(() => { jest.restoreAllMocks(); Dimensions.set(original); });

const tree = (children: React.ReactNode, bottom = 34, mode: 'light' | 'dark' = 'light') => <GestureHandlerRootView>
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 44, bottom, left: 0, right: 0 } }}>
    <OwnlevelThemeProvider initialMode={mode}>{children}</OwnlevelThemeProvider></SafeAreaProvider></GestureHandlerRootView>;
const show = (props: Partial<ComponentProps<typeof TransientNotice>> = {}, bottom = 34, mode: 'light' | 'dark' = 'light') =>
  render(tree(<TransientNotice testID="notice" message="Agua: 0,5 L" {...props} />, bottom, mode));
const swipe = (translationY: number, translationX = 0, id = 'transient-notice-dismiss') => act(() => fireGestureHandler(getByGestureTestId(id), [
  { state: State.BEGAN, translationX: 0, translationY: 0 }, { state: State.ACTIVE, translationX, translationY }, { state: State.END, translationX, translationY }]));
const bottomOf = (view: ReturnType<typeof show>, id = 'notice') => StyleSheet.flatten(view.getByTestId(id).props.style).bottom as number;

describe('#511 horizontal margins', () => {
  const surface = (view: ReturnType<typeof show>) => StyleSheet.flatten(view.getByTestId('notice-surface').props.style);
  it('a notice with no action gets the same right margin as left, so the last word never touches the edge', () => {
    const style = surface(show({ message: 'Agua: 2 L · deshecho' }));
    expect(style.paddingRight).toBe(style.paddingLeft); expect(style.paddingLeft).toBe(spacing.md);
  });
  it('a pending notice has no actions either: symmetric margins', () => {
    const style = surface(show({ state: 'pending', message: 'Deshaciendo…' }));
    expect(style.paddingRight).toBe(style.paddingLeft);
  });
  it('with actions the right edge is carried by the action padding, as before', () => {
    const style = surface(show({ action: { label: 'Deshacer', accessibilityLabel: 'Deshacer algo', onPress: jest.fn() } }));
    expect(style.paddingRight).toBe(spacing.xs);
  });
});

describe('layout and material', () => {
  it.each(['light', 'dark'] as const)('is a compact centred capsule bounded by the screen, with a hairline border and no full-width dock (%s)', mode => {
    const view = show({}, 34, mode);
    expect(StyleSheet.flatten(view.getByTestId('notice').props.style)).toMatchObject({ position: 'absolute', alignItems: 'center', left: layout.tabBarInset, right: layout.tabBarInset });
    const capsule = StyleSheet.flatten(view.getByTestId('notice-capsule').props.style);
    expect(capsule.maxWidth).toBe(320 - 2 * layout.tabBarInset); expect(capsule.width).toBeUndefined(); expect(capsule.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(capsule.borderRadius).toBeGreaterThan(0); expect(capsule.shadowOpacity).toBeUndefined(); expect(capsule.elevation).toBeUndefined();
    view.unmount(); atWindow(1024);
    expect(StyleSheet.flatten(show({}, 34, mode).getByTestId('notice-capsule').props.style).maxWidth).toBe(420);
  });
  it('sits on a fixed backing under the glass so scrolling content never shows through', () => {
    const view = show(); const backing = view.getByTestId('notice-backing', { includeHiddenElements: true });
    expect(backing.props.pointerEvents).toBe('none'); expect(StyleSheet.flatten(backing.props.style)).toMatchObject({ position: 'absolute' });
  });
  it('keeps a long message to two lines on screen while the whole message stays in its accessibility label', () => {
    const long = `${'Press de banca inclinado con mancuernas y agarre neutro '.repeat(4)}agregado`;
    const view = show({ message: long }); const text = view.getByLabelText(long);
    expect(text.props.numberOfLines).toBe(2); expect(text.props.accessibilityLabel).toBe(long);
  });
  it('stacks the action under the message with large text, wrapping instead of truncating', () => {
    const action = { label: 'Deshacer', accessibilityLabel: 'Deshacer algo', onPress: jest.fn() };
    atWindow(320, 1.6); const large = show({ action });
    expect(StyleSheet.flatten(large.getByTestId('notice-surface').props.style).flexDirection).toBe('column');
    const text = large.getByLabelText('Agua: 0,5 L'); expect(text.props.numberOfLines).toBeUndefined(); expect(text.props.allowFontScaling).not.toBe(false);
    expect(large.getByRole('button', { name: 'Deshacer algo' })).toBeTruthy(); large.unmount();
    atWindow(320, 1); const normal = show({ action });
    expect(StyleSheet.flatten(normal.getByTestId('notice-surface').props.style).flexDirection).toBe('row');
  });
  it('keeps pending and confirmed visibly different: a spinner versus a check, and no action while pending', () => {
    const action = { label: 'Deshacer', accessibilityLabel: 'Deshacer algo', onPress: jest.fn() };
    const pending = show({ state: 'pending', action });
    expect(pending.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull(); expect(pending.queryByTestId('notice-icon')).toBeNull(); expect(pending.queryByRole('button')).toBeNull();
    pending.unmount();
    const done = show({ state: 'done', action });
    expect(done.UNSAFE_queryByType(ActivityIndicator)).toBeNull(); expect(done.getByTestId('notice-icon')).toBeTruthy(); expect(done.getByRole('button', { name: 'Deshacer algo' })).toBeTruthy();
  });
});

describe('placement', () => {
  it('screen: above the bottom safe area, plus the host offset; tab: never below the floating tab bar', () => {
    const floor = layout.tabBarHeight + layout.tabBarInset;
    expect(bottomOf(show({ placement: 'screen' }, 34))).toBe(34 + spacing.sm);
    expect(bottomOf(show({ placement: 'screen', bottomOffset: 50 }, 34))).toBe(34 + spacing.sm + 50);
    expect(bottomOf(show({ placement: 'tab' }, 34))).toBe(floor + spacing.sm);
    expect(bottomOf(show({ placement: 'tab' }, 0))).toBe(floor + spacing.sm);
    // Inside a native tab the safe area already counts the bar (and a rest accessory): both placements agree there.
    expect(bottomOf(show({ placement: 'tab' }, 83))).toBe(83 + spacing.sm);
    expect(bottomOf(show({ placement: 'screen' }, 83))).toBe(83 + spacing.sm);
    expect(bottomOf(show({ placement: 'tab' }, 125))).toBe(125 + spacing.sm);
  });
  it('docks absolutely, so a keyboard-avoiding host keeps it above the keyboard', () => {
    const view = render(tree(<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}><TransientNotice testID="notice" message="Agregado" /></KeyboardAvoidingView>));
    expect(StyleSheet.flatten(view.getByTestId('notice').props.style).position).toBe('absolute');
  });
  it('stacks two notices of different kinds in one local column instead of on top of each other', () => {
    const view = render(tree(<NoticeStack testID="stack" placement="tab">
      <TransientNotice testID="first" message="Agua: 0,5 L" state="done" /><TransientNotice testID="second" message="Pasta · 250 kcal" state="done" />
    </NoticeStack>));
    const stack = StyleSheet.flatten(view.getByTestId('stack').props.style);
    expect(stack).toMatchObject({ position: 'absolute', bottom: layout.tabBarHeight + layout.tabBarInset + spacing.sm }); expect(stack.gap).toBeGreaterThan(0);
    for (const id of ['first', 'second']) { const own = StyleSheet.flatten(view.getByTestId(id).props.style); expect(own.position).toBeUndefined(); expect(own.bottom).toBeUndefined(); }
    expect(view.getByLabelText('Agua: 0,5 L')).toBeTruthy(); expect(view.getByLabelText('Pasta · 250 kcal')).toBeTruthy();
  });
});

describe('dismissal', () => {
  it('a long downward swipe calls onDismiss and nothing else, never an action', () => {
    const onDismiss = jest.fn(), onPress = jest.fn(), onSecondary = jest.fn(), onClose = jest.fn();
    show({ onDismiss, action: { label: 'Deshacer', accessibilityLabel: 'Deshacer algo', onPress }, secondaryAction: { label: 'Anterior · 1', accessibilityLabel: 'Anterior', onPress: onSecondary }, close: { label: 'Cerrar', onPress: onClose } });
    swipe(layout.minTouch - 1); expect(onDismiss).not.toHaveBeenCalled();
    swipe(layout.minTouch); expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled(); expect(onSecondary).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });
  it('short, upward and horizontal motions do not dismiss', () => {
    const onDismiss = jest.fn(); show({ onDismiss });
    swipe(12); swipe(-80); swipe(80, 40); swipe(0, 90);
    expect(onDismiss).not.toHaveBeenCalled();
  });
  it('without onDismiss there is no gesture, no VoiceOver action and no escape', () => {
    const view = show({ action: { label: 'Deshacer', accessibilityLabel: 'Deshacer algo', onPress: jest.fn() } });
    expect(() => getByGestureTestId('transient-notice-dismiss')).toThrow();
    const text = view.getByLabelText('Agua: 0,5 L');
    expect(text.props.accessibilityActions).toBeUndefined(); expect(text.props.onAccessibilityEscape).toBeUndefined(); expect(text.props.accessibilityHint).toBeUndefined();
  });
  it('exposes the VoiceOver dismiss action and escape, and both only call onDismiss', () => {
    const onDismiss = jest.fn(), onPress = jest.fn(); const view = show({ onDismiss, dismissLabel: 'Descartar confirmación', action: { label: 'Deshacer', accessibilityLabel: 'Deshacer algo', onPress } });
    const text = view.getByLabelText('Agua: 0,5 L');
    expect(text.props.accessibilityActions).toEqual([{ name: 'dismiss', label: 'Descartar confirmación' }]);
    expect(text.props.accessibilityHint).toContain('Descartar confirmación');
    fireEvent(text, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } }); expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent(text, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }); expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent(text, 'accessibilityEscape'); expect(onDismiss).toHaveBeenCalledTimes(2); expect(onPress).not.toHaveBeenCalled();
  });
  it('disabled is inert: no dismissal by swipe, action or escape', () => {
    const onDismiss = jest.fn(); const view = show({ onDismiss, disabled: true }); const text = view.getByLabelText('Agua: 0,5 L');
    swipe(120); expect(onDismiss).not.toHaveBeenCalled();
    expect(text.props.accessibilityActions).toBeUndefined();
    fireEvent(text, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } }); fireEvent(text, 'accessibilityEscape'); expect(onDismiss).not.toHaveBeenCalled();
  });
  it('pending is never dismissible even if the owner passes onDismiss', () => {
    const onDismiss = jest.fn(); const view = show({ onDismiss, state: 'pending', message: 'Quitando PRESS…' });
    expect(() => getByGestureTestId('transient-notice-dismiss')).toThrow();
    const text = view.getByLabelText('Quitando PRESS…'); expect(text.props.accessibilityActions).toBeUndefined();
    fireEvent(text, 'accessibilityEscape'); expect(onDismiss).not.toHaveBeenCalled();
  });
  it('a disabled action does not fire, and the explicit close button is separate from the swipe', () => {
    const onPress = jest.fn(), onClose = jest.fn(); const view = show({ action: { label: 'Deshacer', accessibilityLabel: 'Deshacer algo', disabled: true, onPress }, close: { label: 'Cerrar aviso', onPress: onClose } });
    fireEvent.press(view.getByRole('button', { name: 'Deshacer algo' })); expect(onPress).not.toHaveBeenCalled();
    expect(() => getByGestureTestId('transient-notice-dismiss')).toThrow();
    fireEvent.press(view.getByRole('button', { name: 'Cerrar aviso' })); expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('accessibility and motion', () => {
  it('announces when asked, again for a new key, and not otherwise', () => {
    const announce = jest.spyOn(RN.AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const view = show({ announce: true, announceKey: 1 });
    expect(announce).toHaveBeenCalledTimes(1); expect(announce).toHaveBeenCalledWith('Agua: 0,5 L');
    view.rerender(tree(<TransientNotice testID="notice" message="Agua: 0,5 L" announce announceKey={2} />)); expect(announce).toHaveBeenCalledTimes(2);
    announce.mockClear(); show({ message: 'Silencioso' }); expect(announce).not.toHaveBeenCalled();
  });
  it('is an alert only when told so, and always a polite live region otherwise', () => {
    const view = show({ alert: true, message: 'No pudimos confirmar' }); expect(view.getByRole('alert')).toBeTruthy(); view.unmount();
    const calm = show(); expect(calm.queryByRole('alert')).toBeNull(); expect(calm.getByLabelText('Agua: 0,5 L').props.accessibilityLiveRegion).toBe('polite');
  });
  it('slides in and out, and with Reduce Motion neither moves nor fades', async () => {
    const motion = show(); expect(motion.getByTestId('notice').props.entering).toBeDefined(); expect(motion.getByTestId('notice').props.exiting).toBeDefined(); motion.unmount();
    jest.spyOn(RN.AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const still = show(); await act(async () => { await Promise.resolve(); });
    expect(still.getByTestId('notice').props.entering).toBeUndefined(); expect(still.getByTestId('notice').props.exiting).toBeUndefined();
  });
});
