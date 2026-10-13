import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { RoutineEditorSheet } from './routine-editor-sheet.ios';
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: (_module: string, name: string) => function NativeView({ children, ...props }: { children?: ReactNode }) {
    return <View {...props} testID={`native-${name}`}>{children}</View>;
  } };
});
describe('large native editor sheet', () => {
  it.each([false, true])('keeps a dirty sheet protected and runs navigation only after native dismissal (dark=%s)', dark => {
    const close = jest.fn(), dismissed = jest.fn();
    const content = (open: boolean, dirty: boolean) => <OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}>
      <RoutineEditorSheet open={open} dirty={dirty} pending={false} onClose={close} onDismissed={dismissed}><View /></RoutineEditorSheet>
    </OwnlevelThemeProvider>;
    const view = render(content(true, true));
    const native = view.getByTestId('native-BottomSheetView');
    expect(view.getByTestId('native-GroupView').props.modifiers).toEqual(expect.arrayContaining([expect.objectContaining({ $type: 'interactiveDismissDisabled', isDisabled: true })]));
    fireEvent(native, 'isPresentedChange', { nativeEvent: { isPresented: false } }); expect(close).not.toHaveBeenCalled();
    view.rerender(content(false, false)); expect(dismissed).not.toHaveBeenCalled();
    fireEvent(view.getByTestId('native-BottomSheetView'), 'dismiss', { nativeEvent: {} }); expect(dismissed).toHaveBeenCalledTimes(1);
  });
});
