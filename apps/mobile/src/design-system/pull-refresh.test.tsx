import { act, renderHook } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import { usePullRefresh, type PullRead } from './pull-refresh';

it('shows only a user-initiated refresh, ignores repeated pulls, and clears on both outcomes', async () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const first = new Promise<void>(done => { resolve = done; });
  const second = new Promise<void>((_, fail) => { reject = fail; });
  const read = jest.fn<PullRead>().mockReturnValueOnce(first).mockReturnValueOnce(second);
  const { result, rerender } = renderHook(() => usePullRefresh(read));
  expect(result.current.refreshing).toBe(false);
  rerender({});
  expect(read).not.toHaveBeenCalled();
  act(() => { result.current.onRefresh(); result.current.onRefresh(); });
  expect(read).toHaveBeenCalledTimes(1);
  expect(result.current.refreshing).toBe(true);
  await act(async () => resolve());
  expect(result.current.refreshing).toBe(false);
  act(() => result.current.onRefresh());
  expect(result.current.refreshing).toBe(true);
  await act(async () => reject(new Error('offline')));
  expect(result.current.refreshing).toBe(false);
});
