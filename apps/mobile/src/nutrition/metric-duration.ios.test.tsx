import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OwnlevelThemeProvider } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { MetricDuration, durationHours } from './metric-duration.ios';
jest.mock('@/platform/haptics', () => ({ triggerHaptic: jest.fn() }));
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: (_module: string, name: string) => function NativeView({ children, ...props }: { children?: ReactNode }) {
    return <View {...props} testID={`native-${name}`}>{children}</View>;
  } };
});
describe('native metric duration wheels', () => {
  it.each([false, true])('preserves exact hours/minutes and reports whole-minute wheel changes (dark=%s)', dark => {
    const onChange = jest.fn(), value = { value: '14405', hours: '240', minutes: '5' };
    const view = render(<OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}><MetricDuration value={value} disabled={false} onChange={onChange} /></OwnlevelThemeProvider>);
    const [hours, minutes] = view.getAllByTestId('native-PickerView');
    expect(hours.props.selection).toBe(240); expect(minutes.props.selection).toBe(5); expect(durationHours('240')).toContain(240);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent(minutes, 'selectionChange', { nativeEvent: { selection: 15 } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, minutes: '15' }); expect(triggerHaptic).toHaveBeenCalledWith('stepperChange');
    fireEvent(hours, 'selectionChange', { nativeEvent: { selection: 8 } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, hours: '8' });
  });
});
