import { describe, expect, it, jest } from '@jest/globals';

import { ApiResourceController, shouldRefreshOnForeground } from './resource';
import type { MobileApiReadResult } from './results';

function ok<T>(data: T): MobileApiReadResult<T> {
  return {
    status: 'ok',
    data,
    meta: { durationMs: 20, httpStatus: 200, outcome: 'ok' },
  };
}

describe('API resource refresh', () => {
  it('loads initially and deduplicates overlapping refreshes', async () => {
    let resolveRequest: ((value: MobileApiReadResult<string>) => void) | undefined;
    const loader = jest.fn(
      () => new Promise<MobileApiReadResult<string>>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const controller = new ApiResourceController(loader, () => 1_000);

    const initial = controller.refresh('initial');
    const overlapping = controller.refresh('manual');

    expect(loader).toHaveBeenCalledTimes(1);
    expect(overlapping).toBe(initial);
    resolveRequest?.(ok('confirmed'));
    await initial;
    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      current: { data: 'confirmed', confirmedAt: 1_000 },
      refreshing: false,
    });
  });

  it('reload supersedes a read in flight: the older response never replaces newer truth', async () => {
    const pending: ((value: MobileApiReadResult<string>) => void)[] = [];
    const signals: AbortSignal[] = [];
    const loader = jest.fn((signal: AbortSignal) => new Promise<MobileApiReadResult<string>>((resolve) => {
      signals.push(signal); pending.push(resolve);
    }));
    const controller = new ApiResourceController(loader, () => 1_000);
    const before = controller.refresh('manual');
    const after = controller.reload('manual');
    expect(loader).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(true);
    pending[1](ok('after write'));
    await after;
    pending[0](ok('before write'));
    await before;
    expect(controller.getSnapshot()).toMatchObject({ status: 'ready', current: { data: 'after write' } });
  });

  it('preserves prior data as explicitly stale when refresh is unavailable', async () => {
    const loader = jest
      .fn<() => Promise<MobileApiReadResult<string>>>()
      .mockResolvedValueOnce(ok('first'))
      .mockResolvedValueOnce({
        status: 'unavailable',
        reason: 'network',
        meta: { durationMs: 30, httpStatus: null, outcome: 'unavailable' },
      });
    const controller = new ApiResourceController(loader, () => 2_000);

    await controller.refresh('initial');
    const refresh = controller.refresh('manual');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      refreshing: true,
      trigger: 'manual',
    });
    await refresh;

    expect(controller.getSnapshot()).toMatchObject({
      status: 'unavailable',
      reason: 'network',
      previous: { data: 'first', confirmedAt: 2_000 },
    });
  });

  it('supports a foreground-triggered refresh', async () => {
    const loader = jest.fn(async () => ok('foreground'));
    const controller = new ApiResourceController(loader);

    await controller.refresh('foreground');

    expect(loader).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      trigger: 'foreground',
    });
    expect(shouldRefreshOnForeground('background', 'active')).toBe(true);
    expect(shouldRefreshOnForeground('active', 'active')).toBe(false);
  });
});
