import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import { SessionNextOptions } from './session-next-options.ios';
import type { SessionNextOptionsProps } from './session-next-options.types';

// Exercise the real React/native boundary. Native lifecycle and touch delivery need simulator QA.
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: () => View };
});
function setup() {
  const props: SessionNextOptionsProps = { open: true, toggleRequest: 1, editable: true, name: 'EJEMPLO', decision: 'increase_reps', decisionNote: '',
    applyToRoutine: false, routineLinked: true, onOpen: jest.fn(), onClose: jest.fn(), onDecision: jest.fn(), onApply: jest.fn() };
  const screen = (value: SessionNextOptionsProps) => <OwnlevelThemeProvider initialMode="light"><SessionNextOptions {...value} /></OwnlevelThemeProvider>;
  return { ...render(screen(props)), props, screen };
}
const native = (view: ReturnType<typeof setup>) => view.UNSAFE_getByProps({ pointerEvents: 'none', toggleRequest: view.props.toggleRequest });
describe('next-session native boundary', () => {
  it('sends a fresh request after an outside dismissal without echoing React open state', () => {
    const view = setup();
    expect(native(view).props).not.toHaveProperty('open');
    fireEvent(native(view), 'presentationChange', { nativeEvent: { presented: false } });
    expect(view.props.onClose).toHaveBeenCalledTimes(1);
    view.rerender(view.screen({ ...view.props, open: false }));
    expect(native(view).props.toggleRequest).toBe(1);
    view.props.toggleRequest = 2;
    view.rerender(view.screen({ ...view.props, open: true }));
    expect(native(view).props.toggleRequest).toBe(2);
    fireEvent(native(view), 'presentationChange', { nativeEvent: { presented: true } });
    expect(view.props.onOpen).toHaveBeenCalledTimes(1);
    expect(view.props.onDecision).not.toHaveBeenCalled();
    expect(view.queryByText('Cerrar')).toBeNull();
  });
  it('does not replay an old request when a collapsed card remounts closed', () => {
    const view = render(<OwnlevelThemeProvider initialMode="light"><SessionNextOptions open={false} toggleRequest={8} editable name="EJEMPLO" decision="maintain" decisionNote="" applyToRoutine={false} routineLinked onClose={() => {}} onDecision={() => {}} onApply={() => {}} /></OwnlevelThemeProvider>);
    expect(view.UNSAFE_getByProps({ pointerEvents: 'none' }).props.toggleRequest).toBe(0);
  });
  it('keeps decisions and result-of-today independent and waits for native dismissal', () => {
    const view = setup();
    fireEvent(native(view), 'decision', { nativeEvent: { decision: 'increase_weight' } });
    expect(view.props.onDecision).toHaveBeenCalledWith('increase_weight');
    expect(view.props.onApply).not.toHaveBeenCalled();
    expect(view.props.onClose).not.toHaveBeenCalled();
    fireEvent(native(view), 'apply', { nativeEvent: { value: true } });
    expect(view.props.onApply).toHaveBeenCalledWith(true);
    expect(native(view).props.applyLabel).toBe('Tomar resultado de hoy');
    view.rerender(view.screen({ ...view.props, routineLinked: false, addToRoutineName: 'PUSH' }));
    expect(native(view).props.applyLabel).toBe('Sumar a PUSH');
    view.rerender(view.screen({ ...view.props, routineLinked: false }));
    expect(native(view).props.applyLabel).toBeNull();
  });
});
