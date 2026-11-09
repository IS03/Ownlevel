import {fireEvent, render} from '@testing-library/react-native';
import {expect, it, jest} from '@jest/globals';
import {OwnlevelThemeProvider} from '@/design-system';
import {ProgressFindings} from './progress-findings';
import {editorialFixture} from './panorama-fixture.test-helper';
jest.mock('expo-symbols', () => ({SymbolView: () => null}));
jest.mock('@/platform/haptics', () => ({haptics: {selection: jest.fn()}, triggerHaptic: jest.fn()}));
const onSelect = jest.fn(), onOpen = jest.fn();
const wrap = (items: ReturnType<typeof editorialFixture> | undefined, selected: string | null = null) => <OwnlevelThemeProvider initialMode="light"><ProgressFindings items={items} selected={selected} onSelect={onSelect} onOpen={onOpen}/></OwnlevelThemeProvider>;
it('distinguishes a previous server from an empty selection, without filling any position', () => {
    const view = render(wrap(undefined)); expect(view.getByText('Los hallazgos no están disponibles en esta lectura.')).toBeTruthy();
    expect(view.queryByText('No hay hallazgos para destacar en esta ventana.')).toBeNull();
    view.rerender(wrap([])); expect(view.getByText('No hay hallazgos para destacar en esta ventana.')).toBeTruthy();
    expect(view.queryAllByRole('button')).toHaveLength(0);
});
it('makes a record and a different comparison of the same exercise discoverable, one reference at a time', () => {
    const items = editorialFixture(), view = render(wrap(items));
    const record = view.getByRole('button', {name: /Ver referencia de Press banca.*Nuevo récord/});
    expect(record.props.accessibilityState.expanded).toBe(false); fireEvent.press(record); expect(onSelect).toHaveBeenLastCalledWith(items[0]!.id);
    view.rerender(wrap(items, items[0]!.id));
    expect(view.getByText('2 series del período evaluadas según el modo de carga registrado.')).toBeTruthy();
    expect(view.getByText(/historial registrado hasta el 10\/10\/2026/)).toBeTruthy();
    view.rerender(wrap(items, items[1]!.id));
    expect(view.queryByText(/historial registrado hasta el/)).toBeNull();
    expect(view.getByText('Referencia: sesión del 01/11/2026 → sesión del 07/11/2026.')).toBeTruthy();
    expect(view.getByText(/3 sesiones con series utilizables/)).toBeTruthy();
    expect(view.getAllByRole('button', {name: 'Ver registros de Press banca'})).toHaveLength(1);
    fireEvent.press(view.getByRole('button', {name: 'Ver registros de Press banca'})); expect(onOpen).toHaveBeenLastCalledWith(items[1]);
});
it('keeps a single result, long names and its method accessible instead of truncating the evidence', () => {
    const one = {...editorialFixture()[0]!, title: 'Press banca con nombre histórico muy largo y referencia conservada'};
    const view = render(wrap([one], one.id));
    expect(view.getByRole('button', {name: new RegExp(`Ver referencia de ${one.title}.*Progreso`)}).props.accessibilityState.expanded).toBe(true);
    expect(view.getByText('11/10/2026 – 09/11/2026')).toBeTruthy();
    expect(view.getByRole('button', {name: `Ver registros de ${one.title}`})).toBeTruthy();
});

it('does not call a failed source an empty inventory', () => {
    const view = render(<OwnlevelThemeProvider initialMode="dark"><ProgressFindings items={[]} sourcesUnavailable selected={null} onSelect={onSelect} onOpen={onOpen}/></OwnlevelThemeProvider>);
    expect(view.getByText('No pudimos leer todas las fuentes de hallazgos.')).toBeTruthy();
    expect(view.queryByText('No hay hallazgos para destacar en esta ventana.')).toBeNull();
});

it('names an equal comparable result as a comparison, without inventing an improvement', () => {
    const item = {...editorialFixture()[1]!, description: 'Sin cambio claro'};
    const view = render(wrap([item], item.id));
    expect(view.getByText('Comparación · Press banca')).toBeTruthy();
    expect(view.getByText(/^Sin cambio claro\nProgreso/)).toBeTruthy();
    expect(view.getByText(/3 sesiones con series utilizables/)).toBeTruthy();
});
