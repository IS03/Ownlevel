import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OwnlevelThemeProvider } from '@/design-system';
import { SessionNextOptions } from './session-next-options.ios';
import type { SessionNextOptionsProps } from './session-next-options.types';

// SwiftUI renders outside the RN tree on device. Model its controlled events,
// including dismissal, without replacing the component under test.
jest.mock('@expo/ui/swift-ui', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Container = ({ children }: { children: ReactNode }) => <View>{children}</View>;
  const Popover = ({ children, isPresented, onIsPresentedChange }: { children: ReactNode; isPresented: boolean; onIsPresentedChange: (open: boolean) => void }) =>
    isPresented ? <View testID="native-next-popover" onAccessibilityEscape={() => onIsPresentedChange(false)}>{children}</View> : null;
  Popover.Trigger = function Trigger() { return null; };
  Popover.Content = Container;
  return {
    Host: Container, VStack: Container, Divider: () => null, Rectangle: () => null,
    Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text>, Popover,
    Toggle: ({ label, children, isOn, onIsOnChange }: { label?: string; children?: ReactNode; isOn: boolean; onIsOnChange: (on: boolean) => void }) =>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: isOn }} onPress={() => onIsOnChange(!isOn)}><Text>{label}</Text>{children}</Pressable>,
  };
});
jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  buttonStyle: () => ({}), buttonBorderShape: () => ({}), disabled: () => ({}), font: () => ({}), foregroundStyle: () => ({}), frame: () => ({}), padding: () => ({}), tint: () => ({}), toggleStyle: () => ({}),
}));

function setup(overrides: Partial<SessionNextOptionsProps> = {}) {
  const props: SessionNextOptionsProps = { open: true, editable: true, name: 'Jalón neutro', decision: 'increase_reps', decisionNote: '',
    applyToRoutine: false, routineLinked: true, onClose: jest.fn(), onDecision: jest.fn(), onApply: jest.fn(), ...overrides };
  const screen = (value: SessionNextOptionsProps) => <OwnlevelThemeProvider initialMode="light"><SessionNextOptions {...value} /></OwnlevelThemeProvider>;
  return { ...render(screen(props)), props, screen };
}
describe('next-session iOS popover', () => {
  it('keeps options controlled and open while toggling, and dismisses on an outside/escape event', () => {
    const view = setup();
    expect(view.getByRole('checkbox', { name: 'Más repeticiones' })).toBeChecked();
    fireEvent.press(view.getByRole('checkbox', { name: 'Más repeticiones' }));
    expect(view.props.onDecision).toHaveBeenCalledWith('increase_reps');
    view.rerender(view.screen({ ...view.props, decision: 'maintain' }));
    expect(view.getByRole('checkbox', { name: 'Más repeticiones' })).not.toBeChecked();
    expect(view.getByTestId('native-next-popover')).toBeTruthy(); expect(view.props.onClose).not.toHaveBeenCalled();
    fireEvent(view.getByTestId('native-next-popover'), 'accessibilityEscape'); expect(view.props.onClose).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Quitar ajuste')).toBeNull();
  });
  it('keeps the result-of-today toggle independent, and only offers it for a linked routine', () => {
    const view = setup();
    fireEvent.press(view.getByText('Tomar resultado de hoy'));
    expect(view.props.onApply).toHaveBeenCalledWith(true); expect(view.props.onDecision).not.toHaveBeenCalled();
    expect(view.props.onClose).not.toHaveBeenCalled();
    view.rerender(view.screen({ ...view.props, routineLinked: false })); expect(view.queryByText('Tomar resultado de hoy')).toBeNull();
  });
  it('preserves an existing custom reminder as a selected option that can be unticked', () => {
    const view = setup({ decision: 'custom', decisionNote: 'Revisar agarre' });
    expect(view.getByRole('checkbox', { name: 'Revisar agarre' })).toBeChecked();
    fireEvent.press(view.getByRole('checkbox', { name: 'Revisar agarre' })); expect(view.props.onDecision).toHaveBeenCalledWith('custom');
  });
});
