import { act, renderHook, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from '@/api/client';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { definition as mockDefinition } from '@/metrics/definitions-fixture.test-helper';
import {
  useHomeMetricEntry,
  type QuickMetricTap,
} from './use-home-metric-entry';
const mockRead = jest.fn<MobileApiClient['read']>(),
  mockRequest = jest.fn<MobileApiClient['request']>();
const mockClient = { read: mockRead, request: mockRequest };
const mockMemory = new Map<string, string>();
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/auth', () => ({
  useMobileAuth: () => ({ session: { user: { id: 'owner' } } }),
}));
jest.mock('@/nutrition/day-format', () => ({
  ...jest.requireActual<object>('@/nutrition/day-format'),
  nutritionToday: () => '2026-10-02',
}));
jest.mock('@/metrics/presentation-provider', () => ({
  useMetricPresentations: () => [
    mockDefinition({
      id: '41100000-0000-4000-8000-000000000003',
      name: 'Agua',
      systemKey: 'water',
      valueType: 'decimal',
      unit: 'L',
      quickValue: 0.25,
      icon: 'book',
    }),
  ],
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockMemory.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mockMemory.set(k, v);
    },
    removeItem: async (k: string) => {
      mockMemory.delete(k);
    },
  },
}));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
let day: MobileNutritionDayResponse;
const metric = () => {
  if (day.activity.status !== 'ok') throw new Error('fixture');
  return day.activity.data.metrics[0];
};
const tap = (): QuickMetricTap => ({
  value: metric().value,
  updatedAt: metric().updatedAt,
  definitionUpdatedAt: metric().definitionUpdatedAt,
  portion: 0.25,
  date: day.date,
});
const id = '41100000-0000-4000-8000-000000000003';
beforeEach(() => {
  jest.clearAllMocks();
  mockMemory.clear();
  day = nutritionFixture();
  metric().value = 1.5;
  mockRead.mockImplementation(
    async () =>
      ({ status: 'ok', data: JSON.parse(JSON.stringify(day)), meta }) as never,
  );
  mockRequest.mockImplementation(async (options) => {
    const intent = options.body as {
      changes: { value: number; expectedUpdatedAt: string | null }[];
    };
    if (intent.changes[0].expectedUpdatedAt !== metric().updatedAt)
      return {
        status: 'conflict',
        code: 'METRICS_CHANGED',
        message: 'El valor cambió.',
        meta,
      } as never;
    metric().value = intent.changes[0].value;
    metric().updatedAt = '2026-10-02T13:00:00.123456Z';
    return {
      status: 'ok',
      data: { status: 'saved', operation: 'metrics', date: day.date },
      meta,
    } as never;
  });
});
describe('Home quick entry orchestration', () => {
  it('blocks the second synchronous tap and writes the displayed snapshot exactly once', async () => {
    const onSaved = jest.fn(),
      hook = renderHook(() => useHomeMetricEntry(onSaved));
    await waitFor(() => expect(hook.result.current.locked).toBe(false));
    const visible = tap();
    await act(async () => {
      await Promise.all([
        hook.result.current.open(id, visible),
        hook.result.current.open(id, visible),
      ]);
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(metric().value).toBe(1.75);
    expect(onSaved).toHaveBeenCalled();
    expect(mockRequest.mock.calls[0][0].body).toMatchObject({
      operation: 'metrics',
      changes: [
        { metricId: id, value: 1.75, expectedUpdatedAt: visible.updatedAt },
      ],
    });
  });
  it('a server conflict rereads without another increment; a stale visible timestamp also never writes', async () => {
    const hook = renderHook(() => useHomeMetricEntry(jest.fn()));
    await waitFor(() => expect(hook.result.current.locked).toBe(false));
    const visible = tap();
    metric().value = 2;
    metric().updatedAt = '2026-10-02T12:00:00.000001Z';
    await act(async () => {
      await hook.result.current.open(id, visible);
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(metric().value).toBe(2);
    expect(hook.result.current.error).toBeNull();
    const stale = { ...tap(), updatedAt: '2026-10-02T12:00:00.000002Z' };
    await act(async () => {
      await hook.result.current.open(id, stale);
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(metric().value).toBe(2);
  });
});
