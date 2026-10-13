import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OwnlevelThemeProvider } from '@/design-system';
import { detailFixture } from '@/api/routine-editor.fixture';
import { draftFromTargets } from './routine-editor-model';
import { RoutineRestPicker } from './routine-rest-picker.ios';
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: (_module: string, name: string) => function NativeView({ children, ...props }: { children?: ReactNode }) {
    return <View {...props} testID={`native-${name}`}>{children}</View>;
  } };
});
describe('native rest wheels', () => {
  it.each([false, true])('opens with exact saved values and retains them until a wheel changes (dark=%s)', dark => {
    const draft = { ...draftFromTargets(detailFixture.items[0]!.targets), restMin: '2:20', restMax: '' }, onChange = jest.fn();
    const view = render(<OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}><RoutineRestPicker draft={draft} disabled={false} onChange={onChange} /></OwnlevelThemeProvider>);
    const [min, max] = view.getAllByTestId('native-PickerView');
    expect(min!.props.selection).toBe(140); expect(max!.props.selection).toBe(-1);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent(max!, 'selectionChange', { nativeEvent: { selection: 0 } }); expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ restMin: '2:20', restMax: '2:20' }));
    fireEvent(max!, 'selectionChange', { nativeEvent: { selection: -1 } }); expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ restMin: '2:20', restMax: '' }));
    fireEvent(min!, 'selectionChange', { nativeEvent: { selection: 3600 } }); expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ restMin: '60:00', restMax: '' }));
  });
});
