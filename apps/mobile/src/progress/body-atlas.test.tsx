import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Dimensions, StyleSheet } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import type { ProgressBody, ProgressBodyMetric } from '@/api/progress';
import { BODY_CHOICES, BodyJournal, BodyMetricPicker, BodyRecordComparison, BodyZones, bodyDatePair, bodyDates } from './body-atlas';
const mockPush = jest.fn(), mockSetParams = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, setParams: mockSetParams }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const obs = (date: string, value: number) => ({ date, value, imported: false, provenanceLabel: 'Registro manual' });
const metric = (key: string, label: string, observations: ProgressBodyMetric['observations']): ProgressBodyMetric => ({
  key, label, unit: key === 'body.weight' ? 'kg' : 'cm', latest: observations.at(-1) ?? null,
  first: observations[0] ?? null, last: observations.at(-1) ?? null, change: null, referenceChange: null,
  trend: 'unavailable', confidence: 'limited', observations, referenceCount: 0, comparison: { status: 'insufficient_data', reason: 'previous_period_empty' },
});
const weight = metric('body.weight', 'Peso', [obs('2026-11-01', 72), obs('2026-11-18', 71.8)]);
const waist = metric('body.waist', 'Cintura', [obs('2026-11-08', 80)]);
const data: ProgressBody = { metrics: [weight, waist], today: '2026-11-18', period: { start: '2026-10-20', end: '2026-11-18', preset: '30', days: 30, previousStart: '2026-09-20', previousEnd: '2026-10-19', bucket: 'week', includesToday: true }, excludedSuspect: 1 };
const wrap = (children: React.ReactNode, mode: 'light' | 'dark' = 'light') => render(<OwnlevelThemeProvider initialMode={mode}>{children}</OwnlevelThemeProvider>);

describe('Body atlas data truth', () => {
  it('never carries a measure to a date without a record, and compares only exact valid pairs', () => {
    expect(bodyDatePair(waist, '2026-11-01', '2026-11-18')).toEqual({ first: null, last: null, change: null });
    expect(bodyDatePair(weight, '2026-11-01', '2026-11-18').change).toBeCloseTo(-0.2);
    expect(bodyDatePair(weight, '2026-11-18', '2026-11-18').change).toBeNull();
    expect(bodyDates([metric('body.weight', 'Peso', [obs('2026-11-01', 0), obs('2026-11-02', -2), obs('2026-11-03', NaN)])])).toEqual([]);
  });
  it.each(['light', 'dark'] as const)('keeps every zone discoverable and uses actual per-field dates in %s mode', mode => {
    const view = wrap(<BodyZones data={data} />, mode);
    expect(view.getByRole('button', { name: /Tronco. Cintura, 80 cm, 8 nov 2026/ })).toBeTruthy();
    expect(view.getByRole('button', { name: /Brazo izquierdo, sin registro válido/ })).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: /Tronco. Cintura, 80 cm,/ }));
    expect(view.getByRole('button', { name: /Cadera, sin registro válido/ })).toBeTruthy();
  });
  it('shows missing exact dates in comparison without borrowing the latest waist value', () => {
    const view = wrap(<BodyRecordComparison metrics={data.metrics} />);
    fireEvent.press(view.getByRole('button', { name: 'Comparar registros' }));
    expect(view.getByText('1 medida con dato en ambas fechas.')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver medidas sin dato para comparar (1)' }));
    expect(view.getByText('Sin registro → Sin registro')).toBeTruthy();
    expect(view.queryByText('80 cm')).toBeNull();
  });
  it('offers all eleven dimensions, including dimensions never recorded', () => {
    const view = wrap(<BodyMetricPicker selected="body.weight" />);
    fireEvent.press(view.getByRole('button', { name: 'Explorar · Peso' }));
    for (const item of BODY_CHOICES) expect(view.getByRole('button', { name: item.label })).toBeTruthy();
  });
  it('groups the cuaderno by exact date and keeps access to excluded originals', () => {
    const view = wrap(<BodyJournal data={data} />);
    fireEvent.press(view.getByRole('button', { name: 'Ver original del 8 nov 2026' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/body', params: { date: '2026-11-08', bodyChartReturn: '1', bodyChartMetric: '' } });
    expect(view.getByText(/1 medición sospechosa no cuenta/)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Ver historial y registros originales' })).toBeTruthy();
  });
  it('keeps a long cuaderno bounded and reveals older days on demand', () => {
    const points = Array.from({ length: 30 }, (_, i) => obs(`2026-11-${String(i + 1).padStart(2, '0')}`, 72));
    const view = wrap(<BodyJournal data={{ ...data, metrics: [metric('body.weight', 'Peso', points)] }} />);
    expect(view.queryByText('1 nov 2026')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Ver más días del período' }));
    expect(view.getByText('1 nov 2026')).toBeTruthy();
  });
  it('stacks zone cards for Dynamic Type', () => {
    const initial = Dimensions.get('window');
    Dimensions.set({ window: { ...initial, fontScale: 2 }, screen: Dimensions.get('screen') });
    try {
      const view = wrap(<BodyZones data={data} />);
      expect(StyleSheet.flatten(view.getByTestId('body-zone-Tronco').props.style).width).toBe('100%');
    } finally { Dimensions.set({ window: initial, screen: Dimensions.get('screen') }); }
  });
});
