import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { useState, type ReactNode } from 'react';
import { OwnlevelThemeProvider } from '@/design-system';
import { SessionRestDuration } from './session-rest-duration.ios';

const FallbackSessionRestDuration = jest.requireActual<typeof import('./session-rest-duration')>('./session-rest-duration.tsx').SessionRestDuration;

// Exercise the installed Expo UI wrappers, including content retention until native onDismiss.
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: (_module: string, name: string) =>
    function NativeView({ children, ...props }: { children?: ReactNode }) {
      return <View {...props} testID={`native-${name}`}>{children}</View>;
    } };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('./routine-form-sheet', () => jest.requireActual('./routine-form-sheet.ios'));

function setup(dark = false, fallback = false) {
  const onClose = jest.fn(), onStart = jest.fn();
  function Parent() {
    const [mounted, setMounted] = useState(true);
    const Duration = fallback ? FallbackSessionRestDuration : SessionRestDuration;
    return mounted ? <Duration onStart={onStart} onClose={() => { onClose(); setMounted(false); }} /> : null;
  }
  const view = render(<OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}><Parent /></OwnlevelThemeProvider>);
  return { ...view, onClose, onStart };
}

describe('rest duration native dismiss lifecycle (#378)', () => {
  it.each([false, true])('X requests closing but retains the wheel until fully dismissed (dark=%s)', async dark => {
    const view = setup(dark);
    await act(async () => {});
    const sheet = view.getByTestId('native-BottomSheetView');
    fireEvent.press(view.getByRole('button', { name: 'Cerrar duración de descanso' }));
    expect(view.getByTestId('native-BottomSheetView').props.isPresented).toBe(false);
    expect(view.getByTestId('native-PickerView')).toBeTruthy();
    expect(view.onClose).not.toHaveBeenCalled();
    fireEvent(sheet, 'isPresentedChange', { nativeEvent: { isPresented: false } });
    expect(view.getByTestId('native-PickerView')).toBeTruthy();
    expect(view.onStart).not.toHaveBeenCalled();
    fireEvent(sheet, 'dismiss', { nativeEvent: {} });
    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('native-PickerView')).toBeNull();
  });

  it('retains the wheel on swipe-down and reports dismissal only once', async () => {
    const view = setup(); await act(async () => {});
    const sheet = view.getByTestId('native-BottomSheetView');
    fireEvent(sheet, 'isPresentedChange', { nativeEvent: { isPresented: false } });
    expect(view.getByTestId('native-PickerView')).toBeTruthy();
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.onStart).not.toHaveBeenCalled();
    // Two native notifications in one turn must still notify the parent only once.
    act(() => { sheet.props.onDismiss({ nativeEvent: {} }); sheet.props.onDismiss({ nativeEvent: {} }); });
    expect(view.onClose).toHaveBeenCalledTimes(1);
  });

  it('starts the selected duration once, retains content during closing, and resets on reopening', async () => {
    const view = setup(); await act(async () => {});
    fireEvent(view.getByTestId('native-PickerView'), 'selectionChange', { nativeEvent: { selection: 105 } });
    const start = view.getByRole('button', { name: 'Iniciar descanso' });
    act(() => { fireEvent.press(start); fireEvent.press(start); });
    expect(view.onStart).toHaveBeenCalledTimes(1);
    expect(view.onStart).toHaveBeenCalledWith(105);
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.getByTestId('native-PickerView')).toBeTruthy();
    fireEvent(view.getByTestId('native-BottomSheetView'), 'dismiss', { nativeEvent: {} });
    expect(view.onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    const reopened = setup(); await act(async () => {});
    expect(reopened.getByTestId('native-BottomSheetView').props.isPresented).toBe(true);
    expect(reopened.getByTestId('native-PickerView').props.selection).toBe(60);
  });

  it('preserves fallback confirmation and cancellation with the parent-owned timer callback', async () => {
    const view = setup(false, true); await act(async () => {});
    fireEvent.changeText(view.getByLabelText('Duración en segundos'), '120');
    fireEvent.press(view.getByRole('button', { name: 'Iniciar descanso' }));
    expect(view.onStart).toHaveBeenCalledTimes(1);
    expect(view.onStart).toHaveBeenCalledWith(120);
    expect(view.onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    const cancelled = setup(false, true); await act(async () => {});
    fireEvent.press(cancelled.getByRole('button', { name: 'Cerrar duración de descanso' }));
    expect(cancelled.onStart).not.toHaveBeenCalled();
    expect(cancelled.onClose).toHaveBeenCalledTimes(1);
  });
});
