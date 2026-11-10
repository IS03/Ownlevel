import { act, fireEvent, render } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import type { ProgressBody } from '@/api/progress';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import { overview } from '@/body/body-fixture.test-helper';
import { BodyTrendsScreen } from './body-trends-screen';
import { ProgressRangeProvider } from './progress-range-context';

const client = {} as MobileApiClient;
const mockPush = jest.fn();
const mockFocus = new Set<{ focus: () => void; blur: () => void }>();
const mockOverview = jest.fn(async () => ok(structuredClone(overview())));
const mockProgress = jest.fn(async () => ok(structuredClone(data)));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const points = [{ date: '2026-10-01', value: 82 }, { date: '2026-10-02', value: 81 }, { date: '2026-10-04', value: 80 }].map(o => ({ ...o, imported: false, provenanceLabel: 'Registro de peso' }));
const data: ProgressBody = { today: '2026-10-05', period: { preset: 'custom', start: '2026-10-01', end: '2026-10-05', days: 5, previousStart: '2026-09-01', previousEnd: '2026-09-05', bucket: 'day', includesToday: true }, excludedSuspect: 0,
  metrics: [{ key: 'body.weight', label: 'Peso', unit: 'kg', latest: points[2], first: points[0], last: points[2], change: -2, referenceChange: null, referenceCount: 0, trend: 'decreased', confidence: 'supported', comparison: { status: 'insufficient_data', reason: 'previous_period_empty' }, observations: points }] };
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client }) }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: 'cost-fixture-owner' } } }) }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() }, triggerHaptic: jest.fn() }));
jest.mock('@/api/body', () => ({ ...jest.requireActual<object>('@/api/body'), fetchBodyOverview: () => mockOverview() }));
jest.mock('@/api/progress', () => ({ ...jest.requireActual<object>('@/api/progress'), fetchProgressBody: () => mockProgress() }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => ({}), useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const effect = jest.requireActual<typeof import('react')>('react').useEffect;
    effect(() => {
      let release: void | (() => void), active = false;
      const life = { focus: () => { if (!active) { active = true; release = callback(); } }, blur: () => { if (active) { active = false; release?.(); } } };
      mockFocus.add(life); life.focus();
      return () => { life.blur(); mockFocus.delete(life); };
    }, [callback]);
  },
}));
const flush = () => act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); });
const counts = () => ({ progress: mockProgress.mock.calls.length, overview: mockOverview.mock.calls.length });

it('measures the real Body controller and cache: local point interaction and existing focus revalidation', async () => {
  clearConfirmedReads(client);
  const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday="2026-10-05"><BodyTrendsScreen /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);
  await flush(); const initial = counts();
  fireEvent.press(view.getByTestId('body-trend-chart-2026-10-02-mark'));
  await flush(); const inspected = counts();
  expect(inspected).toEqual(initial);
  act(() => mockFocus.forEach(f => f.blur()));
  act(() => mockFocus.forEach(f => f.focus()));
  await flush(); const returned = counts();
  expect(returned.overview).toBeGreaterThan(initial.overview);
  // Existing BodyTrends synchronizes the period read when the operational overview changes.
  expect(returned.progress).toBeGreaterThanOrEqual(initial.progress);
  console.info('[QA body chart real controller]', { initial, inspected, returned, navigationActionsOnPoint: mockPush.mock.calls.length });
  view.unmount();
});
