import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { OwnlevelThemeProvider } from '@/design-system';
import { DefinitionDragList, dragOrder } from './definition-drag-list';
import { systemDefinitions } from './definitions-fixture.test-helper';
import { homeMetricIcon } from '@/home/home-metric-icons';
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
describe('editorial metric drag and fallback icons', () => {
  it('only drop writes once with the order captured on lift; accessible moves use the same order control', () => {
    const defs = systemDefinitions(),
      drop = jest.fn(),
      move = jest.fn(),
      open = jest.fn();
    const view = render(
      <GestureHandlerRootView>
        <OwnlevelThemeProvider initialMode="light">
          <DefinitionDragList
            definitions={defs}
            disabled={false}
            onDrop={drop}
            onMove={move}
            onOpen={open}
          />
        </OwnlevelThemeProvider>
      </GestureHandlerRootView>,
    );
    defs.forEach((d, i) =>
      fireEvent(view.getByTestId('metric-definition-' + d.id), 'layout', {
        nativeEvent: { layout: { x: 0, y: i * 80, width: 350, height: 80 } },
      }),
    );
    const gesture = getByGestureTestId('metric-drag-' + defs[0].id);
    expect(gesture.config.activateAfterLongPress).toBe(300);
    expect(drop).not.toHaveBeenCalled();
    act(() =>
      fireGestureHandler(gesture, [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: 200 },
        { state: State.END, translationY: 200 },
      ]),
    );
    expect(drop).toHaveBeenCalledTimes(1);
    expect(drop).toHaveBeenCalledWith(
      [defs[1].id, defs[2].id, defs[0].id],
      defs.map((d) => d.id),
    );
    fireEvent(
      view.getByLabelText('Editar ' + defs[1].name),
      'accessibilityAction',
      { nativeEvent: { actionName: 'moveUp' } },
    );
    expect(move).toHaveBeenCalledWith(defs[1].id, -1);
    fireEvent(
      view.getByLabelText('Editar ' + defs[1].name),
      'accessibilityAction',
      { nativeEvent: { actionName: 'moveDown' } },
    );
    expect(move).toHaveBeenCalledWith(defs[1].id, 1);
  });
  it('an unknown key uses the existing system fallback; a custom definition falls back to activity', () => {
    expect(homeMetricIcon('water', 'future-icon')).toBe('water');
    expect(homeMetricIcon(null, 'future-icon')).toBe('activity');
    expect(homeMetricIcon('water', 'book')).toBe('book');
    expect(dragOrder(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });
});
