import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OwnlevelThemeProvider } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';

import { BodyAddMenu } from './body-add-menu';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ triggerHaptic: jest.fn(), haptics: { selection: jest.fn() } }));

const wrap = (el: React.ReactElement) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light">{el}</OwnlevelThemeProvider></SafeAreaProvider>);

describe('Cuerpo "+"', () => {
  it('opens with a haptic, runs the chosen entry once and closes; the veil closes without running anything', () => {
    const weight = jest.fn(), measure = jest.fn();
    const view = wrap(<BodyAddMenu actions={[
      { key: 'weight', label: 'Registrar peso', icon: 'scale', onPress: weight },
      { key: 'measurement', label: 'Registrar medidas', icon: 'ruler', onPress: measure },
    ]} />);
    const plus = view.getByTestId('body-add-menu');
    expect(plus.props.accessibilityState.expanded).toBe(false);
    fireEvent.press(plus);
    expect(triggerHaptic).toHaveBeenCalledWith('stepperChange');
    expect(view.getByTestId('body-add-menu').props.accessibilityState.expanded).toBe(true);
    fireEvent.press(view.getByTestId('body-add-measurement'));
    expect(measure).toHaveBeenCalledTimes(1); expect(weight).not.toHaveBeenCalled();
    expect(view.getByTestId('body-add-menu').props.accessibilityState.expanded).toBe(false);
    fireEvent.press(view.getByTestId('body-add-menu'));
    fireEvent.press(view.getAllByLabelText('Cerrar opciones')[0]);
    expect(view.getByTestId('body-add-menu').props.accessibilityState.expanded).toBe(false);
    expect(weight).not.toHaveBeenCalled();
  });
  it('disabled (a sheet open or a write pending) cannot open', () => {
    const view = wrap(<BodyAddMenu disabled actions={[{ key: 'weight', label: 'Registrar peso', icon: 'scale', onPress: jest.fn() }]} />);
    fireEvent.press(view.getByTestId('body-add-menu'));
    expect(view.getByTestId('body-add-menu').props.accessibilityState.expanded).toBe(false);
  });
});
