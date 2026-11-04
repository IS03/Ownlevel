import { describe, expect, it, vi } from 'vitest';
import { TrainingFeelingsJournal, type FeelingsInput, type FeelingsPort, type FeelingsResult, type FeelingsStorage } from './training-feelings-journal';
import type { FeelingsResponse } from './training-feelings-contract';
const sid = '93670000-0000-4000-8000-000000000010';
const initial = (): FeelingsResponse => ({ contractVersion: 'training-feelings/1', sessionId: sid, sessionStatus: 'in_progress', sessionUpdatedAt: '2026-11-04T10:00:00.123456Z', endedAt: null, revision: 0, values: {} });
function setup() {
  let server = initial(), key = 0, clock = new Date('2026-11-04T11:05:00Z');
  const values = new Map<string, string>(), receipts = new Map<string, FeelingsResponse>();
  const storage: FeelingsStorage = { getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v); }, lock: async (_key, action) => action() };
  const port: FeelingsPort = { read: vi.fn(async () => ({ status: 'ok', data: structuredClone(server) })), write: vi.fn(async (input: FeelingsInput) => {
    // Model only the published receipts/CAS contract; SQL guarantees retain #382's evidence.
    if (receipts.has(input.idempotencyKey)) return { status: 'ok', data: receipts.get(input.idempotencyKey)! };
    if (input.expectedRevision !== server.revision) return { status: 'conflict' };
    const next = structuredClone(server);
    for (const [key, value] of Object.entries(input.patch)) {
      const k = key as keyof typeof next.values;
      if (value.op === 'clear') delete next.values[k];
      else { next.values[k] = { value: value.value, instrumentVersion: value.instrumentVersion, declaredMoment: value.declaredMoment,
        declaredAt: value.declaredAt, capturedAt: value.capturedAt, source: value.source, receivedAt: clock.toISOString(), temporalQuality: 'unverified_client_clock' }; }
    }
    if (Object.keys(input.patch).length) next.revision++;
    if (input.operation === 'finish') { next.sessionStatus = 'completed'; next.endedAt = clock.toISOString(); }
    server = next; receipts.set(input.idempotencyKey, structuredClone(server)); return { status: 'ok', data: structuredClone(server) };
  }) };
  const journal = (user = 'owner', session = sid) => new TrainingFeelingsJournal(storage, port, user, session, 'web', () => `synthetic:${++key}`, () => clock);
  return { journal, values, storage, port, receipts, getServer: () => server, setServer: (s: FeelingsResponse) => { server = s; }, later: () => { clock = new Date('2026-11-05T11:05:00Z'); } };
}
describe('feelings journal ADOPT recovery', () => {
  it.each(['missing', 'rejected', 'throws'] as const)('contains a %s Web lock failure, retains exact intent and recovers exclusively', async failure => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.change('energyPost', 4);
    vi.mocked(f.port.write).mockResolvedValueOnce({ status: 'unavailable' }); await j.save();
    const before = f.values.get(j.key), pending = j.getSnapshot().pending;
    const errors: unknown[] = [], onUnhandled = (error: unknown) => errors.push(error);
    process.on('unhandledRejection', onUnhandled);
    try {
      f.storage.lock = failure === 'missing' ? undefined : failure === 'throws' ? () => { throw Error('lock denied'); } : () => Promise.reject(Error('lock denied'));
      await expect(j.refresh()).resolves.toBeNull();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(errors).toEqual([]); expect(j.getSnapshot()).toMatchObject({ localError: true, lockError: true, busy: false });
      expect(j.getSnapshot().error).toContain('bloqueo local'); expect(j.getSnapshot().pending).toEqual(pending); expect(f.values.get(j.key)).toBe(before);
      const lock = vi.fn(); f.storage.lock = async (key, action) => { lock(key); return action(); };
      await j.refresh(); expect(j.getSnapshot()).toMatchObject({ localError: false, lockError: false });
      await j.retry(); expect(lock).toHaveBeenCalledTimes(2); expect(vi.mocked(f.port.write).mock.calls.at(-1)![0]).toEqual(pending);
    } finally { process.off('unhandledRejection', onUnhandled); }
  });
  it('omission sends nothing; records a late capture at the actual interaction time and uses explicit clear', async () => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.save(); expect(f.port.write).not.toHaveBeenCalled();
    await j.change('energyPre', 4); f.later(); await j.save();
    expect(f.getServer().values.energyPre).toMatchObject({ value: 4, capturedAt: '2026-11-04T11:05:00.000Z', declaredMoment: 'pre' });
    await j.change('fatiguePost', 1); await j.change('energyPre', null); await j.save();
    expect(f.getServer().values).toEqual({ fatiguePost: expect.objectContaining({ value: 1 }) });
    expect(vi.mocked(f.port.write).mock.calls[1][0].patch.energyPre).toEqual({ op: 'clear' });
  });
  it('persists the exact body, CAS and key BEFORE network; offline/restart preserves original timestamps', async () => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.change('energyPost', 2);
    let frozen: FeelingsInput | undefined;
    vi.mocked(f.port.write).mockImplementationOnce(async input => {
      frozen = structuredClone(input); expect(JSON.parse(f.values.get(j.key)!).pending).toEqual(input); return { status: 'unavailable' };
    });
    await j.save(); expect(j.getSnapshot().pending).toEqual(frozen); j.dispose(); f.later();
    const restarted = f.journal(); await restarted.refresh(); await restarted.retry();
    expect(vi.mocked(f.port.write).mock.calls[1][0]).toEqual(frozen);
    expect(restarted.getSnapshot().pending).toBeNull();
    expect(f.getServer().values.energyPost?.capturedAt).toBe('2026-11-04T11:05:00.000Z');
  });
  it('timeout after commit replays one durable receipt with the same key, including finish', async () => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.change('fatiguePost', 5);
    const pending = await j.prepareFinish({ performanceLevel: 3, notes: null }); expect(pending?.expectedSessionUpdatedAt).toBe(initial().sessionUpdatedAt);
    // Commit once, discard its response, and recover that receipt on the next request.
    f.port.write = vi.fn(async input => {
      const receipt = f.receipts.get(input.idempotencyKey);
      if (receipt) return { status: 'ok', data: receipt, finished: { status: 'finished', sessionId: sid, sessionStatus: 'completed', name: 'SYNTHETIC', routineId: null,
        logDate: '2026-11-04', startedAt: initial().sessionUpdatedAt, endedAt: receipt.endedAt!, sessionUpdatedAt: receipt.sessionUpdatedAt,
        metadata: { energyLevel: null, performanceLevel: null, painLevel: null, notes: null }, exerciseCount: 1, completedExerciseCount: 1, completedSetCount: 1, routineAdditions: [] } };
      const committed = { ...f.getServer(), revision: 1, sessionStatus: 'completed' as const, endedAt: '2026-11-04T11:06:00Z' };
      f.receipts.set(input.idempotencyKey, committed); f.setServer(committed); return { status: 'unavailable' };
    });
    expect(await j.retry()).toBeNull(); j.dispose();
    const restarted = f.journal(); await restarted.refresh();
    expect((await restarted.retry())?.sessionStatus).toBe('completed'); expect(f.receipts.size).toBe(1);
    expect(restarted.getSnapshot().pending).toEqual(pending); expect(await restarted.confirmFinish()).toBe(true);
    expect(restarted.getSnapshot().pending).toBeNull();
  });
  it('a changed revision rereads and blocks without rebasing; explicit mine keeps capture but gets a new key', async () => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.change('energyPre', 3);
    vi.mocked(f.port.write).mockResolvedValueOnce({ status: 'unavailable' }); await j.save();
    const old = j.getSnapshot().pending!; f.setServer({ ...f.getServer(), revision: 4 });
    await j.retry(); expect(j.getSnapshot().blocked).toBe(true); const calls = vi.mocked(f.port.write).mock.calls.length;
    await j.retry(); expect(vi.mocked(f.port.write).mock.calls.length).toBe(calls);
    f.later(); await j.resolve('mine'); await j.save();
    const next = vi.mocked(f.port.write).mock.calls.at(-1)![0];
    expect(next.expectedRevision).toBe(4); expect(next.idempotencyKey).not.toBe(old.idempotencyKey); expect(next.patch).toEqual(old.patch);
  });
  it('detects a changed revision before freezing; choosing server clears only after a successful read', async () => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.change('energyPre', 2); f.setServer({ ...f.getServer(), revision: 1 });
    await j.save(); expect(j.getSnapshot().blocked).toBe(true); expect(f.port.write).not.toHaveBeenCalled();
    vi.mocked(f.port.read).mockResolvedValueOnce({ status: 'unavailable' }); expect(await j.resolve('server')).toBe(false); expect(j.hasWork()).toBe(true);
    await j.resolve('server'); expect(j.hasWork()).toBe(false);
  });
  it('storage failure never sends or announces confirmation; corrupt local data fences operations', async () => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.change('energyPre', 3);
    vi.spyOn(f.storage, 'setItem').mockRejectedValueOnce(Error('disk')); await j.save(); expect(f.port.write).not.toHaveBeenCalled(); expect(j.getSnapshot().error).toBeTruthy();
    f.values.set(j.key, '{broken'); await j.save(); expect(f.port.write).not.toHaveBeenCalled();
  });
  it('read failures remain unavailable, without turning cached answers into confirmed empties', async () => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.change('energyPre', 4); await j.save();
    vi.mocked(f.port.read).mockResolvedValue({ status: 'unavailable' }); await j.refresh(); expect(j.getSnapshot().readError).toBe(true); expect(j.value('energyPre')).toBe(4);
  });
  it('isolates user and session on restart and does not send after disposal during a slow read', async () => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.change('energyPre', 1);
    const other = f.journal('other'); await other.refresh(); expect(other.hasWork()).toBe(false); expect(other.key).not.toBe(j.key);
    const session = f.journal('owner', '93670000-0000-4000-8000-000000000011'); expect(session.key).not.toBe(j.key);
    let release!: (r: FeelingsResult) => void; vi.mocked(f.port.read).mockImplementationOnce(() => new Promise(r => { release = r; }));
    const save = j.save(); for (let i = 0; i < 20; i++) await Promise.resolve(); j.dispose(); release({ status: 'ok', data: f.getServer() }); await save;
    expect(f.port.write).not.toHaveBeenCalled();
  });
  it('serializes two mounts on the same storage key so one frozen request cannot be replaced', async () => {
    const f = setup(), j = f.journal(); await j.refresh(); await j.change('energyPre', 4);
    vi.mocked(f.port.write).mockResolvedValue({ status: 'unavailable' }); const second = f.journal();
    await Promise.all([j.save(), second.change('fatiguePre', 3)]);
    await second.refresh(); expect(second.getSnapshot().pending).toEqual(j.getSnapshot().pending); expect(second.getSnapshot().patch.fatiguePre).toBeUndefined();
  });
  it('preserves an already captured edit queued before navigation, without sending after disposal', async () => {
    const f = setup(), j = f.journal(); const edit = j.change('fatiguePre', 2); j.dispose(); await edit;
    const next = f.journal(); await next.refresh(); expect(next.value('fatiguePre')).toBe(2); expect(f.port.write).not.toHaveBeenCalled();
  });
  it('requires explicit review if capture happened without a known baseline and the first read finds existing answers', async () => {
    const f = setup(), j = f.journal();
    await j.change('energyPre', 1);
    f.setServer({ ...f.getServer(), revision: 3, values: { energyPre: { value: 5, instrumentVersion: 'energy-fatigue/1', declaredMoment: 'pre', declaredAt: null, capturedAt: null, source: 'mobile', receivedAt: '2026-11-04T10:00:00Z', temporalQuality: 'unknown' } } });
    await j.save(); expect(j.getSnapshot().blocked).toBe(true); expect(f.port.write).not.toHaveBeenCalled();
  });
  it('never upgrades the negotiated mode of an already durable v1 finish on restart', async () => {
    const f = setup(), j = f.journal(), old = { contractVersion: 'training-feelings/1' as const, operation: 'finish' as const, expectedRevision: 0, patch: {}, idempotencyKey: 'old:finish', expectedSessionUpdatedAt: initial().sessionUpdatedAt, metadata: {} };
    f.values.set(j.key, JSON.stringify({ version: 1, server: initial(), patch: {}, baseRevision: 0, pending: old, blocked: false }));
    await j.refresh(); expect(await j.prepareFinish({})).toEqual(old);
    await j.retry(); expect(f.port.write).toHaveBeenCalledWith(old); expect(j.getSnapshot().finished).toBeUndefined();
  });
});
