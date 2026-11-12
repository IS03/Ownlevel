import { useSyncExternalStore } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider, brandTokens } from '@/design-system';
import { BodyController } from './body-controller';
import { BodyEditors } from './body-screen';
import { WEIGHT_FIELD_PADDING, WEIGHT_REFERENCE_TEXT, estimateWeightFieldWidth } from './weight-field-width';
import { TODAY, fakeApi, memoryStorage, ok, repository } from './body-fixture.test-helper';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {} }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ push: jest.fn(), setParams: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }), useFocusEffect: () => undefined }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() }, triggerHaptic: jest.fn() }));

const FONT_SIZE = brandTokens.typeScale.heroNumber.fontSize;
const REAL_REFERENCE_WIDTH = 203; // what iOS lays out for six tabular bold digits at 56 pt (plausible; any number works)
const initialWindow = Dimensions.get('window');
const windowAt = (fontScale: number) => ({ window: { ...initialWindow, fontScale }, screen: { ...initialWindow, fontScale } });
// Jest's default font scale is 2; the width numbers below are at the regular 1.
beforeEach(() => { act(() => Dimensions.set(windowAt(1))); });
afterEach(() => { act(() => Dimensions.set({ window: initialWindow, screen: initialWindow })); });

function Harness({ controller, mode }: { controller: BodyController; mode: 'light' | 'dark' }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode={mode}><BodyEditors state={state} controller={controller} /></OwnlevelThemeProvider></SafeAreaProvider>;
}
async function mount(edit = false, mode: 'light' | 'dark' = 'light', api = fakeApi()) {
  const controller = new BodyController(api, repository(memoryStorage().port), () => 'body:1');
  const view = render(<Harness controller={controller} mode={mode} />);
  await act(async () => { await controller.initialize(); });
  act(() => controller.openWeight(edit ? { date: TODAY, weightKg: 80.5 } : undefined));
  return { view, controller, api };
}
type View = Awaited<ReturnType<typeof mount>>['view'];
const input = (view: View) => view.getByTestId('body-weight-input');
const widthOf = (view: View) => StyleSheet.flatten(input(view).props.style).width as number;
const measure = (view: View) => view.getByTestId('body-weight-measure', { hidden: true });
const measured = (view: View, width: number) => act(() => { fireEvent(measure(view), 'layout', { nativeEvent: { layout: { width, height: 64, x: 0, y: 0 } } }); });
const type = (view: View, text: string) => fireEvent.changeText(input(view), text);

describe('weight field width (#468)', () => {
  it('is identical for every typed value and across a typing sequence (never depends on the draft)', async () => {
    const { view } = await mount();
    measured(view, REAL_REFERENCE_WIDTH);
    const expected = REAL_REFERENCE_WIDTH + WEIGHT_FIELD_PADDING;
    expect(widthOf(view)).toBe(expected);
    for (const value of ['', '6', '62', '62,', '62,7', '62,75', '102,5', '999,99', '']) {
      type(view, value);
      expect(input(view).props.value).toBe(value);
      expect(widthOf(view)).toBe(expected);
    }
  });
  it('the hidden reference always holds the constant widest value and never the typed one', async () => {
    const { view } = await mount();
    for (const value of ['', '6', '62,75']) {
      type(view, value);
      expect(measure(view).props.children).toBe(WEIGHT_REFERENCE_TEXT);
    }
    expect(WEIGHT_REFERENCE_TEXT).toBe('999,99');
  });
  it('is never narrower than the measured six characters, plus room for the caret', async () => {
    const { view } = await mount();
    measured(view, REAL_REFERENCE_WIDTH);
    expect(widthOf(view)).toBeGreaterThanOrEqual(REAL_REFERENCE_WIDTH + WEIGHT_FIELD_PADDING);
    type(view, '999,99');
    expect(widthOf(view)).toBeGreaterThanOrEqual(REAL_REFERENCE_WIDTH);
  });
  it('fast typing in one act, deleting to empty and a pasted long value never resize or crash', async () => {
    const { view, controller } = await mount();
    measured(view, REAL_REFERENCE_WIDTH);
    const before = widthOf(view);
    act(() => { for (const value of ['6', '62', '62,', '62,7', '62,75']) type(view, value); });
    expect(input(view).props.value).toBe('62,75'); expect(widthOf(view)).toBe(before);
    act(() => { for (const value of ['62,7', '62,', '62', '6', '']) type(view, value); });
    expect(input(view).props.value).toBe(''); expect(widthOf(view)).toBe(before);
    type(view, '123456,7890');
    expect(input(view).props.value).toBe('123456,7890'); expect(widthOf(view)).toBe(before);
    expect(controller.getSnapshot().editor?.draft).toMatchObject({ weight: '123456,7890' });
  });
  it('does not control the selection or cursor', async () => {
    const { view } = await mount();
    expect(input(view).props.selection).toBeUndefined();
    type(view, '62,75');
    expect(input(view).props.selection).toBeUndefined();
  });
  it('first frame: before any layout it already has the six-character estimate; then it uses the measurement', async () => {
    const { view } = await mount();
    const fontScale = Dimensions.get('window').fontScale;
    const estimate = estimateWeightFieldWidth(FONT_SIZE, fontScale);
    expect(widthOf(view)).toBe(estimate);
    // Six characters at the generous per-glyph bound, so even the widest valid value fits on frame zero.
    expect(estimate).toBeGreaterThanOrEqual(Math.ceil(5 * 0.62 * FONT_SIZE * fontScale + 0.28 * FONT_SIZE * fontScale));
    type(view, '999,99');
    expect(widthOf(view)).toBe(estimate);
    measured(view, REAL_REFERENCE_WIDTH);
    expect(widthOf(view)).toBe(REAL_REFERENCE_WIDTH + WEIGHT_FIELD_PADDING);
  });
  it('ignores a zero-width measurement', async () => {
    const { view } = await mount();
    const estimate = widthOf(view);
    measured(view, 0);
    expect(widthOf(view)).toBe(estimate);
  });
  it('scales with Dynamic Type: a font scale change falls back to the estimate until the new measurement arrives', async () => {
    const { view } = await mount();
    measured(view, REAL_REFERENCE_WIDTH);
    const base = widthOf(view);
    act(() => Dimensions.set(windowAt(1.5)));
    // The old measurement belongs to another scale: never used with the new font, not even for one frame.
    expect(widthOf(view)).toBe(estimateWeightFieldWidth(FONT_SIZE, 1.5));
    expect(widthOf(view)).toBeGreaterThan(base);
    measured(view, REAL_REFERENCE_WIDTH * 1.5);
    expect(widthOf(view)).toBe(REAL_REFERENCE_WIDTH * 1.5 + WEIGHT_FIELD_PADDING);
    expect(widthOf(view)).toBeGreaterThan(base);
  });
  it('can shrink (never the unit) so huge text scrolls inside the field instead of overflowing the sheet', async () => {
    const { view } = await mount();
    expect(StyleSheet.flatten(input(view).props.style)).toMatchObject({ flexShrink: 1, minWidth: 0, textAlign: 'center', fontVariant: ['tabular-nums'], fontSize: FONT_SIZE, fontWeight: '700' });
    expect(StyleSheet.flatten(view.getByText('kg').props.style)).toMatchObject({ flexShrink: 0 });
  });
  it('the hidden reference can never be wider than the row, so it cannot make the sheet scroll sideways', async () => {
    const { view } = await mount();
    const host = StyleSheet.flatten(view.getByTestId('body-weight-measure-host', { hidden: true }).props.style);
    // Bounded by the row (left and right), never a fixed width: a wider absolute child would grow the ScrollView's content width on Fabric.
    expect(host).toMatchObject({ position: 'absolute', left: 0, right: 0 });
    expect(host.width).toBeUndefined();
    const reference = measure(view);
    expect(reference.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(reference.props.style)).toMatchObject({ flexShrink: 1 });
  });

  it('light and dark render the same width', async () => {
    const light = await mount(false, 'light'); measured(light.view, REAL_REFERENCE_WIDTH);
    const dark = await mount(false, 'dark'); measured(dark.view, REAL_REFERENCE_WIDTH);
    expect(widthOf(dark.view)).toBe(widthOf(light.view));
  });
  it('the reference uses the same font as the field and is hidden from VoiceOver', async () => {
    const { view } = await mount();
    const style = StyleSheet.flatten(measure(view).props.style);
    expect(style).toMatchObject({ fontSize: FONT_SIZE, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0 });
    expect(measure(view).props['aria-hidden']).toBe(true);
    expect(measure(view).props.importantForAccessibility).toBe('no-hide-descendants');
    expect(measure(view).props.accessibilityElementsHidden).toBe(true);
    expect(view.queryByText(WEIGHT_REFERENCE_TEXT)).toBeNull(); // not reachable as accessible content
    expect(view.getByLabelText('Peso')).toBe(input(view));
    expect(view.getByText('kg')).toBeTruthy();
  });
});

describe('weight editor behavior is unchanged', () => {
  it('create: no delete link, label, decimal keypad, native focus on iOS, placeholder is the last known weight', async () => {
    const { view } = await mount(false);
    expect(view.getByText('Registrar peso')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Eliminar peso' })).toBeNull();
    expect(input(view).props).toMatchObject({ accessibilityLabel: 'Peso', keyboardType: 'decimal-pad', editable: true, autoFocus: false, placeholder: '80,5' });
  });
  it('edit: shows the delete link; the edited value enables and sends the save', async () => {
    const { view, api } = await mount(true);
    expect(view.getByText('Editar peso')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Eliminar peso' })).toBeTruthy();
    api.weight.mockResolvedValue(ok({ status: 'confirmed', operation: 'set', date: TODAY, weightKg: 62.75, current: { date: TODAY, weightKg: 62.75 }, profileWeightKg: 62.75, currentWeightChanged: true }));
    type(view, '62,75');
    expect(view.getByRole('button', { name: 'Guardar' })).toBeEnabled();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar' })); });
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(api.weight).toHaveBeenCalledWith(expect.objectContaining({ operation: 'set', date: TODAY, weightKg: 62.75 }));
  });
  it('the field is disabled while a write is in flight', async () => {
    const { view, api } = await mount(true);
    api.weight.mockImplementation(() => new Promise(() => undefined));
    type(view, '79');
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar' })); });
    expect(input(view).props.editable).toBe(false);
  });
});
