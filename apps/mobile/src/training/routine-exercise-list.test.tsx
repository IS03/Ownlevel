import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DeviceEventEmitter } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { OwnlevelThemeProvider } from '@/design-system';
import { detailFixture } from '@/api/routine-editor.fixture';
import { RoutineExerciseList } from './routine-exercise-list';
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
const items = [detailFixture.items[0]!, { ...detailFixture.items[0]!, routineExerciseId: 'second', exerciseOrder: 2, exercise: { ...detailFixture.items[0]!.exercise, id: 'other', name: 'Fondos' } }];
function setup() {
  const onCommit = jest.fn(), onDragging = jest.fn(), onOpen = jest.fn();
  const props = { items, disabled: false, onCommit, onDragging, onOpen, onRemove: jest.fn(), scrollAtEdge: () => 0 };
  const view = render(<OwnlevelThemeProvider initialMode="light"><RoutineExerciseList {...props} /></OwnlevelThemeProvider>);
  return { ...view, onCommit, onDragging, onOpen, props };
}
beforeEach(() => { jest.clearAllMocks(); });
describe('routine exercise drag', () => {
  it('keeps the active gesture mounted through renders and commits once only on successful release', () => {
    const view = setup(), id = items[1]!.routineExerciseId;
    const key = `exercise-drag-${id}`, gesture = getByGestureTestId(key);
    const send = (state: number, oldState: number | undefined, dy: number) => DeviceEventEmitter.emit(oldState === undefined ? 'onGestureHandlerEvent' : 'onGestureHandlerStateChange', {
      handlerTag: getByGestureTestId(key).handlerTag, state, ...(oldState === undefined ? {} : { oldState }), translationY: dy, translationX: 0, absoluteY: 250 + dy,
      absoluteX: 100, x: 20, y: 20, velocityX: 0, velocityY: 0, numberOfPointers: 1,
    });
    act(() => send(State.BEGAN, State.UNDETERMINED, 0)); act(() => send(State.ACTIVE, State.BEGAN, 0));
    expect(view.onDragging).toHaveBeenCalledWith(true); expect(view.onCommit).not.toHaveBeenCalled();
    view.rerender(<OwnlevelThemeProvider initialMode="light"><RoutineExerciseList {...view.props} /></OwnlevelThemeProvider>);
    act(() => send(State.ACTIVE, undefined, -120));
    expect(getByGestureTestId(key)).toBe(gesture);
    expect(view.onCommit).not.toHaveBeenCalled(); act(() => send(State.END, State.ACTIVE, -120));
    expect(view.onCommit).toHaveBeenCalledTimes(1); expect(view.onCommit).toHaveBeenCalledWith([id, items[0]!.routineExerciseId]);
    expect(view.onDragging).toHaveBeenLastCalledWith(false); expect(view.onOpen).not.toHaveBeenCalled();
  });
  it('cancels drag without writing and keeps accessible moves available', () => {
    const view = setup(), id = items[1]!.routineExerciseId;
    act(() => fireGestureHandler(getByGestureTestId(`exercise-drag-${id}`), [{ state: State.BEGAN, absoluteY: 250 }, { state: State.ACTIVE, absoluteY: 250, translationY: 0 }, { state: State.ACTIVE, absoluteY: 130, translationY: -120 }, { state: State.CANCELLED }]));
    expect(view.onCommit).not.toHaveBeenCalled();
    fireEvent(view.getByRole('button', { name: 'Editar Fondos' }), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    expect(view.onCommit).toHaveBeenCalledWith([id, items[0]!.routineExerciseId]);
  });
});
