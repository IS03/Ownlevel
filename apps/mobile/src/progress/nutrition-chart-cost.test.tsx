import { act, fireEvent, render } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import { RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { ReportQuery } from '@/api/nutrition-report';
import { TIMING_BANDS, type ProgressNutritionTiming } from '@/api/progress';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import { reportFixture } from '@/nutrition/report-fixture.test-helper';
import { NutritionTrendsScreen } from './nutrition-trends-screen';
import { ProgressRangeProvider } from './progress-range-context';
const mockClient = {} as MobileApiClient, mockPush = jest.fn();
const mockReport = jest.fn(async (_client: unknown, q: ReportQuery) => ({ status: 'ok' as const, data: reportFixture(q), meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' as const } }));
const mockTiming = jest.fn(async (_client: unknown, q: ReportQuery) => {
  const r = reportFixture(q);
  const data: ProgressNutritionTiming = { today: r.today, period: { preset: q.period, start: r.range.start, end: r.range.end, days: r.range.days, previousStart: '2026-09-01', previousEnd: '2026-09-04', bucket: 'day', includesToday: r.range.end === r.today },
    current: { meals: 0, mealsWithTime: 0, kcal: 0, proteinG: 0, bands: TIMING_BANDS.map(key => ({ key, kcal: 0, proteinG: 0, kcalShare: null, proteinShare: null })) }, reference: null };
  return { status: 'ok' as const, data, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' as const } };
});
const mockFocus = new Set<{ focus: () => void; blur: () => void }>();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/api/nutrition-report', () => ({ ...jest.requireActual<object>('@/api/nutrition-report'), fetchNutritionReport: (c: unknown, q: ReportQuery) => mockReport(c, q) }));
jest.mock('@/api/progress', () => ({ ...jest.requireActual<object>('@/api/progress'), fetchProgressNutritionTiming: (c: unknown, q: ReportQuery) => mockTiming(c, q) }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => ({}), useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      let release: void | (() => void), active = false;
      const life = { focus: () => { if (!active) { active = true; release = callback(); } }, blur: () => { if (active) { active = false; release?.(); } } };
      mockFocus.add(life); life.focus();
      return () => { life.blur(); mockFocus.delete(life); };
    }, [callback]);
  },
}));
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
const reads = () => ({ reports: mockReport.mock.calls.length, timing: mockTiming.mock.calls.length });
it('measures source reads and existing cache/focus separately from the destination of navigation', async () => {
  clearConfirmedReads(mockClient);
  const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday="2026-10-04" initialState={{ unit: 'month', anchor: '2026-10-04', custom: null, compare: { kind: 'previous' } }}><NutritionTrendsScreen /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);
  await flush(); const initial = reads();
  fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-01-bar')); await flush(); const inspected = reads();
  expect(inspected).toEqual(initial);
  act(() => mockFocus.forEach(f => f.blur())); act(() => mockFocus.forEach(f => f.focus())); await flush(); const returned = reads();
  expect(returned).toEqual(initial);
  act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush(); const manual = reads();
  console.info('[QA nutrition source cost]', { initial, inspected, returned, manual, pointNavigationActions: mockPush.mock.calls.length });
  expect(manual.reports).toBeGreaterThan(initial.reports);
  view.unmount();
});
