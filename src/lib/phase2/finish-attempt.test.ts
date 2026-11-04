import { describe, expect, it, vi } from 'vitest';
import { runWorkoutFinishAttempt } from './finish-attempt';
import { TrainingFeelingsJournal, type FeelingsStorage } from '../mobile-api/training-feelings-journal';
describe('Web finish transient recovery', () => {
  it('releases every fence even when refresh rejects unexpectedly, without cleaning an uncertain intent', async () => {
    const release = vi.fn(), notify = vi.fn(), clear = vi.fn();
    await expect(runWorkoutFinishAttempt(async () => { await Promise.reject(Error('lock rejected')); clear(); }, release, notify)).resolves.toBeUndefined();
    expect(release).toHaveBeenCalledOnce(); expect(notify).toHaveBeenCalledOnce(); expect(clear).not.toHaveBeenCalled();
  });
  it('preserves a frozen finish through lock failure and retries its original body after the lock recovers', async () => {
    const records = new Map<string, string>();
    const storage: FeelingsStorage = { getItem: async k => records.get(k) ?? null, setItem: async (k, v) => { records.set(k, v); }, lock: async (_k, f) => f() };
    const state = { contractVersion: 'training-feelings/1' as const, sessionId: '93670000-0000-4000-8000-000000000010', sessionStatus: 'in_progress' as const, sessionUpdatedAt: '2026-11-04T12:00:00Z', endedAt: null, revision: 0, values: {} };
    const write = vi.fn(async () => ({ status: 'unavailable' }));
    const j = new TrainingFeelingsJournal(storage, { read: async () => ({ status: 'ok', data: state }), write }, 'owner', state.sessionId, 'web', () => 'exact:finish');
    await j.refresh(); await j.change('energyPost', 4); const input = await j.prepareFinish({}); const durable = records.get(j.key);
    storage.lock = () => Promise.reject(Error('lock denied'));
    const release = vi.fn(), notify = vi.fn();
    await runWorkoutFinishAttempt(async () => { await j.refresh(); if (j.getSnapshot().localError) throw Error('blocked'); await j.retry(); }, release, notify);
    expect(release).toHaveBeenCalledOnce(); expect(notify).toHaveBeenCalledOnce(); expect(write).not.toHaveBeenCalled(); expect(records.get(j.key)).toBe(durable);
    storage.lock = async (_k, f) => f(); await j.refresh(); await j.retry(); expect(write).toHaveBeenCalledWith(input);
  });
});
