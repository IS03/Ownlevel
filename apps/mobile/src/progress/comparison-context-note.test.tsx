import { expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { ComparisonContextNote, comparisonContextText } from './comparison-context-note';
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() } }));
it('distinguishes a mixed breakdown from missing provenance and from zero comparable results', () => {
  expect(comparisonContextText({ complete: 2, partial: 3 }, 5)).toBe('2 con contexto completo · 3 parciales');
  expect(comparisonContextText(undefined, 5)).toBe('Contexto sin desglose en esta lectura');
  expect(comparisonContextText(undefined, 0)).toBe('Sin comparaciones claras');
});
it('opens the method directly with the selected counts and no nested disclosure', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = render(<OwnlevelThemeProvider><ComparisonContextNote context={{ complete: 2, partial: 3 }} compared={5} testID="context" /></OwnlevelThemeProvider>);
  fireEvent.press(view.getByRole('button', { name: /2 con contexto completo · 3 parciales/ }));
  expect(alert).toHaveBeenCalledWith('Contexto de la comparación', expect.stringContaining('falta la variante histórica'), expect.any(Array));
  expect(alert).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});
