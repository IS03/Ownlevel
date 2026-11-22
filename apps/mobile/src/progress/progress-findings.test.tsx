import { fireEvent, render } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { ProgressFindings } from './progress-findings';
import { editorialFixture } from './panorama-fixture.test-helper';
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const onSelect = jest.fn(), onOpen = jest.fn();
const wrap = (items: ReturnType<typeof editorialFixture> | undefined, selected: string | null = null) => <OwnlevelThemeProvider initialMode="light"><ProgressFindings items={items} selected={selected} onSelect={onSelect} onOpen={onOpen} /></OwnlevelThemeProvider>;
it('distinguishes unavailable findings, a confirmed empty result and failed sources', () => {
  const view = render(wrap(undefined));
  expect(view.getByText('Los hallazgos no están disponibles en esta lectura.')).toBeTruthy();
  view.rerender(wrap([]));
  expect(view.getByText('No hay hallazgos para destacar en esta ventana.')).toBeTruthy();
  expect(view.queryAllByRole('button')).toHaveLength(0);
  view.rerender(<OwnlevelThemeProvider><ProgressFindings items={[]} sourcesUnavailable selected={null} onSelect={onSelect} onOpen={onOpen} /></OwnlevelThemeProvider>);
  expect(view.getByText('No pudimos leer todas las fuentes de hallazgos.')).toBeTruthy();
});
it('keeps records and first-last comparisons distinct and explains the exact one in a single native alert', () => {
  const items = editorialFixture(), view = render(wrap(items));
  fireEvent.press(view.getByRole('button', { name: /Ver referencia de Press banca.*Nuevo récord/ }));
  expect(onSelect).toHaveBeenLastCalledWith(items[0].id);
  // The explanation is available even with the observation closed, with no second disclosure.
  fireEvent.press(view.getByTestId(`finding-info-${items[0].id}`));
  expect(alert).toHaveBeenLastCalledWith('Press banca', expect.stringContaining('2 series del período frente al historial registrado hasta el 10/10/2026'), [{ text: 'Listo', style: 'cancel' }]);
  view.rerender(wrap(items, items[1].id));
  fireEvent.press(view.getByTestId(`finding-info-${items[1].id}`));
  expect(alert).toHaveBeenLastCalledWith('Press banca', expect.stringContaining('primera sesión (01/11/2026) y la última (07/11/2026)'), expect.any(Array));
  expect(alert.mock.calls.at(-1)![1]).toContain('3 sesiones con series utilizables');
  expect(view.getAllByRole('button', { name: 'Ver registros de Press banca' })).toHaveLength(1);
  fireEvent.press(view.getByRole('button', { name: 'Ver registros de Press banca' }));
  expect(onOpen).toHaveBeenLastCalledWith(items[1]);
});
it('keeps long historical names, neutral comparisons and the true dates accessible', () => {
  const item = { ...editorialFixture()[1], title: 'Press banca con nombre histórico muy largo y referencia conservada', description: 'Sin cambio claro' };
  const view = render(wrap([item], item.id));
  expect(view.getByText(`Comparación · ${item.title}`)).toBeTruthy();
  expect(view.getByText('Sin cambio claro')).toBeTruthy();
  expect(view.getByText('1 nov')).toBeTruthy(); expect(view.getByText('7 nov')).toBeTruthy();
  expect(view.getByRole('button', { name: `Cómo se calculó: ${item.title}` })).toBeTruthy();
  expect(view.getByRole('button', { name: `Ver registros de ${item.title}` })).toBeTruthy();
});
it('shows each nutrition population and moves the method to the native explanation without removing it', () => {
  const item = editorialFixture()[2], view = render(wrap([item]));
  expect(view.getByText(/vs. 11 sep – 10 oct/)).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Cómo se calculó' })).toBeNull();
  fireEvent.press(view.getByTestId(`finding-info-${item.id}`));
  expect(alert).toHaveBeenLastCalledWith(item.title, expect.stringContaining('días cerrados con ese nutriente completo'), expect.any(Array));
  expect(alert.mock.calls.at(-1)![1]).toContain('no confirma toda la ingesta');
  expect(view.queryByText(/no confirma toda la ingesta/)).toBeNull();
  view.rerender(wrap([item], item.id));
  expect(view.getByText('10 de 29 días utilizados')).toBeTruthy();
  expect(view.getByText('15 de 30 días utilizados')).toBeTruthy();
  expect(view.getByText('11 sep – 10 oct')).toBeTruthy(); expect(view.getByText('11 oct – 9 nov')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Ver registros de Calorías registradas' }));
  expect(onOpen).toHaveBeenLastCalledWith(item);
});
