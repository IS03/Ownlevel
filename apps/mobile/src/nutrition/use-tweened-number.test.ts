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
  describe('fromEmpty (#510, rings only)', () => {
    const hook = (initial: number | null) => renderHook(({ value }: { value: number | null }) => useTweenedNumber(value, undefined, { fromEmpty: true }), { initialProps: { value: initial } });
    it('a first value after mount counts up from an empty ring: never the full ring first, and it ends exact', () => {
      const view = hook(null);
      expect(view.result.current).toBeNull(); // missing stays missing
      view.rerender({ value: 12900 });
      expect(view.result.current).toBe(0);
      act(() => { jest.advanceTimersByTime(250); });
      const mid = view.result.current!;
      expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(12900);
      act(() => { jest.advanceTimersByTime(1500); });
      expect(view.result.current).toBe(12900);
    });
    it('mounting with a value never animates, and a value going back to missing is missing at once', () => {
      const view = hook(8000);
      expect(view.result.current).toBe(8000);
      view.rerender({ value: null });
      expect(view.result.current).toBeNull();
    });
    it('without the option the first value still switches at once (the default contract)', () => {
      const view = renderHook(({ value }: { value: number | null }) => useTweenedNumber(value), { initialProps: { value: null as number | null } });
      view.rerender({ value: 90 });
      expect(view.result.current).toBe(90);
    });
  });
});
