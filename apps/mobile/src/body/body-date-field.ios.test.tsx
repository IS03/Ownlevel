import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OwnlevelThemeProvider } from '@/design-system';
import { BodyDateField } from './body-date-field.ios';

// Native views keep their props; modifiers report their name and arguments, so the test sees what reaches SwiftUI.
jest.mock('@expo/ui/swift-ui', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const node = (testID: string) => {
    const NativeNode = ({ children, ...props }: { children?: ReactNode }) => <View testID={testID} {...props}>{children}</View>;
    NativeNode.displayName = testID;
    return NativeNode;
  };
  return { Host: node('native-host'), DatePicker: node('native-date') };
});
jest.mock('@expo/ui/swift-ui/modifiers', () => new Proxy({}, { get: (_target, name) => (...args: unknown[]) => ({ name, args }) }));

describe('Body date field (weight sheet in Cuerpo and Ajustes)', () => {
  it('shows Spanish months whatever the device language, without touching the stored value', () => {
    const onChange = jest.fn();
    const view = render(<OwnlevelThemeProvider initialMode="light">
      <BodyDateField value="28/10/2026" today="2026-10-28" editable onChange={onChange} />
    </OwnlevelThemeProvider>);
    const date = view.getByTestId('native-date');
    expect(date.props.modifiers).toContainEqual({ name: 'environment', args: ['locale', 'es_AR'] });
    expect(date.props.modifiers).toContainEqual({ name: 'accessibilityLabel', args: ['Fecha'] });
    expect(onChange).not.toHaveBeenCalled();
  });
});
