import { useState } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Keyboard, ScrollView } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { detailFixture } from '@/api/routine-editor.fixture';
import { draftFromTargets, type TargetsDraft } from './routine-editor-model';
import { RoutineTargetsSheet } from './routine-targets-sheet';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('./routine-editor-sheet', () => ({ RoutineEditorSheet: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: ({ children, renderRightActions }: { children: React.ReactNode; renderRightActions: () => React.ReactNode }) => <View>{children}{renderRightActions()}</View> };
});
// Simulate a wheel retaining the draft it was built with before other inputs change.
jest.mock('./routine-rest-picker', () => {
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return { RoutineRestPicker: ({ draft, onChange, disabled }: { draft: TargetsDraft; onChange: (draft: TargetsDraft) => void; disabled: boolean }) => {
    const initialDraft = React.useRef(draft);
    return <Pressable accessibilityRole="button" accessibilityLabel="Rueda de descanso" disabled={disabled}
      onPress={() => onChange({ ...initialDraft.current, restMin: '2:30', restMax: '3:00' })} />;
  } };
});
function setup(dark = false, count = 3) {
  const saved = jest.fn<(draft: TargetsDraft) => void>();
  function Harness() {
    const initial = draftFromTargets(detailFixture.items[0]!.targets);
    const [draft, setDraft] = useState({ ...initial, sets: Array.from({ length: count }, (_, index) => ({ ...initial.sets[0]!, targetReps: String(index + 1) })) });
    return <RoutineTargetsSheet item={detailFixture.items[0]!} draft={draft} dirty pending={false} errors={{}} open onDismissed={() => undefined}
      onChange={setDraft} onSave={() => saved(draft)} onClose={() => undefined} onHistory={() => undefined} />;
  }
  const view = render(<OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}><Harness /></OwnlevelThemeProvider>);
  return { ...view, saved };
}
beforeEach(() => { jest.restoreAllMocks(); });
describe('routine targets interactions', () => {
  it('reveals Notes when the keyboard finishes opening, and leaves other fields alone', async () => {
    let keyboardShown: (() => void) | undefined;
    const remove = jest.fn();
    const addListener = Keyboard.addListener.bind(Keyboard);
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      if (event === 'keyboardDidShow') keyboardShown = listener as () => void;
      const subscription = addListener(event, listener), nativeRemove = subscription.remove.bind(subscription);
      subscription.remove = () => { remove(); nativeRemove(); };
      return subscription;
    });
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);
    const view = setup(); await act(async () => undefined);
    expect(view.UNSAFE_getByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(true);
    fireEvent(view.getByLabelText('Observaciones del ejercicio'), 'focus');
    expect(scrollToEnd).not.toHaveBeenCalled(); act(() => keyboardShown?.());
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
    fireEvent.changeText(view.getByLabelText('Observaciones del ejercicio'), 'Nota visible');
    fireEvent.press(view.getByRole('button', { name: 'Guardar objetivos' }));
    expect(view.saved).toHaveBeenLastCalledWith(expect.objectContaining({ notes: 'Nota visible' }));
    fireEvent(view.getByLabelText('Observaciones del ejercicio'), 'blur');
    act(() => keyboardShown?.()); expect(scrollToEnd).toHaveBeenCalledTimes(1);
    view.unmount(); expect(remove).toHaveBeenCalled();
  });
  it.each([false, true])('prepares the wheel once, hides it when closed, and preserves later edits when choosing rest (dark=%s)', async dark => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const view = setup(dark);
    const wheel = view.getByLabelText('Rueda de descanso', { includeHiddenElements: true });
    expect(view.queryByRole('button', { name: 'Rueda de descanso' })).toBeNull();
    fireEvent.changeText(view.getByLabelText('Serie 2, reps'), '17');
    fireEvent.changeText(view.getByLabelText('Observaciones del ejercicio'), 'Nota nueva');
    fireEvent.press(view.getByRole('button', { name: 'Más peso' }));
    fireEvent.press(view.getByRole('button', { name: 'Cambiar descanso' }));
    expect(dismiss).toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Cambiar descanso' }).props.accessibilityState.expanded).toBe(true);
    expect(view.getByRole('button', { name: 'Rueda de descanso' })).toBe(wheel);
    fireEvent.press(wheel); fireEvent.press(view.getByRole('button', { name: 'Guardar objetivos' }));
    expect(view.saved).toHaveBeenLastCalledWith(expect.objectContaining({ notes: 'Nota nueva', nextAdjustment: 'increase_weight', restMin: '2:30', restMax: '3:00',
      sets: [expect.anything(), expect.objectContaining({ targetReps: '17' }), expect.anything()] }));
    fireEvent.press(view.getByRole('button', { name: 'Cambiar descanso' }));
    expect(view.queryByRole('button', { name: 'Rueda de descanso' })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Cambiar descanso' }));
    expect(view.getByRole('button', { name: 'Rueda de descanso' })).toBe(wheel);
    view.unmount(); dismiss.mockRestore(); await act(async () => undefined);
  });
  it('removes a middle set without replacing the following input and adds a copy of the last set', async () => {
    const view = setup();
    const lastInput = view.getByLabelText('Serie 3, reps');
    fireEvent.press(view.getByRole('button', { name: 'Quitar serie 2' }));
    expect(view.getByLabelText('Serie 2, reps')).toBe(lastInput);
    expect(view.getByLabelText('Serie 2, reps').props.value).toBe('3');
    fireEvent.press(view.getByRole('button', { name: 'Agregar serie' }));
    expect(view.getByLabelText('Serie 3, reps').props.value).toBe('3');
    view.unmount(); await act(async () => undefined);
  });
  it('keeps the last set and disables adding a fifty-first', async () => {
    const one = setup(false, 1); fireEvent.press(one.getByRole('button', { name: 'Quitar serie 1' }));
    expect(one.getByLabelText('Serie 1, reps')).toBeTruthy(); one.unmount();
    const full = setup(false, 50); expect(full.getByRole('button', { name: 'Agregar serie' })).toBeDisabled();
    fireEvent.press(full.getByRole('button', { name: 'Agregar serie' })); expect(full.queryByLabelText('Serie 51, reps')).toBeNull(); full.unmount();
    await act(async () => undefined);
  });
});
