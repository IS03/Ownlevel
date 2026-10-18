import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Keyboard, Modal } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { OwnlevelThemeProvider } from '@/design-system';
import { stagesFixture } from './stages-fixture.test-helper';
import { stageDraft } from './stages-model';
import { PlanWeek } from './plan-week';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/design-system/motion', () => ({ ...jest.requireActual<object>('@/design-system/motion'), useReduceMotion: () => false }));
describe('Day editor native dismissal boundary', () => {
  it('dismisses keyboard at close, keeps content until native dismissal and never applies on cancel', () => {
    const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const change = jest.fn();
    const list = stagesFixture();
    const view = render(<OwnlevelThemeProvider initialMode="light"><PlanWeek stage={stageDraft(list)} today={5} same={false} disabled={false} onChange={change} /></OwnlevelThemeProvider>);
    fireEvent.press(view.getByLabelText(/Lunes:/));
    const modal = view.UNSAFE_getByType(Modal);
    fireEvent(view.getByTestId('stage-day-sheet'), 'layout', { nativeEvent: { layout: { height: 600 } } });
    fireEvent(modal, 'show');
    jest.mocked(withTiming).mockImplementationOnce((to, _config, callback) => {
      callback?.(true);
      return to as never;
    }).mockImplementationOnce((to, _config, callback) => {
      callback?.(true);
      return to as never;
    });
    fireEvent.press(view.getByLabelText('Cancelar'));
    expect(keyboard).toHaveBeenCalledTimes(1);
    expect(view.UNSAFE_getByType(Modal).props.visible).toBe(false);
    expect(change).not.toHaveBeenCalled();
    act(() => fireEvent(view.UNSAFE_getByType(Modal), 'dismiss'));
    expect(view.queryByTestId('stage-day-sheet', { includeHiddenElements: true })).toBeNull();
    expect(change).not.toHaveBeenCalled();
    keyboard.mockRestore();
  });
});
