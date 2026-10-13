import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { RoutineContextMenu } from './routine-context-menu.ios';

// Keep the installed SDK wrappers and modifier event wiring; replace only native views.
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: (_module: string, name: string) =>
    function NativeView({ children, ...props }: { children?: ReactNode }) {
      return <View {...props} testID={`native-${name}`}>{children}</View>;
    },
  };
});

const routine = { id: 'routine', name: 'PUSH', color: null, order: 1, isActive: true, exerciseCount: 8, setCount: 24 };
function menu(dark: boolean, disabled = false, width = 358) {
  const onEdit = jest.fn();
  const onAccessibilityAction = jest.fn();
  const view = render(<OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}>
    <RoutineContextMenu disabled={disabled} width={width} routine={routine} onEdit={onEdit}
      onStart={jest.fn()} onColor={jest.fn()} onDuplicate={jest.fn()} onStatus={jest.fn()}>
      <Pressable testID="hosted-routine-row" accessibilityRole="button" accessibilityLabel="Abrir rutina PUSH"
        accessibilityActions={[{ name: 'edit', label: 'Editar rutina' }]} onAccessibilityAction={onAccessibilityAction}
        disabled={disabled} onPress={onEdit} />
    </RoutineContextMenu>
  </OwnlevelThemeProvider>);
  return { ...view, onEdit, onAccessibilityAction };
}

describe('iOS routine gesture ownership', () => {
  it.each([false, true])('leaves touch recognition to the native menu and tap, preserving accessibility (dark=%s)', dark => {
    const view = menu(dark);
    const row = view.getByTestId('hosted-routine-row');
    expect(row.props.pointerEvents).toBe('none');
    // Releasing the hosted RN press must never navigate behind the native menu.
    fireEvent.press(row);
    expect(view.onEdit).not.toHaveBeenCalled();
    const nativeTap = view.getByTestId('native-GroupView');
    const modifiers = nativeTap.props.modifiers;
    expect(modifiers).toEqual(expect.arrayContaining([expect.objectContaining({ $type: 'contentShape' })]));
    fireEvent(nativeTap, 'globalEvent', { nativeEvent: { onTapGesture: {} } });
    expect(view.onEdit).toHaveBeenCalledTimes(1);
    expect(row.props.accessibilityActions).toEqual([{ name: 'edit', label: 'Editar rutina' }]);
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    expect(view.onAccessibilityAction).toHaveBeenCalledTimes(1);
    fireEvent(view.getAllByTestId('native-Button').find(button => button.props.label === 'Editar rutina')!, 'buttonPress');
    expect(view.onEdit).toHaveBeenCalledTimes(2);
  });

  it('keeps the disabled row inert and leaves the initial unmeasured tap usable', () => {
    const disabled = menu(false, true);
    expect(disabled.queryByTestId('native-ContextMenu')).toBeNull();
    fireEvent.press(disabled.getByTestId('hosted-routine-row'));
    expect(disabled.onEdit).not.toHaveBeenCalled();
    disabled.unmount();
    const unmeasured = menu(false, false, 0);
    fireEvent.press(unmeasured.getByTestId('hosted-routine-row'));
    expect(unmeasured.onEdit).toHaveBeenCalledTimes(1);
  });
});
