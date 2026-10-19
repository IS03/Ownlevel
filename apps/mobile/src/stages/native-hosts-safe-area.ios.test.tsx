import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OwnlevelThemeProvider } from '@/design-system';
import { SettingsSegmented } from '@/settings/native-segmented.ios';
import { StartDatePicker } from './start-date-picker.ios';

// Only the native views are replaced: Host keeps its props so the test sees what the app passes to SwiftUI.
jest.mock('@expo/ui/swift-ui', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Host: ({ children, ...props }: { children?: ReactNode }) => <View testID="native-host" {...props}>{children}</View>,
    Picker: passthrough, Text: passthrough, DatePicker: passthrough };
});
jest.mock('@expo/ui/swift-ui/modifiers', () => new Proxy({}, { get: () => () => ({}) }));

describe('SwiftUI hosts inside scroll views', () => {
  it.each([
    ['Semanas/Meses', <SettingsSegmented key="s" accessibilityLabel="Duración en" value="weeks" onChange={() => {}} options={[{ value: 'weeks', label: 'Semanas' }, { value: 'months', label: 'Meses' }]} />],
    ['fecha de inicio', <StartDatePicker key="d" value="2026-10-19" minimum="2026-10-19" onChange={() => {}} />],
  ])('%s ignores the safe area of the bars, so it is drawn exactly in its slot', (_name, element) => {
    const view = render(<OwnlevelThemeProvider initialMode="light">{element}</OwnlevelThemeProvider>);
    expect(view.getByTestId('native-host').props.ignoreSafeArea).toBe('all');
  });
});
