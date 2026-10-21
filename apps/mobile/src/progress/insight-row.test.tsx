import { useEffect } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { ProgressInsight } from '@/api/progress-insight';
import { InsightRow } from './insight-row';
import { ProgressRangeProvider, useProgressRange } from './progress-range-context';

const mockPush = jest.fn();
const mockFetch = jest.fn<() => Promise<unknown>>();
const mockDismiss = jest.fn<(c: unknown, key: string) => Promise<unknown>>();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const mockClient = { request: jest.fn(), read: jest.fn() };
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/api/progress-insight', () => ({ ...jest.requireActual<object>('@/api/progress-insight'),
  fetchProgressInsight: () => mockFetch(), dismissProgressInsight: (c: unknown, key: string) => mockDismiss(c, key) }));

const TODAY = '2026-10-15';
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const period = { preset: '3m' as const, start: '2026-08-01', end: TODAY, days: 76, previousStart: '2026-05-17', previousEnd: '2026-07-31', bucket: 'week' as const, includesToday: true };
const insight: ProgressInsight = { today: TODAY, insight: { key: 'training_water', data: { today: TODAY, period, reference: null,
  definition: { split: 'day.training', cut: 'yes', lag: 0, outcome: 'metric.cddcae61-5e78-45a8-984d-0283d3367a86' },
  measure: { split: { key: 'day.training', label: 'Día de entrenamiento', unit: null, valueType: 'boolean' }, outcome: { key: 'metric.cddcae61-5e78-45a8-984d-0283d3367a86', label: 'Agua', unit: 'L', valueType: 'decimal' } },
  current: { status: 'ok', pairs: 34, cut: null, low: { days: [], average: 1.5 }, high: { days: [], average: 2.6 }, difference: 1.1, differencePercent: 73, evidence: 'clear' } } } };
const seenUnit = jest.fn<(u: string) => void>();
function Unit() { const u = useProgressRange().state.unit; useEffect(() => { seenUnit(u); }, [u]); return null; }
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const wrap = () => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY}><InsightRow /><Unit /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);

beforeEach(() => { jest.clearAllMocks(); mockFetch.mockResolvedValue({ status: 'ok', data: insight, meta }); });

describe('Automatic insight row', () => {
  it('says what happened, neutrally, with how many days; "Ver" opens the answer on the last 3 months', async () => {
    const view = wrap(); await flush();
    expect(view.getByText('Notamos algo en tus datos')).toBeTruthy();
    expect(view.getByText(/Los días que entrenaste registraste en promedio 2,6 L\. Los días sin entrenar, 1,5 L\. Pasó en 34 días de los últimos 3 meses\./)).toBeTruthy();
    fireEvent.press(view.getByTestId('progress-insight-open'));
    await flush();
    expect(seenUnit).toHaveBeenLastCalledWith('3m');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/influence/answer', params: { ...insight.insight!.data.definition, lag: '0', key: 'training_water' } });
  });
  it('"No me interesa" hides it only once saved; a failure says so and keeps it', async () => {
    mockDismiss.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta });
    const view = wrap(); await flush();
    fireEvent.press(view.getByTestId('progress-insight-dismiss')); await flush();
    expect(view.getByText('No pudimos guardarlo. Probá de nuevo.')).toBeTruthy();
    mockDismiss.mockResolvedValueOnce({ status: 'ok', data: { key: 'training_water' }, meta });
    fireEvent.press(view.getByTestId('progress-insight-dismiss')); await flush();
    expect(mockDismiss).toHaveBeenLastCalledWith(mockClient, 'training_water');
    expect(view.queryByTestId('progress-insight')).toBeNull();
  });
  it('shows nothing when there is no insight or the read fails', async () => {
    mockFetch.mockResolvedValueOnce({ status: 'ok', data: { today: TODAY, insight: null }, meta });
    const none = wrap(); await flush();
    expect(none.queryByTestId('progress-insight')).toBeNull();
    mockFetch.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta });
    const failed = wrap(); await flush();
    expect(failed.queryByTestId('progress-insight')).toBeNull();
  });
});
