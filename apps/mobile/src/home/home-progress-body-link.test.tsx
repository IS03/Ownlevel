import { describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import type { ProgressBody, ProgressBodyMetric } from '@/api/progress';
import { ProgressRangeProvider, useProgressRange } from '@/progress/progress-range-context';
import { initialProgressRange, progressRange, progressStateForRange, type ProgressRangeState } from '@/progress/progress-range';
import { useProgressRouteRange } from '@/progress/use-progress-route-range';

import { selectProgressRows } from './home-progress-selection';
import { homeProgressBody, homeProgressRecords } from './home-test-fixtures';

/**
 * #497: the measure note can be up to 30 days old, and the Body route reads `from`/`to` from the URL (never `period`) into the
 * range Progress shares. The link must resolve to a range that contains the record, whatever range Progress had selected.
 */
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

const TODAY = '2026-10-10';
const day = (offset: number) => { const d = new Date(`${TODAY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const observation = (date: string) => ({ date, value: 90.5, imported: false, provenanceLabel: 'Registro' });
const waist = (date: string): ProgressBodyMetric => {
  const latest = observation(date);
  return { key: 'body.waist', label: 'Cintura', unit: 'cm', latest, first: latest, last: latest, change: null, referenceChange: null, trend: 'unavailable',
    confidence: 'unavailable', observations: [latest], referenceCount: 0, comparison: { status: 'insufficient_data', reason: 'insufficient_previous_samples' } };
};
const linkFor = (date: string) => {
  const body: ProgressBody = { ...homeProgressBody(), metrics: [waist(date)] };
  const row = selectProgressRows({ body: { data: body, confirmedAt: 1, status: 'ready' }, date: TODAY, records: { data: homeProgressRecords(), confirmedAt: 1, status: 'ready' } })
    .find(candidate => candidate.id === 'measure');
  return row?.target as { kind: 'body'; metric: string; from: string; to: string } | undefined;
};
const at = (patch: Partial<ProgressRangeState>): ProgressRangeState => ({ ...initialProgressRange(TODAY), ...patch });

describe('the measure link resolves in the shared Progress range', () => {
  // What Progress may have selected when the user taps the note: this week, this month, last 3 months, a short custom range.
  const selected: [string, ProgressRangeState][] = [
    ['this week', at({ unit: 'week' })], ['this month', at({ unit: 'month' })], ['3 months', at({ unit: '3m' })],
    ['a custom range of the last days', at({ unit: 'custom', custom: { start: day(-3), end: TODAY } })],
  ];

  it.each([8, 12, 20, 29, 30])('a measure of %i days ago: the link resolves, whatever range Progress had selected, to one that contains it', age => {
    const target = linkFor(day(-age))!;
    expect(target.metric).toBe('body.waist');
    for (const [, state] of selected) {
      const resolved = progressStateForRange(target.from, target.to, state, TODAY);
      expect(resolved).not.toBeNull();
      const range = progressRange(resolved!, TODAY);
      expect(range.start <= day(-age) && day(-age) <= range.end).toBe(true);
    }
  });

  it('proves the bug the link fixes: the week or the short custom range Progress had does not contain a 20-day-old measure', () => {
    const date = day(-20);
    expect(progressRange(at({ unit: 'week' }), TODAY).start > date).toBe(true);
    expect(progressRange(at({ unit: 'custom', custom: { start: day(-3), end: TODAY } }), TODAY).start > date).toBe(true);
  });

  it('the 30-day edge and the recent day both resolve', () => {
    for (const age of [0, 1, 30]) {
      const target = linkFor(day(-age))!, range = progressRange(progressStateForRange(target.from, target.to, at({ unit: 'week' }), TODAY)!, TODAY);
      expect(range).toEqual({ start: day(-30), end: TODAY });
    }
    expect(linkFor(day(-31))).toBeUndefined();
  });

  it('useProgressRouteRange applies the link: the shared range switches to one that contains the record', () => {
    const date = day(-20), target = linkFor(date)!;
    mockParams = { metric: target.metric, from: target.from, to: target.to };
    const wrapper = ({ children }: PropsWithChildren) => <ProgressRangeProvider initialToday={TODAY} initialState={at({ unit: 'week' })}>{children}</ProgressRangeProvider>;
    const { result } = renderHook(() => ({ applied: useProgressRouteRange(), range: useProgressRange() }), { wrapper });
    expect(result.current.applied).toBe(true);
    const range = progressRange(result.current.range.state, TODAY);
    expect(range.start <= date && date <= range.end).toBe(true);
    expect(range).toEqual({ start: day(-30), end: TODAY });
  });

  it('an old link without from/to (period only) leaves the shared range alone: the case the measure link no longer uses', () => {
    mockParams = { metric: 'body.waist', period: '7' };
    const wrapper = ({ children }: PropsWithChildren) => <ProgressRangeProvider initialToday={TODAY} initialState={at({ unit: 'week' })}>{children}</ProgressRangeProvider>;
    const { result } = renderHook(() => ({ applied: useProgressRouteRange(), range: useProgressRange() }), { wrapper });
    expect(progressRange(result.current.range.state, TODAY).start).toBe(progressRange(at({ unit: 'week' }), TODAY).start);
  });
});
