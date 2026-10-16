import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { MobileApiClient } from '@/api/client';
import type { NutritionStages } from '@/api/nutrition-stages';
import type { ProgressStages, ProgressStageSummary } from '@/api/progress-stages';
import { OwnlevelThemeProvider } from '@/design-system';
import { PeriodChart } from './period-chart';
import { ProgressStagesScreen } from './stages-screen';
import { chartBands, defaultCompare, stageDates, stageLength, stageRows, stagesRowDetail } from './stages-model';

const mockRead = jest.fn<MobileApiClient['read']>();
const mockPush = jest.fn();
const mockClient = { read: mockRead, request: jest.fn() };
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => {} }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const s = (o: Partial<ProgressStageSummary>): ProgressStageSummary => ({
  id: 'cur', name: 'Déficit de primavera', kind: 'deficit', status: 'current', startsOn: '2026-09-29', endsOn: '2026-12-22',
  window: { start: '2026-09-29', end: '2026-10-16' }, elapsedDays: 18, plannedDays: 84, targetKcal: 1900, targetProteinG: 130,
  eatenKcal: 1960, eatenProteinG: 128, daysWithMeals: 18, weightPerWeekKg: -0.2, weighIns: 6, trainingDaysPerWeek: 4, trainingDays: 10, ...o,
});
const maint = s({ id: 'm', name: 'Mantenimiento', kind: 'maintenance', status: 'past', startsOn: '2026-06-16', endsOn: '2026-09-29', elapsedDays: 105, plannedDays: 105,
  targetKcal: 2300, eatenKcal: 2310, daysWithMeals: 98, weightPerWeekKg: 0.1, trainingDaysPerWeek: 4.2 });
const first = s({ id: 'f', name: 'Primer déficit', status: 'past', startsOn: '2026-03-03', endsOn: '2026-06-16', elapsedDays: 105, plannedDays: 105,
  targetKcal: 2000, eatenKcal: null, daysWithMeals: 0, weightPerWeekKg: -0.5, trainingDaysPerWeek: 3.8 });
const ok = { nutrition: 'ok', body: 'ok', training: 'ok' } as const;
const data = (stages: ProgressStageSummary[], o: Partial<ProgressStages> = {}): ProgressStages => ({ today: '2026-10-16', stages, hasUpcoming: false, sources: ok, ...o });
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const screen = () => render(<SafeAreaInsetsContext.Provider value={{ top: 0, right: 0, bottom: 0, left: 0 }}>
  <OwnlevelThemeProvider><ProgressStagesScreen /></OwnlevelThemeProvider></SafeAreaInsetsContext.Provider>);

beforeEach(() => { jest.clearAllMocks(); });

describe('stages model', () => {
  it('formats dates with an exclusive end and the week of a running stage', () => {
    expect(stageDates(s({}))).toBe('29 sep → 21 dic');
    expect(stageDates(s({ endsOn: null }))).toBe('desde 29 sep');
    expect(stageLength(s({}))).toBe('semana 3 de 12');
    expect(stageLength(maint)).toBe('15 sem');
  });
  it('never turns missing into 0 and names an unreadable source', () => {
    const rows = stageRows(ok);
    expect(rows.find(r => r.key === 'eaten')!.value(first)).toBe('Sin dato');
    expect(rows.find(r => r.key === 'weight')!.value(s({}))).toBe('↘ 0,2 kg');
    expect(stageRows({ ...ok, body: 'unavailable' }).find(r => r.key === 'weight')!.value(s({}))).toBe('No disponible');
  });
  it('builds the Progreso row, the default comparison and chart bands from the stages list', () => {
    const list = { today: '2026-10-16', listVersion: 1, sequences: [], suggestions: null, upcoming: [],
      current: { id: 'cur', name: 'Déficit de primavera', kind: 'deficit', startsOn: '2026-09-29', endsOn: '2026-12-22', status: 'current' },
      past: [{ id: 'm', name: 'Mantenimiento', kind: 'maintenance', startsOn: '2026-06-16', endsOn: '2026-09-29', status: 'past' }] } as unknown as NutritionStages;
    expect(stagesRowDetail(list)).toBe('Déficit de primavera · semana 3 de 12');
    expect(stagesRowDetail(null)).toBeNull();
    expect(defaultCompare([s({}), maint, first], 'cur')).toBe('m');
    expect(defaultCompare([s({}), maint, first], 'f')).toBe('cur');
    expect(chartBands(list, ['2026-09-01', '2026-10-10']).map(b => [b.id, b.current])).toEqual([['m', false], ['cur', true]]);
    expect(chartBands(list, ['2026-01-01'])).toEqual([]);
  });
});

describe('Tus etapas', () => {
  it('opens on the current stage and compares with the previous one before showing everything', async () => {
    mockRead.mockResolvedValue({ status: 'ok', data: data([s({}), maint, first]), meta });
    const view = screen();
    await waitFor(() => expect(view.getByTestId('stages-selected')).toBeTruthy());
    expect(view.getByText('AHORA')).toBeTruthy();
    expect(view.getAllByText('1.960').length).toBe(2);
    expect(view.getByTestId('stages-pair')).toBeTruthy();
    expect(view.getAllByText('Mantenimiento').length).toBeGreaterThan(0);
    expect(view.queryByTestId('stages-all')).toBeNull();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Ver las 3 etapas' })); });
    expect(view.getByTestId('stages-all')).toBeTruthy();
    expect(view.getAllByText('Sin dato').length).toBeGreaterThan(0);
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Ver Primer déficit' })); });
    expect(view.getByText('ETAPA')).toBeTruthy();
  });
  it('with one stage there is nothing to compare yet and it offers to program the next', async () => {
    mockRead.mockResolvedValue({ status: 'ok', data: data([s({})]), meta });
    const view = screen();
    await waitFor(() => expect(view.getByTestId('stages-single')).toBeTruthy());
    expect(view.queryByTestId('stages-compare')).toBeNull();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Programar la próxima etapa' })); });
    expect(mockPush).toHaveBeenCalledWith('/settings/stage-action');
  });
  it('is unavailable (not empty) when the read fails', async () => {
    mockRead.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { ...meta, httpStatus: null, outcome: 'unavailable' } });
    const view = screen();
    await waitFor(() => expect(view.getByText('No pudimos cargar tus etapas')).toBeTruthy());
    expect(view.queryByText('Todavía no tenés etapas')).toBeNull();
  });
});

describe('stage bands in the chart', () => {
  it('draws a band behind the points of each stage, labeled once', () => {
    const points = ['2026-09-27', '2026-09-28', '2026-09-30', '2026-10-02'].map(d => ({ key: d, label: d, value: 84, text: '84 kg' }));
    const view = render(<OwnlevelThemeProvider><PeriodChart testID="c" mode="dots" points={points}
      bands={[{ id: 'm', start: '2026-06-16', end: '2026-09-29', label: 'Mantenimiento', current: false }, { id: 'cur', start: '2026-09-29', end: null, label: 'Déficit', current: true }]} /></OwnlevelThemeProvider>);
    expect(view.getAllByTestId(/^c-band-m-/)).toHaveLength(2);
    expect(view.getAllByTestId(/^c-band-cur-/)).toHaveLength(2);
    expect(view.getAllByText('Déficit')).toHaveLength(1);
  });
});
