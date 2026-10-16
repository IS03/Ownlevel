import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useTweenedNumber } from './use-tweened-number';

jest.mock('@/design-system', () => ({ ...jest.requireActual<object>('@/design-system'), useReduceMotion: () => false }));

describe('useTweenedNumber', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });
  it('counts from the value on screen to the new one, ending exact at the target precision', () => {
    const view = renderHook(({ value }: { value: number | null }) => useTweenedNumber(value), { initialProps: { value: 1674 as number | null } });
    view.rerender({ value: 2174 });
    expect(view.result.current).toBe(1674);
    act(() => { jest.advanceTimersByTime(200); });
    const mid = view.result.current!;
    expect(mid).toBeGreaterThan(1674); expect(mid).toBeLessThan(2174); expect(Number.isInteger(mid)).toBe(true);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(view.result.current).toBe(2174);
  });
  it('missing never animates: to and from null it switches at once', () => {
    const view = renderHook(({ value }: { value: number | null }) => useTweenedNumber(value), { initialProps: { value: 137.5 as number | null } });
    view.rerender({ value: null });
    expect(view.result.current).toBeNull();
    view.rerender({ value: 90 });
    expect(view.result.current).toBe(90);
  });
});
