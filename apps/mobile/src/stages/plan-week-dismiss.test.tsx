import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { KeyboardSheetMotion } from '@/design-system/keyboard-sheet-motion';
import { OwnlevelThemeProvider } from '@/design-system';
import { stagesFixture } from './stages-fixture.test-helper';
import { stageDraft } from './stages-model';
import { PlanWeek } from './plan-week';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
let mockReduced = false;
jest.mock('@/design-system/motion', () => ({ ...jest.requireActual<object>('@/design-system/motion'), useReduceMotion: () => mockReduced }));
afterEach(() => { jest.restoreAllMocks(); mockReduced = false; });
describe('Day editor native dismissal boundary', () => {
  function open(same = false) {
    const change = jest.fn();
    const visibility = jest.fn();
    const view = render(<SafeAreaInsetsContext.Provider value={{ top: 62, bottom: 34, left: 0, right: 0 }}>
      <OwnlevelThemeProvider initialMode="light"><PlanWeek stage={stageDraft(stagesFixture())} today={5} same={same} disabled={false} onChange={change} onSheetVisibilityChange={visibility} /></OwnlevelThemeProvider>
    </SafeAreaInsetsContext.Provider>);
    fireEvent.press(view.getByLabelText(same ? 'Ajustar todos los días' : /Lunes:/));
    fireEvent(view.getByTestId('stage-day-sheet'), 'layout', { nativeEvent: { layout: { height: 600 } } });
    fireEvent(view.UNSAFE_getByType(Modal), 'show');
    return { view, change, visibility };
  }
  it('lets UIKit own focus, viewport and exit, and never applies on cancel', () => {
    const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { view, change, visibility } = open();
    expect(visibility).toHaveBeenLastCalledWith(true);
    expect(view.getByLabelText('Calorías (kcal)').props.autoFocus).toBe(false);
    expect(view.UNSAFE_getByType(KeyboardAvoidingView).props.enabled).toBe(false);
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props).toMatchObject({ boundedViewport: true, topInset: 78, bottomInset: 0, presented: true });
    expect(view.getByTestId('stage-day-scroll').props).toMatchObject({ automaticallyAdjustKeyboardInsets: false, keyboardShouldPersistTaps: 'always' });
    expect(view.UNSAFE_getAllByType(ScrollView).some(scroll => scroll.findAllByProps({ testID: 'stage-day-header' }).length)).toBe(false);
    fireEvent.changeText(view.getByLabelText('Calorías (kcal)'), '2400');
    fireEvent.press(view.getByLabelText('Cancelar'));
    expect(keyboard).not.toHaveBeenCalled();
    expect(view.UNSAFE_getByType(Modal).props.visible).toBe(true);
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props.closing).toBe(true);
    act(() => view.UNSAFE_getByType(KeyboardSheetMotion).props.onClosed());
    expect(visibility).toHaveBeenLastCalledWith(true);
    expect(view.UNSAFE_getByType(Modal).props.visible).toBe(false);
    expect(change).not.toHaveBeenCalled();
    act(() => fireEvent(view.UNSAFE_getByType(Modal), 'dismiss'));
    expect(visibility).toHaveBeenLastCalledWith(false);
    expect(view.queryByTestId('stage-day-sheet', { includeHiddenElements: true })).toBeNull();
    expect(change).not.toHaveBeenCalled();
    keyboard.mockRestore();
  });
  it.each([false, true])('applies only locally, once native close and Modal dismissal finish (all days=%s)', same => {
    const { view, change } = open(same);
    fireEvent.changeText(view.getByLabelText('Calorías (kcal)'), '2400');
    fireEvent.changeText(view.getByLabelText('Proteína (g)'), '145,5');
    if (!same) fireEvent.press(view.getByLabelText('Aplicar a domingo'));
    fireEvent.press(view.getByLabelText('Listo'));
    expect(change).not.toHaveBeenCalled();
    act(() => view.UNSAFE_getByType(KeyboardSheetMotion).props.onClosed());
    expect(change).not.toHaveBeenCalled();
    fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
    expect(change).toHaveBeenCalledTimes(1);
    const result = change.mock.calls[0][0] as ReturnType<typeof stageDraft>;
    const changed = same ? [1, 2, 3, 4, 5, 6, 7] : [1, 7];
    expect(result.weekdays.filter(day => day.kcal === '2400').map(day => day.weekday)).toEqual(changed);
    expect(result.weekdays.filter(day => changed.includes(day.weekday)).every(day => day.protein === '145,5')).toBe(true);
  });
  it('reveals the focused field inside the bounded scroll without moving the pinned controls', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    const { view } = open();
    const protein = view.getByLabelText('Proteína (g)');
    // Measure the same wrappers used by the form, without keyboard-height listeners.
    fireEvent(view.getByTestId('stage-day-fields'), 'layout', { nativeEvent: { layout: { y: 16 } } });
    fireEvent(view.getByTestId('stage-day-protein-container'), 'layout', { nativeEvent: { layout: { y: 180 } } });
    fireEvent(protein, 'focus');
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 180, animated: false });
    fireEvent(view.getByTestId('stage-day-scroll'), 'layout', { nativeEvent: { layout: { height: 250 } } });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 180, animated: false });
  });
  it('passes Reduce Motion to the native coordinator without turning on JS avoidance', () => {
    mockReduced = true;
    const { view } = open(true);
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props.reduceMotion).toBe(true);
    expect(view.UNSAFE_getByType(KeyboardAvoidingView).props.enabled).toBe(false);
  });
  it('keeps Android on its own keyboard avoidance, without the iOS coordinator', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { view } = open();
    expect(view.UNSAFE_queryByType(KeyboardSheetMotion)).toBeNull();
    expect(view.UNSAFE_getByType(KeyboardAvoidingView).props).toMatchObject({ enabled: true, behavior: 'height' });
    expect(view.getByLabelText('Calorías (kcal)').props.autoFocus).toBe(true);
  });
});
