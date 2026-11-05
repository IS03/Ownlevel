import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Dimensions, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { InsightRow } from './insight-row';

const row = (onPress: () => void = () => undefined) => render(<OwnlevelThemeProvider initialMode="light">
  <InsightRow label="Press banca con un nombre bien largo" value="Sin comparar" detail="Falta contexto" spoken="Press banca: sin comparar" onPress={onPress} />
</OwnlevelThemeProvider>);
const atScale = (fontScale: number) => { const window = Dimensions.get('window'); Dimensions.set({ window: { ...window, fontScale }, screen: Dimensions.get('screen') }); };

afterEach(() => atScale(1));

describe('fila de Insights', () => {
  it('opens with its full spoken sentence, at least the minimum touch size', () => {
    const onPress = jest.fn<() => void>(), view = row(onPress);
    const button = view.getByRole('button', { name: 'Press banca: sin comparar' });
    expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('never cuts the name, and with large text the value goes under it instead of squeezing', () => {
    atScale(1);
    const normal = row();
    expect(normal.getByText('Press banca con un nombre bien largo').props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(normal.getByText('Sin comparar').props.style).textAlign).toBe('right');
    normal.unmount();
    atScale(1.5);
    const large = row();
    expect(large.getByText('Press banca con un nombre bien largo').props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(large.getByText('Sin comparar').props.style).textAlign).toBeUndefined();
  });
  it('tells when it opens and closes something', () => {
    const view = render(<OwnlevelThemeProvider initialMode="light"><InsightRow label="Lunes" expanded spoken="Lunes" onPress={() => undefined} /></OwnlevelThemeProvider>);
    expect(view.getByRole('button', { name: 'Lunes' }).props.accessibilityState).toMatchObject({ expanded: true });
  });
});
