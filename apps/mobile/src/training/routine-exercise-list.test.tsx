import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import { detailFixture } from '@/api/routine-editor.fixture';
import { RoutineExerciseList } from './routine-exercise-list';
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const items = [detailFixture.items[0]!, { ...detailFixture.items[0]!, routineExerciseId: 'second', exerciseOrder: 2, exercise: { ...detailFixture.items[0]!.exercise, id: 'other', name: 'Fondos' } }];
function setup(disabled = false) {
  const onCommit = jest.fn(), onDragging = jest.fn(), onOpen = jest.fn(), onRemove = jest.fn();
  const view = render(<OwnlevelThemeProvider initialMode="light"><RoutineExerciseList items={items} disabled={disabled} onCommit={onCommit} onDragging={onDragging} onOpen={onOpen} onRemove={onRemove} /></OwnlevelThemeProvider>);
  return { ...view, onCommit, onDragging, onOpen, onRemove };
}
beforeEach(() => { jest.clearAllMocks(); });
describe('routine exercise list', () => {
  it('opens on tap and moves or removes through accessibility actions', () => {
    const view = setup(), row = view.getByRole('button', { name: 'Editar Fondos' });
    fireEvent(row, 'accessibilityTap'); expect(view.onOpen).toHaveBeenCalledWith('second');
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    expect(view.onCommit).toHaveBeenCalledWith(['second', items[0]!.routineExerciseId]);
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } }); expect(view.onRemove).toHaveBeenCalledWith('second');
    expect(view.onDragging).not.toHaveBeenCalled();
  });
  it('ignores moves and removals while disabled', () => {
    const view = setup(true), row = view.getByRole('button', { name: 'Editar Fondos' });
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } });
    expect(view.onCommit).not.toHaveBeenCalled(); expect(view.onRemove).not.toHaveBeenCalled();
  });
});
