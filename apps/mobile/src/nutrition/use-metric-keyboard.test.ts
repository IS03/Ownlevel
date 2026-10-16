import { act, renderHook } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Keyboard, type KeyboardEvent } from 'react-native';
import { ReduceMotion, withTiming } from 'react-native-reanimated';
import { useMetricKeyboard } from './use-metric-keyboard';

afterEach(() => { jest.restoreAllMocks(); });

describe('metric keyboard uses native frame notifications instead of estimated per-frame heights', () => {
  it('animates both open and close to the native frame using its duration, and unsubscribes', () => {
    let notify!: (event: KeyboardEvent) => void;
    const remove = jest.fn();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
      expect(name).toBe('keyboardWillChangeFrame');
      notify = callback;
      return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
    const hook = renderHook(() => useMetricKeyboard());
    const event = (screenY: number, duration: number) => ({
      duration, easing: 'keyboard', endCoordinates: { screenY, screenX: 0, height: 300, width: 750 },
    }) as KeyboardEvent;
    jest.mocked(withTiming).mockClear();
    act(() => notify(event(100, 250)));
    expect(withTiming).toHaveBeenLastCalledWith(expect.any(Number), { duration: 250, easing: expect.anything(), reduceMotion: ReduceMotion.Never });
    expect(hook.result.current.height.value).toBeGreaterThan(0);
    expect(hook.result.current.target.value).toBe(hook.result.current.height.value);
    act(() => notify(event(10000, 350)));
    expect(withTiming).toHaveBeenLastCalledWith(0, { duration: 350, easing: expect.anything(), reduceMotion: ReduceMotion.Never });
    expect(hook.result.current.height.value).toBe(0);
    expect(hook.result.current.target.value).toBe(0);
    expect(hook.result.current.duration.value).toBe(350);
    // A hardware keyboard's bar shows up with no animation: the sheet still moves over a few frames, not in one.
    act(() => notify(event(700, 0)));
    expect(withTiming).toHaveBeenLastCalledWith(expect.any(Number), { duration: 250, easing: expect.anything(), reduceMotion: ReduceMotion.Never });
    expect(hook.result.current.duration.value).toBe(250);
    hook.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
