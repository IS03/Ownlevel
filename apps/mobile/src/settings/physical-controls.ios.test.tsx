import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OwnlevelThemeProvider } from '@/design-system';
import { BirthPicker, HeightWheel } from './physical-controls.ios';

// Native views keep their props; modifiers report their name and arguments, so the test sees what reaches SwiftUI.
jest.mock('@expo/ui/swift-ui', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const node = (testID: string) => {
    const NativeNode = ({ children, ...props }: { children?: ReactNode }) => <View testID={testID} {...props}>{children}</View>;
    NativeNode.displayName = testID;
    return NativeNode;
  };
  return { Host: node('native-host'), DatePicker: node('native-date'), Picker: node('native-picker'), Text: node('native-text') };
});
jest.mock('@expo/ui/swift-ui/modifiers', () => new Proxy({}, { get: (_target, name) => (...args: unknown[]) => ({ name, args }) }));
const wrap = (element: ReactNode) => render(<OwnlevelThemeProvider initialMode="light">{element}</OwnlevelThemeProvider>);
const names = (modifiers: { name: string; args: unknown[] }[]) => modifiers.map(modifier => modifier.name);

describe('Datos físicos native pickers', () => {
  it('Nacimiento (#313): no second label beside the wheel, months in Spanish, drawn exactly in its slot', () => {
    const view = wrap(<BirthPicker value="2003-12-11" today="2026-10-28" onChange={() => {}} />);
    const host = view.getByTestId('native-host');
    expect(host.props.ignoreSafeArea).toBe('all');
    expect(host.props.style).toMatchObject({ height: 200 });
    const modifiers = view.getByTestId('native-date').props.modifiers as { name: string; args: unknown[] }[];
    expect(names(modifiers)).toContain('labelsHidden');
    expect(modifiers).toContainEqual({ name: 'environment', args: ['locale', 'es_AR'] });
    expect(modifiers).toContainEqual({ name: 'accessibilityLabel', args: ['Nacimiento'] });
  });
  it('Altura (#314): a fixed height from the first frame (no measured jump), no label, safe area ignored', () => {
    const view = wrap(<HeightWheel value="174" onChange={() => {}} />);
    const host = view.getByTestId('native-host');
    expect(host.props.ignoreSafeArea).toBe('all');
    expect(host.props.matchContents).toBeUndefined();
    expect(host.props.style).toMatchObject({ height: 200 });
    expect(names(view.getByTestId('native-picker').props.modifiers)).toContain('labelsHidden');
  });
});
