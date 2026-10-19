import { fireEvent, render } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as RN from 'react-native';
import { OwnlevelThemeProvider, TextField } from '@/design-system';
import { EditorialRow, EditorialScreen, EditorialSpread, useEditorialLayout } from './editorial';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('@/design-system/motion', () => ({ ...jest.requireActual<object>('@/design-system/motion'), useReduceMotion: () => false }));
afterEach(() => { jest.restoreAllMocks(); });
const wrap = (children: React.ReactNode) => render(<OwnlevelThemeProvider initialMode="light">{children}</OwnlevelThemeProvider>);
function Layout() {
  const { largeInputStyle } = useEditorialLayout();
  return <EditorialSpread testID="pair"><TextField label="Nombre de la secuencia" value="Volumen y definición" inputStyle={largeInputStyle} /></EditorialSpread>;
}
describe('Editorial QA', () => {
  it.each([1, 2])('stacks wide pairs at large text without capping the font (scale %s)', fontScale => {
    mockFontScale = fontScale;
    const view = wrap(<Layout />);
    expect(RN.StyleSheet.flatten(view.getByTestId('pair').props.style).flexDirection).toBe(fontScale > 1.3 ? 'column' : 'row');
    const style = RN.StyleSheet.flatten(view.getByLabelText('Nombre de la secuencia').props.style);
    expect(style.lineHeight).toBe(34);
    expect(style.minHeight).toBeGreaterThanOrEqual(34 * fontScale + 24);
    expect(view.getByLabelText('Nombre de la secuencia').props.maxFontSizeMultiplier).toBeUndefined();
  });
  it('lets the screen follow and dismiss the keyboard, with its own safe area', () => {
    const view = wrap(<EditorialScreen><RN.Text>Cuenta</RN.Text></EditorialScreen>);
    expect(view.UNSAFE_getByType(RN.ScrollView).props).toMatchObject({ automaticallyAdjustKeyboardInsets: true, keyboardDismissMode: 'interactive', contentInsetAdjustmentBehavior: 'automatic' });
  });
  it('can stop background keyboard adjustment while its own modal is visible', () => {
    const view = wrap(<EditorialScreen adjustKeyboardInsets={false} scrollEnabled={false}><RN.Text>Plan</RN.Text></EditorialScreen>);
    expect(view.UNSAFE_getByType(RN.ScrollView).props).toMatchObject({ automaticallyAdjustKeyboardInsets: false, scrollEnabled: false });
  });
  it('announces an editorial row value alongside its title and keeps navigation', () => {
    const open = jest.fn();
    const view = wrap(<EditorialRow title="Nacimiento" onPress={open}>11 dic 2003</EditorialRow>);
    expect(view.getByLabelText('Nacimiento').props.accessibilityValue).toEqual({ text: '11 dic 2003' });
    fireEvent.press(view.getByLabelText('Nacimiento'));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
