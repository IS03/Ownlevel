import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { RoutineContextMenu } from './routine-context-menu.ios';
import { RoutineRow } from './routine-row';
import { LibraryRow } from '@/nutrition/library-ui';

// Keep the installed SDK wrappers and modifier event wiring; replace only native views.
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: (_module: string, name: string) =>
    function NativeView({ children, ...props }: { children?: ReactNode }) {
      return <View {...props} testID={`native-${name}`}>{children}</View>;
    },
  };
});

// Actual consumers use the iOS SDK wrapper; swipe physics and confirmation are separate contracts.
jest.mock('./routine-context-menu', () => jest.requireActual('./routine-context-menu.ios'));
jest.mock('./start-confirm', () => ({ StartConfirm: () => null }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { __esModule: true, default: React.forwardRef(function Swipe({ children }: { children?: ReactNode }, ref) {
    React.useImperativeHandle(ref, () => ({ close: jest.fn(), reset: jest.fn() }));
    return children;
  }) };
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


describe('shared iOS host consumers', () => {
  it('consumer routine keeps its tap and accessibility actions after repeated measurements', async () => {
    const onOpen = jest.fn(), onDuplicate = jest.fn();
    const view = render(<OwnlevelThemeProvider initialMode="light"><RoutineRow routine={routine} disabled={false}
      onOpen={onOpen} onDuplicate={onDuplicate} onColor={jest.fn()} onStart={jest.fn()} onStatus={jest.fn()} />
    </OwnlevelThemeProvider>);
    await act(async () => {}); // Flush the platform accessibility preference read before interacting.
    for (const width of [358, 320, 358]) {
      fireEvent(view.getByTestId('routine-row-routine'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 76 } } });
    }
    expect(onOpen).not.toHaveBeenCalled();
    expect(onDuplicate).not.toHaveBeenCalled();
    const row = view.getByRole('button', { name: 'Abrir rutina PUSH, 8 ejercicios · 24 series' });
    expect(row.props.accessibilityHint).toBe('Tocá para editar. Mantené apretado para ver acciones.');
    expect(row.props.accessibilityActions).toEqual(expect.arrayContaining([{ name: 'duplicate', label: 'Duplicar' }]));
    fireEvent(view.getByTestId('native-GroupView'), 'globalEvent', { nativeEvent: { onTapGesture: {} } });
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'duplicate' } });
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it('consumer library keeps menu callbacks, accessibility and disabled state after measurement', async () => {
    const onOpen = jest.fn(), onArchive = jest.fn();
    const screen = (disabled: boolean) => <OwnlevelThemeProvider initialMode="light"><LibraryRow testID="example-library"
      name="EJEMPLO" calories={null} detail="Sin datos" disabled={disabled} onOpen={onOpen} onArchive={onArchive} />
    </OwnlevelThemeProvider>;
    const view = render(screen(false));
    await act(async () => {}); // Flush the platform accessibility preference read before interacting.
    for (const width of [358, 320, 358]) {
      fireEvent(view.getByTestId('example-library'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 66 } } });
    }
    expect(onOpen).not.toHaveBeenCalled();
    expect(onArchive).not.toHaveBeenCalled();
    const row = view.getByRole('button', { name: /^Editar EJEMPLO,/ });
    const label = row.props.accessibilityLabel;
    expect(row.props.accessibilityHint).toBe('Mantené apretado para ver acciones.');
    expect(row.props.accessibilityActions).toEqual([{ name: 'Editar', label: 'Editar' }, { name: 'Archivar', label: 'Archivar' }]);
    fireEvent(view.getByTestId('native-GroupView'), 'globalEvent', { nativeEvent: { onTapGesture: {} } });
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent(view.getAllByTestId('native-Button').find(button => button.props.label === 'Archivar')!, 'buttonPress');
    expect(onArchive).toHaveBeenCalledTimes(1);
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'Archivar' } });
    expect(onArchive).toHaveBeenCalledTimes(2);
    view.rerender(screen(true));
    expect(view.queryByTestId('native-ContextMenu')).toBeNull();
    const disabled = view.getByRole('button', { name: label });
    expect(disabled.props.accessibilityState.disabled).toBe(true);
    expect(disabled.props.accessibilityActions).toEqual([]);
    fireEvent.press(disabled);
    fireEvent(disabled, 'accessibilityAction', { nativeEvent: { actionName: 'Archivar' } });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalledTimes(2);
  });
});
