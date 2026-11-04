import { describe, expect, it, jest } from '@jest/globals';
import { ActiveSessionController, type ActiveSessionApi } from './active-session-controller';
import { SessionDraftRepository, type SessionStoragePort } from './active-session-storage';
import { SESSION_ID, VERSION, testDetail, testFinished } from './active-session-test-fixtures';
import { TrainingFeelingsJournal } from '@/api/training-feelings';
import type { FeelingsInput, FeelingsPort } from '../../../../src/lib/mobile-api/training-feelings-journal';
import type { FeelingsResponse } from '../../../../src/lib/mobile-api/training-feelings-contract';

function setup() {
  const values = new Map<string, string>();
  const storage: SessionStoragePort = { getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v); }, removeItem: async k => { values.delete(k); }, getAllKeys: async () => [...values.keys()] };
  let detail = testDetail(), effects = 0, key = 0, lose = false;
  detail.session.metadata = { ...detail.session.metadata, energyLevel: 2, performanceLevel: 3, painLevel: 4, notes: 'legacy' };
  detail.exercises = detail.exercises.map(x => ({ ...x, payload: { ...x.payload, isCompleted: true, sets: x.payload.sets.map(s => ({ ...s, isCompleted: true })) } }));
  let server: FeelingsResponse = { contractVersion: 'training-feelings/1', sessionId: SESSION_ID, sessionStatus: 'in_progress', sessionUpdatedAt: VERSION, endedAt: null, revision: 0, values: {} };
  const receipts = new Map<string, FeelingsResponse>();
  const meta = { durationMs: 0, httpStatus: 200, outcome: 'ok' as const };
  const api = { detail: jest.fn<ActiveSessionApi['detail']>().mockImplementation(async () => ({ status: 'ok', data: structuredClone(detail), meta })),
    finish: jest.fn<ActiveSessionApi['finish']>().mockImplementation(async input => ({ status: 'ok', data: testFinished(input.metadata), meta })) } as unknown as ActiveSessionApi;
  const port: FeelingsPort = { read: async () => ({ status: 'ok', data: structuredClone(server) }), write: jest.fn(async (input: FeelingsInput) => {
    expect(JSON.parse(values.get(journalKey)!).pending).toEqual(input);
    const structural = JSON.parse(values.get(repository.prefix + 'intent')!); expect(structural.feelings).toEqual(input);
    if (receipts.has(input.idempotencyKey)) return { status: 'ok', data: receipts.get(input.idempotencyKey)! };
    if (server.revision !== input.expectedRevision) return { status: 'conflict' };
    effects++; server = { ...server, revision: server.revision + 1, sessionStatus: 'completed', endedAt: '2026-11-04T12:00:00Z' };
    receipts.set(input.idempotencyKey, server); detail = { ...detail, session: { ...detail.session, status: 'completed', endedAt: server.endedAt } };
    if (lose) { lose = false; return { status: 'unavailable' }; }
    return { status: 'ok', data: server };
  }) };
  const repository = new SessionDraftRepository(storage, 'owner', SESSION_ID);
  const make = () => {
    const journal = new TrainingFeelingsJournal(storage, port, 'owner', SESSION_ID, 'mobile', () => `feelings:${++key}`);
    return new ActiveSessionController(api, repository, () => `session:${++key}`, Date.now, journal);
  };
  const journalKey = make().feelings!.key;
  return { make, api, port, repository, values, effects: () => effects, loseResponse: () => { lose = true; }, conflict: () => { server = { ...server, revision: server.revision + 1 }; } };
}
describe('ADOPT finish coordinates the existing session journal', () => {
  it('omits all optional feelings and preserves legacy metadata on the original finish path', async () => {
    const f = setup(), c = f.make(); await c.refresh();
    expect(await c.finish()).toBe(true);
    expect(f.api.finish).toHaveBeenCalledWith(expect.objectContaining({ metadata: { energyLevel: 2, performanceLevel: 3, painLevel: 4, notes: 'legacy' } }));
    expect(f.port.write).not.toHaveBeenCalled(); c.dispose();
  });
  it('freezes post + session CAS in the original finish intent, without aliasing energy or clearing omitted metadata', async () => {
    const f = setup(), c = f.make(); await c.refresh(); await c.feelings!.change('energyPost', 4);
    expect(await c.finish()).toBe(true); expect(f.api.finish).not.toHaveBeenCalled();
    expect(f.port.write).toHaveBeenCalledWith(expect.objectContaining({ operation: 'finish', expectedSessionUpdatedAt: VERSION, metadata: {}, patch: { energyPost: expect.objectContaining({ value: 4 }) } }));
    expect(c.getSnapshot().finished?.metadata.energyLevel).toBe(2); expect(await f.repository.readIntent()).toBeNull(); expect(c.feelings!.hasWork()).toBe(false); c.dispose();
  });
  it('recovers a lost finish response after disposal/remount with the exact body and one domain effect', async () => {
    const f = setup(), c = f.make(); await c.refresh(); await c.feelings!.change('fatiguePost', 5); f.loseResponse();
    expect(await c.finish()).toBe(false); const frozen = (await f.repository.readIntent())!;
    expect(frozen.kind).toBe('finish'); c.dispose();
    const resumed = f.make(); await resumed.refresh(); expect(resumed.getSnapshot().intent?.phase).toBe('uncertain');
    expect(await resumed.retryIntent()).toBe(true); expect(f.effects()).toBe(1);
    const calls = (f.port.write as jest.Mock).mock.calls; expect(calls[1][0]).toEqual(calls[0][0]); resumed.dispose();
  });
  it('blocks a real conflict and releases it only after explicitly choosing which answers to keep', async () => {
    const f = setup(), c = f.make(); await c.refresh(); await c.feelings!.change('energyPost', 4); f.conflict();
    expect(await c.finish()).toBe(false); expect(c.feelings!.getSnapshot().blocked).toBe(true); expect(f.port.write).not.toHaveBeenCalled();
    await c.resolveFeelings('mine'); expect(c.feelings!.getSnapshot().blocked).toBe(false);
    expect(await c.finish()).toBe(true); c.dispose();
  });
  it('recovers if feelings cleanup succeeded but the existing session-draft cleanup failed', async () => {
    const f = setup(), c = f.make(); await c.refresh(); await c.feelings!.change('fatiguePost', 4);
    jest.spyOn(f.repository, 'clearSession').mockRejectedValueOnce(Error('storage unavailable'));
    expect(await c.finish()).toBe(false); expect(f.effects()).toBe(1);
    expect(await c.retryIntent()).toBe(true); expect(f.effects()).toBe(1); expect(c.getSnapshot().finished).toBeTruthy(); c.dispose();
  });
});
