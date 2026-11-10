import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { historyDay, historyFact, historyId, historyRange, historyToday } from '../../../../src/lib/mobile-api/history-fixture.test-helper';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { HistoryScreen } from './history-screen';
import { HistoryDayScreen } from './day-screen';
import { HistoryCalendarScreen } from './calendar-screen';
import { ReturnToHistoryDay } from './return-to-day';
import { historyReturnParams } from './navigation';
const mockNavigate = jest.fn(), mockPush = jest.fn(), mockReplace = jest.fn(), mockRefresh = jest.fn();
let mockParams: Record<string, string> = {}, mockData: unknown, mockStale = false;
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ navigate: mockNavigate, push: mockPush, replace: mockReplace }) }));
jest.mock('./use-history-resource', () => ({ useHistoryResource: () => ({ data: mockData, state: { status: 'ready', refreshing: false }, refresh: mockRefresh, stale: mockStale }) }));
const wrapped = (element: React.ReactElement, mode: 'light' | 'dark' = 'light') => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode={mode}>{element}</OwnlevelThemeProvider></SafeAreaProvider>;
const wrap = (element: React.ReactElement) => render(wrapped(element));
const button = (name: string) => ({ name });
beforeEach(() => { jest.clearAllMocks(); mockStale = false; mockParams = {}; mockData = historyRange(); });
describe('M6 History navigation and composed surfaces', () => {
  it('recent rows include only confirmed facts; final-fact removal disappears after reread', () => {
    mockData = historyRange([historyFact('2026-10-03', { hasWeight: true }), historyFact()]);
    const v = wrap(<HistoryScreen />);
    fireEvent.press(v.getByRole('button', button('Calendario'))); expect(mockPush).toHaveBeenCalledWith('/history/calendar');
    fireEvent.press(v.getByLabelText('3 oct 2026. Cuerpo')); expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: { date: '2026-10-03' } }));
    mockData = historyRange(); v.unmount(); const next = wrap(<HistoryScreen />);
    expect(next.getByText('Sin actividad reciente')).toBeTruthy(); expect(next.queryByLabelText('3 oct 2026. Cuerpo')).toBeNull();
  });
  it('selects empty calendar dates up to server today and displays domain indicators', () => {
    mockParams = { month: '2026-10' }; mockData = historyRange([historyFact('2026-10-03', { completedSessionsCount: 1, metricValuesCount: 1 }), historyFact()]);
    const v = wrap(<HistoryCalendarScreen />);
    expect(v.getByLabelText('2026-10-03. Training, Métricas')).toBeTruthy();
    fireEvent.press(v.getByLabelText('2026-10-04. Sin actividad'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/history/day/[date]', params: { date: historyToday, historyMonth: '2026-10' } });
    fireEvent.press(v.getByLabelText('2026-10-05. Fecha futura')); expect(mockPush).toHaveBeenCalledTimes(1);
  });
  it('shows empty day and today in progress, prev/next bounded by server', () => {
    mockParams = { date: historyToday }; mockData = historyDay(); const v = wrap(<HistoryDayScreen />);
    expect(v.getByText('Hoy · en curso')).toBeTruthy(); expect(v.getByTestId('global-day-empty')).toBeTruthy();
    fireEvent.press(v.getByRole('button', button('Día siguiente'))); expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.press(v.getByRole('button', button('Día anterior'))); expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ params: { date: '2026-10-03' } }));
  });
  it('shows all domain summaries, partial coverage and exact date drilldown without false empty', () => {
    const d = historyDay('2026-10-03'); const n = nutritionFixture();
    if (n.nutrition.status === 'ok') { const { meals: _meals, ...projection } = n.nutrition.data; d.nutrition = { status: 'ok', data: projection }; }
    d.body.weight = { status: 'ok', data: { date: d.date, weightKg: 77.5 } }; d.training = { status: 'unavailable' };
    mockParams = { date: d.date, historyMonth: '2026-10' }; mockData = d; const v = wrap(<HistoryDayScreen />);
    expect(v.getByText('Cobertura parcial. Los datos disponibles siguen visibles.')).toBeTruthy(); expect(v.queryByTestId('global-day-empty')).toBeNull();
    expect(v.getByText('Peso: 77,5 kg')).toBeTruthy(); expect(v.getByText(/Consumo:/)).toBeTruthy();
    for (const [label, pathname] of [['Training','/(tabs)/train/day/[date]'], ['Nutrición','/(tabs)/nutrition'], ['Cuerpo','/(tabs)/progress/body'], ['Métricas','/(tabs)/progress/metrics']]) {
      fireEvent.press(v.getByRole('button', button(`Abrir ${label} del día`)));
      expect(mockNavigate).toHaveBeenLastCalledWith({ pathname, params: { date: d.date, historyDate: d.date, historyMonth: '2026-10' } });
    }
  });
  it('returns deterministically with validated dates, never arbitrary URLs', async () => {
    mockParams = { historyDate: '2026-09-03', historyMonth: '2026-09', returnUrl: 'https://other.test' }; const v = wrap(<ReturnToHistoryDay />);
    await act(async () => fireEvent.press(v.getByRole('button', button('Volver al día'))));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/history/day/[date]', params: { date: '2026-09-03', historyMonth: '2026-09' } });
    expect(historyReturnParams({ historyDate: '2026-02-30', returnUrl: 'https://other.test' })).toBeUndefined();
  });
});


describe('History day → original sessions (#402)', () => {
  const dated = (count: number | null, visible: number) => {
    const day = historyDay('2026-09-30');
    day.discovery!.days[0].completedSessionsCount = count;
    if (count === null) day.discovery!.availability.training = 'unavailable';
    day.training = { status: 'ok', data: { sessions: Array.from({ length: visible }, (_, i) => ({ id: historyId(i + 1), name: `Rutina ${i + 1}` })) } };
    return day;
  };
  it.each([0, 1, 3, 5])('labels %i completed sessions without passing a capped preview off as the complete list', count => {
    mockData = dated(count, Math.min(count, 3)); mockParams = { date: '2026-09-30', historyMonth: '2026-08' };
    const view = wrap(<HistoryDayScreen />);
    expect(view.getByText(`${count} ${count === 1 ? 'sesión terminada' : 'sesiones terminadas'}`)).toBeTruthy();
    expect(view.queryAllByTestId(/^history-day-session-/)).toHaveLength(Math.min(count, 3));
    if (count > 3) expect(view.getByText('Vista previa: 3 de 5 sesiones. Consultá todas en Training del día.')).toBeTruthy();
    else expect(view.queryByText(/Vista previa:/)).toBeNull();
    if (count === 0) expect(view.getByTestId('global-day-empty')).toBeTruthy();
    else {
      fireEvent.press(view.getByTestId(`history-day-session-${historyId(Math.min(count, 3))}`));
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: historyId(Math.min(count, 3)), historyDate: '2026-09-30', historyMonth: '2026-08' } });
    }
    fireEvent.press(view.getByRole('button', { name: 'Abrir Training del día' }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/(tabs)/train/day/[date]', params: { date: '2026-09-30', historyDate: '2026-09-30', historyMonth: '2026-08' } });
  });
  it('does not invent a total when discovery is partial; the visible original remains reachable without a calendar month', () => {
    mockData = dated(null, 1); mockParams = { date: '2026-09-30', historyMonth: '2026-13' };
    const view = wrap(<HistoryDayScreen />);
    expect(view.getByText('Total de sesiones terminadas no disponible')).toBeTruthy();
    expect(view.getByText(/Vista previa de hasta 3 sesiones/)).toBeTruthy();
    expect(view.queryByTestId('global-day-empty')).toBeNull();
    fireEvent.press(view.getByTestId(`history-day-session-${historyId(1)}`));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: historyId(1), historyDate: '2026-09-30' } });
  });
  it('calls out contradictory reads instead of claiming zero sessions or substituting the preview length as total', () => {
    mockData = dated(0, 2); mockParams = { date: '2026-09-30' };
    const view = wrap(<HistoryDayScreen />);
    expect(view.getByText('Recuento por confirmar')).toBeTruthy();
    expect(view.getByText(/La vista previa y el total no coinciden/)).toBeTruthy();
    expect(view.queryByText('0 sesiones terminadas')).toBeNull();
    expect(view.queryByTestId('global-day-empty')).toBeNull();
  });
  it('keeps an unavailable preview distinct from zero and marks retained sessions as an old reading', () => {
    const day = dated(5, 3); day.training = { status: 'unavailable' }; mockData = day; mockParams = { date: day.date };
    const view = wrap(<HistoryDayScreen />);
    expect(view.getByText('5 sesiones terminadas')).toBeTruthy(); expect(view.getByText('No pudimos leer esta sección.')).toBeTruthy();
    expect(view.queryAllByTestId(/^history-day-session-/)).toHaveLength(0); expect(view.queryByTestId('global-day-empty')).toBeNull();
    mockData = dated(5, 3); mockStale = true; view.rerender(wrapped(<HistoryDayScreen />));
    expect(view.getByText('Mostramos la última lectura de esta fecha. No pudo actualizarse.')).toBeTruthy();
    expect(view.getByTestId(`history-day-session-${historyId(1)}`)).toBeTruthy();
  });
  it.each(['light', 'dark'] as const)('uses accessible wrapping list rows for long names (%s)', mode => {
    const day = dated(1, 1), name = 'Sesión con un nombre muy largo para que se pueda leer con letra accesible';
    if (day.training.status === 'ok') day.training.data.sessions[0].name = name;
    mockData = day; mockParams = { date: day.date }; const view = render(wrapped(<HistoryDayScreen />, mode));
    const row = view.getByRole('button', { name: `Abrir sesión ${name}, terminada. miércoles, 30 de septiembre de 2026` });
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(44);
    const text = within(row).getByText(name); expect(text.props.numberOfLines).toBeUndefined(); expect(text.props.allowFontScaling).not.toBe(false);
    expect(row.props.accessibilityHint).toContain('series originales');
  });
  it.each([0, 77.5, null])('distinguishes invalid weight %s from absent or valid exact-date records', weight => {
    const day = dated(0, 0); day.body.weight = { status: 'ok', data: weight === null ? null : { date: day.date, weightKg: weight } };
    mockData = day; mockParams = { date: day.date }; const view = wrap(<HistoryDayScreen />);
    expect(view.getByText(weight === 0 ? 'Peso: 0 kg · No válido como peso corporal' : weight === null ? 'Peso: Sin registro' : 'Peso: 77,5 kg')).toBeTruthy();
  });
});
