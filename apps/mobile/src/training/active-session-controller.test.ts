import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MobileApiRequestResult } from '@/api/results';
import { ActiveSessionController, type ActiveSessionApi } from './active-session-controller';
import { SessionDraftRepository, type SessionStoragePort } from './active-session-storage';
import { appendSessionSet, draftUsingHistory, exerciseDraft, moveSessionSet, removeSessionSet, resetSessionSet } from './active-session-model';
import { EXERCISE_ID, NEXT_VERSION, SECOND_ID, SESSION_ID, VERSION, testDetail, testFinished, testPayload } from './active-session-test-fixtures';
const meta = { durationMs: 0, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T): MobileApiRequestResult<T> => ({ status: 'ok', data, meta });
const unavailable = { status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } } as const;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function setup(now: () => number = () => 10000) {
  const values = new Map<string, string>();
  const storage: SessionStoragePort = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
  const repository = new SessionDraftRepository(storage, 'owner', SESSION_ID);
  const api = {
    detail: jest.fn<ActiveSessionApi['detail']>().mockResolvedValue(ok(testDetail())),
    sync: jest.fn<ActiveSessionApi['sync']>().mockResolvedValue(ok({ status: 'active', updatedAt: VERSION, payload: testPayload() })),
    save: jest.fn<ActiveSessionApi['save']>().mockResolvedValue(ok({ sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION })),
    add: jest.fn<ActiveSessionApi['add']>().mockResolvedValue(ok({ status: 'added', sessionId: SESSION_ID, sessionExerciseId: SECOND_ID, exerciseId: SECOND_ID })),
    remove: jest.fn<ActiveSessionApi['remove']>().mockResolvedValue(ok({ status: 'removed', sessionId: SESSION_ID, sessionExerciseId: EXERCISE_ID })),
    cancel: jest.fn<ActiveSessionApi['cancel']>().mockResolvedValue(ok({ status: 'cancelled', sessionId: SESSION_ID })),
    reorder: jest.fn<ActiveSessionApi['reorder']>().mockImplementation(async input => ok({ status: 'reordered', sessionId: SESSION_ID,
      sessionUpdatedAt: NEXT_VERSION, orderedSessionExerciseIds: input.orderedSessionExerciseIds })),
    finish: jest.fn<ActiveSessionApi['finish']>().mockImplementation(async input => ok(testFinished(input.metadata))),
  };
  let key = 0;
  const controller = new ActiveSessionController(api, repository, () => `intent:${++key}`, now);
  return { values, storage, repository, api, controller };
}
describe('native active-session controller', () => {
  beforeEach(() => { jest.useFakeTimers(); }); afterEach(() => { jest.useRealTimers(); });
  it('measures edit availability independently of a controlled five-second foreground read', async () => {
    const { controller, api } = setup(() => Date.now()); await controller.refresh(); controller.suspend();
    const log = jest.spyOn(console, 'info');
    api.detail.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(ok(testDetail())), 5000)));
    const start = Date.now(); let editableAt: number | null = null;
    const observe = () => { if (editableAt === null && controller.canEdit(EXERCISE_ID)) editableAt = Date.now(); };
    const detach = controller.subscribe(observe), resumed = controller.resume(); observe();
    await jest.advanceTimersByTimeAsync(5000); await resumed; observe(); detach();
    console.info('[QA resume controlled]', { revalidationMs: 5000, editingWaitMs: editableAt === null ? null : editableAt - start });
    expect(editableAt! - start).toBe(0);
    expect(log).toHaveBeenCalledWith('[OWNLEVEL Session Resume]', { stage: 'local', elapsedMs: 0, hasSnapshot: true, editable: true, outcome: 'pending' });
    expect(log).toHaveBeenCalledWith('[OWNLEVEL Session Resume]', { stage: 'revalidated', elapsedMs: 5000, hasSnapshot: true, editable: true, outcome: 'ready' });
    log.mockRestore(); controller.dispose();
  });
  it('allows durable local edits immediately on resume while a five-second revalidation holds writes', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); controller.suspend();
    api.detail.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(ok(testDetail())), 5000)));
    const resumed = controller.resume();
    expect(controller.getSnapshot().refreshing).toBe(true);
    expect(controller.canEdit(EXERCISE_ID)).toBe(true);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'resumed', sets: draft.sets.map(set => ({ ...set, actualReps: '12', actualWeightKg: '47,5', targetRir: 0 })) }));
    await jest.advanceTimersByTimeAsync(4999);
    expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe('resumed'); expect(api.save).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); await resumed; await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ notes: 'resumed', sets: [expect.objectContaining({ actualReps: 12, actualWeightKg: 47.5, targetRir: 0 })] }));
    controller.dispose();
  });
  it('preserves edits made during a slow foreground read when another device changed the exercise', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); controller.suspend();
    const read = deferred<Awaited<ReturnType<ActiveSessionApi['detail']>>>(); api.detail.mockReturnValueOnce(read.promise);
    const resumed = controller.resume();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'while checking', sets: draft.sets.map(set => ({ ...set, actualWeightKg: '51,5', actualReps: '11', targetRir: null })) }));
    await jest.advanceTimersByTimeAsync(1000); expect(api.save).not.toHaveBeenCalled();
    const remote = testDetail(); remote.exercises[0] = { ...remote.exercises[0], updatedAt: NEXT_VERSION, payload: testPayload('another device') };
    read.resolve(ok(remote)); await resumed;
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('conflict');
    expect((await repository.readDraft(EXERCISE_ID))?.draft).toMatchObject({ notes: 'while checking', sets: [{ actualWeightKg: '51,5', actualReps: '11', targetRir: null }] });
    expect(api.save).not.toHaveBeenCalled(); controller.dispose();
  });
  it('settles an explicit flush during revalidation only after reconciliation and the confirmed save', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); controller.suspend();
    const read = deferred<Awaited<ReturnType<ActiveSessionApi['detail']>>>(); api.detail.mockReturnValueOnce(read.promise);
    const resumed = controller.resume();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'saved after check' }), true);
    let settled = false; const flushed = controller.flush(EXERCISE_ID).then(() => { settled = true; });
    await settle(); expect(settled).toBe(false); expect(api.save).not.toHaveBeenCalled();
    read.resolve(ok(testDetail())); await resumed; await flushed;
    expect(api.save).toHaveBeenCalledTimes(1); expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ notes: 'saved after check' }));
    expect(controller.getExercise(EXERCISE_ID)).toMatchObject({ phase: 'saved', dirty: false }); expect(await repository.readDraft(EXERCISE_ID)).toBeNull();
    controller.dispose();
  });
  it('settles an explicit flush during an unavailable revalidation without sending, keeping the draft', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); controller.suspend();
    api.detail.mockResolvedValueOnce(unavailable); const resumed = controller.resume();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'offline' }), true);
    await controller.flush(EXERCISE_ID); await resumed;
    expect(api.save).not.toHaveBeenCalled(); expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('scheduled');
    expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe('offline'); controller.dispose();
  });
  it('keeps local editing responsive while an earlier save drains, then uses its confirmed CAS for the newer draft', async () => {
    const { controller, api } = setup(); await controller.refresh();
    const save = deferred<Awaited<ReturnType<ActiveSessionApi['save']>>>(); api.save.mockReturnValueOnce(save.promise);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'first' }), true); await settle();
    controller.suspend(); const resumed = controller.resume();
    expect(controller.canEdit(EXERCISE_ID)).toBe(true);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'after unlock' }));
    expect(api.detail).toHaveBeenCalledTimes(1); expect(api.save).toHaveBeenCalledTimes(1);
    const detail = testDetail(); detail.exercises[0] = { ...detail.exercises[0], updatedAt: NEXT_VERSION, payload: testPayload('first') }; api.detail.mockResolvedValueOnce(ok(detail));
    save.resolve(ok({ sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION })); await resumed; await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save).toHaveBeenLastCalledWith(EXERCISE_ID, NEXT_VERSION, expect.objectContaining({ notes: 'after unlock' })); controller.dispose();
  });
  it('retains drafts across repeated lock/unlock, unavailable reads and restored connectivity', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    for (const notes of ['first unlock', 'second unlock']) {
      controller.suspend(); api.detail.mockResolvedValueOnce(unavailable);
      const resumed = controller.resume(); controller.change(EXERCISE_ID, draft => ({ ...draft, notes })); await resumed;
      expect(controller.canEdit(EXERCISE_ID)).toBe(true);
      expect(controller.getSnapshot().status).toBe('ready');
      expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe(notes);
    }
    expect(api.save).not.toHaveBeenCalled();
    controller.suspend(); await controller.resume(); await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenCalledTimes(1); expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ notes: 'second unlock' }));
    controller.dispose();
  });
  it('treats a draft waiting for the connection as pending, not as an exercise error, and converges on recovery (#356)', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    controller.suspend(); api.detail.mockResolvedValueOnce(unavailable); await controller.resume();
    expect(controller.getSnapshot().notice).toBe('No pudimos comprobar la sesión. Los borradores se conservan.');
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'sin señal' }));
    expect(controller.getExercise(EXERCISE_ID)).toMatchObject({ phase: 'scheduled', error: null });
    expect(controller.getProgress()).toMatchObject({ errors: 0, pending: 1, offline: true });
    jest.advanceTimersByTime(900); await settle();
    expect(api.save).not.toHaveBeenCalled(); expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe('sin señal');
    controller.suspend(); await controller.resume(); await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ notes: 'sin señal' }));
    expect(controller.getSnapshot().notice).toBeNull();
    expect(controller.getExercise(EXERCISE_ID)).toMatchObject({ phase: 'saved', error: null });
    expect(controller.getProgress()).toMatchObject({ errors: 0, pending: 0, offline: false }); controller.dispose();
  });
  it('still counts and shows real failures: an unconfirmed save keeps its error while offline (#356)', async () => {
    const { controller, api } = setup(); await controller.refresh(); api.save.mockResolvedValueOnce(unavailable); api.sync.mockResolvedValueOnce(unavailable);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'incierto' }), true); await settle();
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('unconfirmed');
    expect(controller.getProgress().errors).toBe(1); controller.dispose();
  });
  it('keeps restored sets and their local identity during foreground reconciliation', async () => {
    const { api, repository } = setup();
    const draft = exerciseDraft(testPayload('restored')); draft.sets[0] = { ...draft.sets[0], actualWeightKg: '0', actualReps: '10', targetRir: 0 };
    await repository.writeDraft({ version: 1, sessionId: SESSION_ID, sessionExerciseId: EXERCISE_ID, serverUpdatedAt: VERSION, basePayload: testPayload(), draft, writeId: 'restored' });
    const restored = new ActiveSessionController(api, repository); restored.suspend(); await restored.refresh();
    const read = deferred<Awaited<ReturnType<ActiveSessionApi['detail']>>>(); api.detail.mockReturnValueOnce(read.promise);
    const resumed = restored.resume(); expect(restored.getExercise(EXERCISE_ID)?.draft.sets).toEqual(draft.sets);
    restored.change(EXERCISE_ID, current => appendSessionSet(current)); read.resolve(ok(testDetail())); await resumed; await restored.flush(EXERCISE_ID);
    expect(restored.getExercise(EXERCISE_ID)?.draft.sets[0].localId).toBe(draft.sets[0].localId);
    expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ sets: [expect.objectContaining({ actualWeightKg: 0, targetRir: 0 }), expect.any(Object)] })); restored.dispose();
  });
  it('keeps pending structural operations fenced on resume without replaying them', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); api.remove.mockResolvedValueOnce(unavailable);
    expect(await controller.remove(EXERCISE_ID)).toBe(false); const intent = await repository.readIntent();
    controller.suspend(); await controller.resume();
    expect(controller.canEdit(EXERCISE_ID)).toBe(false); expect(await repository.readIntent()).toEqual(intent);
    expect(api.remove).toHaveBeenCalledTimes(1); expect(api.save).not.toHaveBeenCalled(); controller.dispose();
  });
  it.each(['completed', 'removed'] as const)('fences a remotely %s exercise/session and retains changes entered during revalidation', async terminal => {
    const { controller, api, repository } = setup(); await controller.refresh(); controller.suspend();
    const read = deferred<Awaited<ReturnType<ActiveSessionApi['detail']>>>(); api.detail.mockReturnValueOnce(read.promise);
    const resumed = controller.resume(); controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'retain locally' }));
    const detail = testDetail();
    if (terminal === 'completed') detail.session.status = 'completed'; else detail.exercises = [detail.exercises[1]];
    read.resolve(ok(detail)); await resumed;
    expect(controller.canEdit(EXERCISE_ID)).toBe(false);
    expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe('retain locally'); expect(api.save).not.toHaveBeenCalled(); controller.dispose();
  });
  it('debounces rapid edits for 850ms with durable granular drafts', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'first' }));
    await jest.advanceTimersByTimeAsync(400);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'last' }));
    await jest.advanceTimersByTimeAsync(849); expect(api.save).not.toHaveBeenCalled();
    expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe('last');
    await jest.advanceTimersByTimeAsync(1); await settle();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ notes: 'last' }));
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('saved');
    expect(await repository.readDraft(EXERCISE_ID)).toBeNull();
  });
  it('saves checks immediately without starting rest and notifies only the changed exercise', async () => {
    const { controller, api } = setup(); await controller.refresh();
    const untouched = jest.fn(); controller.subscribeExercise(SECOND_ID, untouched);
    controller.change(EXERCISE_ID, draft => ({ ...draft, sets: draft.sets.map(set => ({ ...set, isCompleted: true })) }), true);
    await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ isCompleted: true }));
    expect(controller.getTimer()).toBeNull(); expect(untouched).not.toHaveBeenCalled();
    expect(controller.getProgress().completedSets).toBe(1);
  });
  it('persists series reorder/reset/remove through the normal granular autosave CAS', async () => {
    const { controller, api, repository } = setup();
    const detail = testDetail();
    detail.exercises[0].payload.sets.push({ ...detail.exercises[0].payload.sets[0], setNumber: 2, targetReps: 12, targetWeightKg: 20, targetRir: 1, actualReps: 11, actualWeightKg: 17.5, isCompleted: true, notes: 'move me' });
    detail.exercises[0].payload.isCompleted = true;
    api.detail.mockResolvedValue(ok(detail)); await controller.refresh();
    const remote = deferred<Awaited<ReturnType<ActiveSessionApi['save']>>>(); api.save.mockReturnValueOnce(remote.promise);
    controller.change(EXERCISE_ID, draft => moveSessionSet(draft, 1, 0), true); await settle();
    expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ sets: [
      expect.objectContaining({ setNumber: 1, targetReps: 12, actualWeightKg: 17.5, isCompleted: true, notes: 'move me' }),
      expect.objectContaining({ setNumber: 2, targetReps: 8 }),
    ] }));
    expect((await repository.readDraft(EXERCISE_ID))?.draft.sets[0].notes).toBe('move me');
    remote.resolve(ok({ sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION })); await controller.flush(EXERCISE_ID);
    controller.change(EXERCISE_ID, draft => resetSessionSet(draft, 0), true); await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenLastCalledWith(EXERCISE_ID, NEXT_VERSION, expect.objectContaining({ isCompleted: false, sets: [
      expect.objectContaining({ setNumber: 1, targetReps: 12, actualWeightKg: null, actualReps: null, notes: null }), expect.anything(),
    ] }));
    controller.change(EXERCISE_ID, draft => removeSessionSet(draft, 0), true); await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenLastCalledWith(EXERCISE_ID, NEXT_VERSION, expect.objectContaining({ sets: [expect.objectContaining({ setNumber: 1, targetReps: 8 })] }));
    expect(api.detail).toHaveBeenCalledTimes(1); expect(api.sync).not.toHaveBeenCalled();
    expect(await repository.readDraft(EXERCISE_ID)).toBeNull(); expect(controller.getExercise(EXERCISE_ID)?.dirty).toBe(false);
  });
  it('keeps the reordered draft intact on CAS conflict and never overwrites remote series', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); controller.suspend();
    controller.change(EXERCISE_ID, appendSessionSet);
    controller.change(EXERCISE_ID, draft => moveSessionSet({ ...draft, sets: draft.sets.map((set, index) => ({ ...set, notes: index === 1 ? 'reordered' : 'first' })) }, 1, 0));
    await settle();
    api.save.mockResolvedValue({ status: 'conflict', code: 'SESSION_EXERCISE_CHANGED', message: 'changed', meta: { ...meta, outcome: 'conflict' } });
    api.sync.mockResolvedValue(ok({ status: 'active', updatedAt: NEXT_VERSION, payload: testPayload('remote') }));
    await controller.resume(); await controller.flush(EXERCISE_ID);
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('conflict');
    expect((await repository.readDraft(EXERCISE_ID))?.draft.sets[0].notes).toBe('reordered');
    expect(api.save).toHaveBeenCalledTimes(1);
    await controller.checkExercise(EXERCISE_ID); expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('serializes newer revisions with the opaque confirmed version while exercises progress independently', async () => {
    const { controller, api } = setup(); await controller.refresh();
    const first = deferred<Awaited<ReturnType<ActiveSessionApi['save']>>>();
    const second = deferred<Awaited<ReturnType<ActiveSessionApi['save']>>>();
    api.save.mockImplementation((id, version) => id === SECOND_ID ? Promise.resolve(ok({ sessionExerciseId: id, updatedAt: NEXT_VERSION })) : version === VERSION ? first.promise : second.promise);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'a' }), true); await settle();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'b' }));
    controller.change(SECOND_ID, draft => ({ ...draft, notes: 'independent' }), true); await controller.flush(SECOND_ID);
    expect(api.save).toHaveBeenCalledTimes(2);
    first.resolve(ok({ sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION })); await settle();
    expect(api.save).toHaveBeenLastCalledWith(EXERCISE_ID, NEXT_VERSION, expect.objectContaining({ notes: 'b' }));
    expect(controller.getExercise(EXERCISE_ID)?.dirty).toBe(true);
    second.resolve(ok({ sessionExerciseId: EXERCISE_ID, updatedAt: '2026-09-30T12:00:02.123459Z' })); await controller.flush(EXERCISE_ID);
    expect(controller.getExercise(EXERCISE_ID)?.dirty).toBe(false);
  });
  it('retains a real CAS conflict and adopts server truth only on explicit use-saved', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    api.save.mockResolvedValue({ status: 'conflict', code: 'SESSION_EXERCISE_CHANGED', message: 'changed', meta: { ...meta, outcome: 'conflict' } });
    api.sync.mockResolvedValue(ok({ status: 'active', updatedAt: NEXT_VERSION, payload: testPayload('remote') }));
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'local' }), true); await controller.flush(EXERCISE_ID);
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('conflict');
    expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe('local');
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'new local' })); await jest.advanceTimersByTimeAsync(1000);
    await controller.checkExercise(EXERCISE_ID); expect(api.save).toHaveBeenCalledTimes(1);
    await controller.useSaved(EXERCISE_ID);
    expect(controller.getExercise(EXERCISE_ID)?.draft.notes).toBe('remote');
    expect(await repository.readDraft(EXERCISE_ID)).toBeNull();
  });
  it('recognizes a response-lost save by canonical read-back without issuing another write', async () => {
    const { controller, api } = setup(); await controller.refresh();
    api.save.mockResolvedValue(unavailable);
    api.sync.mockResolvedValue(ok({ status: 'active', updatedAt: NEXT_VERSION, payload: testPayload('applied') }));
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'applied' }), true); await controller.flush(EXERCISE_ID);
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('saved'); expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('recognizes an older committed attempt without falsely marking a newer revision saved', async () => {
    const { controller, api } = setup(); await controller.refresh();
    const readback = deferred<Awaited<ReturnType<ActiveSessionApi['sync']>>>();
    api.save.mockResolvedValueOnce(unavailable); api.sync.mockReturnValue(readback.promise);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'first' }), true); await settle();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'newer' }));
    readback.resolve(ok({ status: 'active', updatedAt: NEXT_VERSION, payload: testPayload('first') }));
    await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenLastCalledWith(EXERCISE_ID, NEXT_VERSION, expect.objectContaining({ notes: 'newer' }));
    expect(controller.getExercise(EXERCISE_ID)?.draft.notes).toBe('newer');
  });
  it('holds unapplied or unknown writes until a server check precedes explicit retry', async () => {
    const { controller, api } = setup(); await controller.refresh(); api.save.mockResolvedValueOnce(unavailable);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'pending' }), true); await controller.flush(EXERCISE_ID);
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('retryable'); expect(api.save).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5000); expect(api.save).toHaveBeenCalledTimes(1);
    await controller.checkExercise(EXERCISE_ID); expect(api.save).toHaveBeenCalledTimes(2);
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('saved');
  });
  it('never retries when ambiguous read-back is unavailable', async () => {
    const { controller, api } = setup(); await controller.refresh(); api.save.mockResolvedValue(unavailable); api.sync.mockResolvedValue(unavailable);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'pending' }), true); await controller.flush(EXERCISE_ID);
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('unconfirmed');
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'new pending' })); await jest.advanceTimersByTimeAsync(1000);
    expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('restores current drafts and refuses automatic application of stale drafts', async () => {
    const current = setup(); const draft = { ...exerciseDraft(testPayload()), notes: 'current' };
    await current.repository.writeDraft({ version: 1, sessionId: SESSION_ID, sessionExerciseId: EXERCISE_ID, serverUpdatedAt: VERSION, basePayload: testPayload(), draft, writeId: 'restored' });
    await current.controller.refresh(); await current.controller.flush(EXERCISE_ID);
    expect(current.api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ notes: 'current' }));
    const stale = setup(); await stale.repository.writeDraft({ version: 1, sessionId: SESSION_ID, sessionExerciseId: EXERCISE_ID,
      serverUpdatedAt: 'old-version', basePayload: testPayload(), draft, writeId: 'stale' });
    await stale.controller.refresh(); expect(stale.api.save).not.toHaveBeenCalled();
    expect(stale.controller.getExercise(EXERCISE_ID)?.draft.notes).toBe(''); expect(stale.controller.canEdit(EXERCISE_ID)).toBe(false);
    await stale.controller.checkExercise(EXERCISE_ID);
    expect(stale.api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ notes: 'current' }));
  });
  it('does not overwrite a valid local draft on foreground remote changes and deduplicates reads', async () => {
    const { controller, api } = setup(); await controller.refresh();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'local' })); controller.suspend();
    const server = testDetail(); server.exercises[0] = { ...server.exercises[0], updatedAt: NEXT_VERSION, payload: testPayload('remote') };
    const read = deferred<Awaited<ReturnType<ActiveSessionApi['detail']>>>(); api.detail.mockReturnValue(read.promise);
    const resumed = controller.resume(); const sameRead = controller.refresh(); expect(resumed).toBe(sameRead);
    read.resolve(ok(server)); await resumed;
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('conflict'); expect(controller.getExercise(EXERCISE_ID)?.draft.notes).toBe('local');
    expect(api.save).not.toHaveBeenCalled();
  });
  it('fences a remotely closed session and keeps unconfirmed drafts', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    const closed = testDetail(); closed.session.status = 'completed';
    api.detail.mockResolvedValue(ok(closed));
    api.save.mockResolvedValue({ status: 'conflict', code: 'SESSION_CLOSED', message: 'closed', meta: { ...meta, outcome: 'conflict' } });
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'local' }), true); await controller.flush(EXERCISE_ID); await controller.refresh();
    expect(controller.getSnapshot().fenced).toBe(true); expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('closed');
    expect(await repository.readDraft(EXERCISE_ID)).not.toBeNull();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'ignored' }), true); expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('keeps the editing fence on structural closure even if detail refresh is unavailable', async () => {
    const { controller, api } = setup(); await controller.refresh();
    api.add.mockResolvedValue({ status: 'conflict', code: 'SESSION_CLOSED', message: 'closed', meta: { ...meta, outcome: 'conflict' } });
    api.detail.mockResolvedValue(unavailable);
    await controller.add({ operation: 'add_existing', exerciseId: SECOND_ID, idempotencyKey: 'closed-add' });
    expect(controller.getSnapshot().fenced).toBe(true); expect(controller.canEdit(EXERCISE_ID)).toBe(false);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'ignored' }), true); expect(api.save).not.toHaveBeenCalled();
  });
  it('fences removed exercises without assuming other exercises are unavailable', async () => {
    const { controller, api } = setup(); await controller.refresh();
    const server = testDetail(); server.exercises = [server.exercises[1]]; api.detail.mockResolvedValue(ok(server));
    api.save.mockResolvedValue({ status: 'conflict', code: 'SESSION_EXERCISE_REMOVED', message: 'removed', meta: { ...meta, outcome: 'conflict' } });
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'local' }), true); await controller.flush(EXERCISE_ID); await controller.refresh();
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('removed'); expect(controller.canEdit(EXERCISE_ID)).toBe(false); expect(controller.canEdit(SECOND_ID)).toBe(true);
  });
  it.each(['add_existing', 'create_and_add'] as const)('persists and explicitly replays one %s intent across remount', async operation => {
    const { controller, api, repository } = setup(); await controller.refresh(); api.add.mockResolvedValueOnce(unavailable);
    const input = operation === 'add_existing' ? { operation, exerciseId: SECOND_ID, idempotencyKey: 'same-intent' } as const :
      { operation, idempotencyKey: 'same-intent', exercise: { name: 'NEW', muscleGroup: null, muscleGroupLabel: null, implement: null, weightMode: null,
        suggestedSets: 1, suggestedReps: null, suggestedWeight: null, suggestedRir: null, suggestedRestMinSeconds: null, suggestedRestMaxSeconds: null, notes: null } } as const;
    expect(await controller.add(input)).toBe(false); expect(api.add).toHaveBeenCalledTimes(1); controller.dispose();
    const restored = new ActiveSessionController(api, repository); await restored.refresh();
    expect(restored.canEdit(EXERCISE_ID)).toBe(false); expect(api.add).toHaveBeenCalledTimes(1);
    expect(await restored.retryIntent()).toBe(true); expect(api.add).toHaveBeenLastCalledWith(input);
    expect(await repository.readIntent()).toBeNull();
  });
  it('waits the observed save version for remove CAS and clears only confirmed removals', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    const save = deferred<Awaited<ReturnType<ActiveSessionApi['save']>>>(); api.save.mockReturnValue(save.promise);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'local' }), true); await settle();
    const removing = controller.remove(EXERCISE_ID); expect(api.remove).not.toHaveBeenCalled();
    save.resolve(ok({ sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION }));
    const server = testDetail(); server.exercises = [server.exercises[1]]; api.detail.mockResolvedValue(ok(server));
    expect(await removing).toBe(true);
    expect(api.remove).toHaveBeenCalledWith(EXERCISE_ID, NEXT_VERSION, expect.any(String));
    expect(await repository.readDraft(EXERCISE_ID)).toBeNull();
  });
  it('preserves local work on remove CAS conflicts and handles duplicate/idempotency errors explicitly', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'local' })); await settle();
    api.remove.mockResolvedValue({ status: 'conflict', code: 'SESSION_EXERCISE_CHANGED', message: 'changed', meta: { ...meta, outcome: 'conflict' } });
    const changed = testDetail(); changed.exercises[0] = { ...changed.exercises[0], updatedAt: NEXT_VERSION, payload: testPayload('remote') }; api.detail.mockResolvedValue(ok(changed));
    expect(await controller.remove(EXERCISE_ID)).toBe(false);
    expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe('local');
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('conflict');
    api.add.mockResolvedValue({ status: 'conflict', code: 'SESSION_EXERCISE_ALREADY_EXISTS', message: 'already present', meta: { ...meta, outcome: 'conflict' } });
    await controller.add({ operation: 'add_existing', exerciseId: SECOND_ID, idempotencyKey: 'duplicate' }); expect(await repository.readIntent()).toBeNull();
    api.cancel.mockResolvedValue({ status: 'conflict', code: 'IDEMPOTENCY_KEY_REUSED', message: 'key reused', meta: { ...meta, outcome: 'conflict' } });
    await controller.cancel(); expect(controller.getSnapshot().intent?.phase).toBe('blocked');
    await controller.discardBlockedIntent(); expect(await repository.readIntent()).toBeNull(); expect(api.cancel).toHaveBeenCalledTimes(1);
  });
  it('preserves drafts/timer/summary until cancellation replay is confirmed, then discards them with the session', async () => {
    const { controller, api, repository, values } = setup(); await controller.refresh(); controller.startRest(EXERCISE_ID);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'local' })); await settle();
    controller.updateSummary(summary => ({ ...summary, notes: 'summary draft' })); await settle();
    api.cancel.mockResolvedValueOnce(unavailable); expect(await controller.cancel()).toBe(false);
    expect(await repository.readDraft(EXERCISE_ID)).not.toBeNull(); expect(controller.getTimer()).not.toBeNull();
    expect((await repository.readSummary())?.notes).toBe('summary draft');
    const key = api.cancel.mock.calls[0][0]; expect(await controller.retryIntent()).toBe(true);
    expect(api.cancel).toHaveBeenLastCalledWith(key); expect(controller.getSnapshot().status).toBe('cancelled');
    expect(controller.getTimer()).toBeNull(); expect(await repository.readDraft(EXERCISE_ID)).toBeNull(); expect(values.has(`${repository.prefix}metadata`)).toBe(false);
  });
  it('retains the cancellation replay key when local cleanup fails midway', async () => {
    const { controller, repository, storage } = setup(); await controller.refresh();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'local' })); await settle();
    const remove = storage.removeItem;
    let failed = false;
    storage.removeItem = async key => { if (key.endsWith(EXERCISE_ID) && !failed) { failed = true; throw new Error('disk unavailable'); } await remove(key); };
    expect(await controller.cancel()).toBe(false);
    expect(await repository.readIntent()).not.toBeNull();
    expect(await controller.retryIntent()).toBe(true); expect(await repository.readIntent()).toBeNull();
  });
  it('retains a removed exercise draft/timer on ambiguity and clears them after replay', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); controller.startRest(EXERCISE_ID);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'local' })); await settle(); api.remove.mockResolvedValueOnce(unavailable);
    expect(await controller.remove(EXERCISE_ID)).toBe(false); expect(await repository.readDraft(EXERCISE_ID)).not.toBeNull(); expect(controller.getTimer()).not.toBeNull();
    const server = testDetail(); server.exercises = [server.exercises[1]]; api.detail.mockResolvedValue(ok(server));
    expect(await controller.retryIntent()).toBe(true); expect(controller.getTimer()).toBeNull(); expect(await repository.readDraft(EXERCISE_ID)).toBeNull();
  });
  it('restores the timestamp timer after remount and cleans it on remote removal', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); controller.startRest(EXERCISE_ID); await settle();
    const restored = new ActiveSessionController(api, repository, undefined, () => 40000); await restored.refresh();
    expect(restored.getTimer()?.endAt).toBe(130000);
    restored.adjustRest(-15); expect(restored.getTimer()?.endAt).toBe(115000);
    const server = testDetail(); server.exercises = [server.exercises[1]]; api.detail.mockResolvedValue(ok(server)); await restored.refresh(); expect(restored.getTimer()).toBeNull();
  });
  it('distinguishes not-found, unavailable and unknown history without false empty state', async () => {
    const { controller, api } = setup(); api.detail.mockResolvedValueOnce(unavailable); await controller.refresh();
    expect(controller.getSnapshot().status).toBe('unavailable'); api.detail.mockResolvedValueOnce({ status: 'not_found', message: 'absent', meta: { ...meta, outcome: 'not_found' } }); await controller.refresh();
    expect(controller.getSnapshot().status).toBe('not_found');
    const detail = testDetail(); detail.quickHistory = { status: 'unavailable' }; api.detail.mockResolvedValueOnce(ok(detail)); await controller.refresh();
    expect(controller.getSnapshot().detail?.quickHistory.status).toBe('unavailable'); expect(controller.canEdit(EXERCISE_ID)).toBe(true);
  });
  it('does not mark newer or remounted work saved after disposal', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    const pending = deferred<Awaited<ReturnType<ActiveSessionApi['save']>>>(); api.save.mockReturnValue(pending.promise);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'a' }), true); await settle();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'b' })); await settle(); controller.dispose();
    pending.resolve(ok({ sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION })); await settle();
    expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe('b'); expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('does not share draft storage across identities or erase a newer write id', async () => {
    const { repository, storage } = setup();
    const draft = { version: 1 as const, sessionId: SESSION_ID, sessionExerciseId: EXERCISE_ID, serverUpdatedAt: VERSION, basePayload: testPayload(), draft: exerciseDraft(testPayload()), writeId: 'new' };
    await repository.writeDraft(draft); await repository.removeDraft(EXERCISE_ID, 'old'); expect(await repository.readDraft(EXERCISE_ID)).not.toBeNull();
    expect(await new SessionDraftRepository(storage, 'other-owner', SESSION_ID).readDraft(EXERCISE_ID)).toBeNull();
  });
  it('fences edits while local intent storage is unreadable and recovers without losing drafts', async () => {
    const { controller, storage, api } = setup();
    const read = storage.getItem; let failed = false;
    storage.getItem = async key => { if (key.endsWith('.intent') && !failed) { failed = true; throw new Error('unavailable'); } return read(key); };
    await controller.refresh(); expect(controller.canEdit(EXERCISE_ID)).toBe(false);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'ignored' }), true); expect(api.save).not.toHaveBeenCalled();
    await controller.refresh(); expect(controller.canEdit(EXERCISE_ID)).toBe(true); expect(controller.getSnapshot().storageError).toBe(false);
  });
  it('pauses scheduled series autosave until DROP and writes the entire final order once', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    controller.change(EXERCISE_ID, appendSessionSet);
    const original = controller.getExercise(EXERCISE_ID)!.draft.sets;
    expect(controller.beginSetDrag(EXERCISE_ID)).toBe(true);
    await jest.advanceTimersByTimeAsync(2000);
    await controller.flush(EXERCISE_ID); expect(api.save).not.toHaveBeenCalled();
    expect(await controller.dropSets(EXERCISE_ID, original.map(set => set.localId).reverse())).toBe(true);
    await controller.flush(EXERCISE_ID); await jest.advanceTimersByTimeAsync(2000);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(controller.getExercise(EXERCISE_ID)!.draft.sets.map(set => set.localId)).toEqual(original.map(set => set.localId).reverse());
    expect(api.save.mock.calls[0][2].sets.map(set => set.setNumber)).toEqual([1, 2]);
    expect(api.save.mock.calls[0][2].sets[0]).not.toHaveProperty('localId');
    expect(api.detail).toHaveBeenCalledTimes(1); expect(await repository.readDraft(EXERCISE_ID)).toBeNull();
  });
  it('sends one exercise-order intent with observed session CAS and adopts only the confirmed response', async () => {
    const { controller, api } = setup(); await controller.refresh(); controller.startRest(EXERCISE_ID);
    const before = controller.getExercise(EXERCISE_ID), timer = controller.getTimer(), history = controller.getSnapshot().detail!.quickHistory;
    const remote = deferred<Awaited<ReturnType<ActiveSessionApi['reorder']>>>(); api.reorder.mockReturnValue(remote.promise);
    expect(controller.beginExerciseDrag()).toBe(true); await controller.refresh(); expect(api.detail).toHaveBeenCalledTimes(1);
    const dropped = controller.dropExercises([SECOND_ID, EXERCISE_ID]); await settle();
    expect(api.reorder).toHaveBeenCalledTimes(1);
    expect(api.reorder).toHaveBeenCalledWith({ orderedSessionExerciseIds: [SECOND_ID, EXERCISE_ID], expectedSessionUpdatedAt: VERSION, idempotencyKey: expect.any(String) });
    expect(controller.getSnapshot().detail!.exercises.map(exercise => exercise.id)).toEqual([EXERCISE_ID, SECOND_ID]);
    remote.resolve(ok({ status: 'reordered', sessionId: SESSION_ID, sessionUpdatedAt: NEXT_VERSION, orderedSessionExerciseIds: [SECOND_ID, EXERCISE_ID] }));
    expect(await dropped).toBe(true);
    expect(controller.getSnapshot().detail!.exercises.map(exercise => exercise.id)).toEqual([SECOND_ID, EXERCISE_ID]);
    expect(controller.getSnapshot().detail!.session.updatedAt).toBe(NEXT_VERSION);
    expect(controller.getExercise(EXERCISE_ID)!.draft).toBe(before!.draft);
    expect(controller.getExercise(EXERCISE_ID)!.exercise).toEqual({ ...before!.exercise, order: 2 });
    expect(controller.getTimer()).toBe(timer); expect(controller.getSnapshot().detail!.quickHistory).toBe(history);
    expect(api.detail).toHaveBeenCalledTimes(1); expect(api.save).not.toHaveBeenCalled();
  });
  it('coordinates an in-flight save and pending newer draft with reorder without discarding either', async () => {
    const { controller, api } = setup(); await controller.refresh();
    const save = deferred<Awaited<ReturnType<ActiveSessionApi['save']>>>(); api.save.mockReturnValueOnce(save.promise);
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'first' }), true); await settle();
    controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'newer' }));
    expect(controller.beginExerciseDrag()).toBe(true); await jest.advanceTimersByTimeAsync(1000);
    const dropped = controller.dropExercises([SECOND_ID, EXERCISE_ID]); await settle(); expect(api.reorder).not.toHaveBeenCalled();
    save.resolve(ok({ sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION })); expect(await dropped).toBe(true);
    await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenCalledTimes(2); expect(api.reorder).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenLastCalledWith(EXERCISE_ID, NEXT_VERSION, expect.objectContaining({ notes: 'newer' }));
    expect(controller.getExercise(EXERCISE_ID)!.draft.notes).toBe('newer'); expect(api.detail).toHaveBeenCalledTimes(1);
  });
  it('rolls back exercise order on CAS conflict, preserves invalid drafts, and requires an explicit fresh session check', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    controller.change(EXERCISE_ID, draft => ({ ...draft, sets: draft.sets.map(set => ({ ...set, actualWeightKg: '.' })) }));
    const draft = controller.getExercise(EXERCISE_ID)!.draft;
    api.reorder.mockResolvedValue({ status: 'conflict', code: 'SESSION_CHANGED', message: 'changed', meta: { ...meta, outcome: 'conflict' } });
    controller.beginExerciseDrag(); expect(await controller.dropExercises([SECOND_ID, EXERCISE_ID])).toBe(false);
    expect(controller.getSnapshot().detail!.exercises.map(exercise => exercise.id)).toEqual([EXERCISE_ID, SECOND_ID]);
    expect(controller.getExercise(EXERCISE_ID)!.draft).toBe(draft);
    expect((await repository.readDraft(EXERCISE_ID))!.draft).toEqual(draft);
    expect(controller.getSnapshot().notice).toContain('Cambio en otro dispositivo');
    expect(controller.beginExerciseDrag()).toBe(false); expect(api.reorder).toHaveBeenCalledTimes(1); expect(api.detail).toHaveBeenCalledTimes(1);
    await controller.refresh(); expect(controller.beginExerciseDrag()).toBe(true); controller.cancelDrag();
  });
  it('retains an ambiguous reorder intent across remount and explicitly replays the same key then reads current truth', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    api.reorder.mockResolvedValueOnce(unavailable);
    controller.beginExerciseDrag(); expect(await controller.dropExercises([SECOND_ID, EXERCISE_ID])).toBe(false);
    const input = api.reorder.mock.calls[0][0];
    expect(controller.getSnapshot().detail!.exercises.map(exercise => exercise.id)).toEqual([EXERCISE_ID, SECOND_ID]);
    expect(controller.getSnapshot().intent!.phase).toBe('uncertain');
    await jest.advanceTimersByTimeAsync(5000); expect(api.reorder).toHaveBeenCalledTimes(1); controller.dispose();
    const restored = new ActiveSessionController(api, repository); await restored.refresh(); expect(restored.canEdit(EXERCISE_ID)).toBe(false);
    expect(await restored.retryIntent()).toBe(true); expect(api.reorder).toHaveBeenLastCalledWith(input);
    // The mocked current detail has a newer/different order than the ledger replay.
    expect(restored.getSnapshot().detail!.exercises.map(exercise => exercise.id)).toEqual([EXERCISE_ID, SECOND_ID]);
    expect(await repository.readIntent()).toBeNull(); expect(api.reorder).toHaveBeenCalledTimes(2);
  });
  it('does not mutate for an unchanged/cancelled drag and never applies a drop after backgrounding', async () => {
    const { controller, api } = setup(); await controller.refresh();
    controller.beginExerciseDrag(); expect(await controller.dropExercises([EXERCISE_ID, SECOND_ID])).toBe(true);
    controller.beginExerciseDrag(); controller.cancelDrag(); expect(await controller.dropExercises([SECOND_ID, EXERCISE_ID])).toBe(false);
    controller.beginExerciseDrag(); controller.suspend(); expect(await controller.dropExercises([SECOND_ID, EXERCISE_ID])).toBe(false);
    expect(api.reorder).not.toHaveBeenCalled();
  });
  it('keeps logical series IDs across clean reconciliation, foreground and confirmed membership changes', async () => {
    const { controller, api } = setup(); await controller.refresh();
    const draft = controller.getExercise(EXERCISE_ID)!.draft;
    await controller.refresh(); controller.suspend(); await controller.resume();
    expect(controller.getExercise(EXERCISE_ID)!.draft).toBe(draft);
    const changed = testDetail(); changed.session.updatedAt = NEXT_VERSION; changed.exercises[0].updatedAt = NEXT_VERSION;
    api.detail.mockResolvedValue(ok(changed)); await controller.refresh();
    expect(controller.getExercise(EXERCISE_ID)!.draft.sets[0].localId).toBe(draft.sets[0].localId);
    changed.exercises = [changed.exercises[0]]; api.detail.mockResolvedValue(ok(changed));
    expect(await controller.remove(SECOND_ID)).toBe(true);
    expect(controller.getSnapshot().notice).toBeNull();
    expect(controller.getExercise(EXERCISE_ID)!.draft).toBe(draft);
  });
  it('keeps normal add/remove reconciliation silent without suppressing real refresh failures', async () => {
    const { controller, api } = setup(); await controller.refresh();
    expect(await controller.add({ operation: 'add_existing', exerciseId: SECOND_ID, idempotencyKey: 'silent-add' })).toBe(true);
    expect(controller.getSnapshot().notice).toBeNull();
    const detail = testDetail(); detail.exercises = [detail.exercises[1]]; api.detail.mockResolvedValue(ok(detail));
    expect(await controller.remove(EXERCISE_ID)).toBe(true); expect(controller.getSnapshot().notice).toBeNull();
    api.detail.mockResolvedValue(unavailable); await controller.refresh();
    expect(controller.getSnapshot().notice).toContain('No pudimos comprobar');
  });
  it('still reports removal by another client while retaining pending local changes', async () => {
    const { controller, api, repository } = setup(); await controller.refresh();
    controller.change(EXERCISE_ID, draft => ({ ...draft, sets: draft.sets.map(set => ({ ...set, actualWeightKg: '.' })) }));
    const detail = testDetail(); detail.exercises = [detail.exercises[1]]; api.detail.mockResolvedValue(ok(detail)); await controller.refresh();
    expect(controller.getSnapshot().notice).toContain('Se quitó un ejercicio en otro lugar');
    expect((await repository.readDraft(EXERCISE_ID))!.draft.sets[0].actualWeightKg).toBe('.');
  });
});

describe('native finish (M3.4-2)', () => {
  beforeEach(() => { jest.useFakeTimers(); }); afterEach(() => { jest.useRealTimers(); });
  const completeFirstSet = async (controller: ActiveSessionController) => {
    controller.change(EXERCISE_ID, draft => ({ ...draft, sets: draft.sets.map(set => ({ ...set, isCompleted: true })) }), true);
    await controller.flush(EXERCISE_ID);
  };
  const completedDetail = () => { const detail = testDetail(); detail.session = { ...detail.session, status: 'completed', endedAt: '2026-09-30T13:05:00.000000+00:00' }; return detail; };

  it('persists the summary per session and sends canonical nulls (0 pain kept, empty notes -> null)', async () => {
    const { controller, repository, api } = setup(); await controller.refresh(); await completeFirstSet(controller);
    controller.updateSummary(summary => ({ ...summary, painLevel: 0, notes: '' })); await settle();
    expect(await repository.readSummary()).toEqual({ energyLevel: null, performanceLevel: null, painLevel: 0, notes: '' });
    const restored = new ActiveSessionController(api, repository); await restored.refresh();
    expect(restored.getSnapshot().summary).toEqual({ energyLevel: null, performanceLevel: null, painLevel: 0, notes: '' });
    expect(await controller.finish()).toBe(true);
    expect(api.finish).toHaveBeenCalledWith({ metadata: { energyLevel: null, performanceLevel: null, painLevel: 0, notes: null }, idempotencyKey: expect.any(String) });
  });
  it('drains every scheduled save through CAS before finishing and locks edits meanwhile', async () => {
    const { controller, api } = setup(); await controller.refresh();
    controller.change(EXERCISE_ID, draft => ({ ...draft, sets: draft.sets.map(set => ({ ...set, isCompleted: true })) }));
    controller.change(SECOND_ID, draft => ({ ...draft, notes: 'pending' }));
    const saved = deferred<Awaited<ReturnType<ActiveSessionApi['save']>>>();
    api.save.mockReturnValueOnce(saved.promise);
    const finishing = controller.finish(); await settle();
    expect(controller.getSnapshot().finishing).toBe(true); expect(controller.canEdit(EXERCISE_ID)).toBe(false); expect(api.finish).not.toHaveBeenCalled();
    saved.resolve(ok({ sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION }));
    expect(await finishing).toBe(true);
    expect(api.save).toHaveBeenCalledTimes(2);
    const lastSave = Math.max(...api.save.mock.invocationCallOrder);
    expect(api.finish.mock.invocationCallOrder[0]).toBeGreaterThan(lastSave);
  });
  it.each([
    ['unconfirmed save (network)', (api: ReturnType<typeof setup>['api']) => { api.save.mockResolvedValueOnce(unavailable); api.sync.mockResolvedValueOnce(unavailable); }],
    ['conflicting save', (api: ReturnType<typeof setup>['api']) => {
      api.save.mockResolvedValueOnce({ status: 'conflict', code: 'SESSION_EXERCISE_CHANGED', message: 'changed', meta });
      api.sync.mockResolvedValueOnce(ok({ status: 'active', updatedAt: NEXT_VERSION, payload: { ...testPayload('remote') } }));
    }],
  ])('never finishes over a local draft the server has not confirmed: %s', async (_label, arrange) => {
    const { controller, api, repository } = setup(); await controller.refresh(); await completeFirstSet(controller);
    arrange(api); controller.change(SECOND_ID, draft => ({ ...draft, notes: 'local only' }));
    expect(await controller.finish()).toBe(false);
    expect(api.finish).not.toHaveBeenCalled(); expect(await repository.readIntent()).toBeNull();
    expect(controller.getSnapshot().notice).toContain('ROW'); expect(controller.getSnapshot().finishing).toBe(false);
    expect((await repository.readDraft(SECOND_ID))?.draft.notes).toBe('local only');
  });
  it('blocks invalid local values and sessions without completed sets before any request', async () => {
    const { controller, api } = setup(); await controller.refresh();
    expect(await controller.finish()).toBe(false); expect(controller.getSnapshot().notice).toContain('al menos una serie');
    await completeFirstSet(controller);
    controller.change(EXERCISE_ID, draft => ({ ...draft, sets: draft.sets.map(set => ({ ...set, actualReps: '' })) }));
    expect(controller.getExercise(EXERCISE_ID)?.phase).toBe('validation');
    expect(await controller.finish()).toBe(false); expect(api.finish).not.toHaveBeenCalled();
    expect(controller.canEdit(EXERCISE_ID)).toBe(true);
  });
  it('converges a double tap into one finish intent and one request', async () => {
    const { controller, api } = setup(); await controller.refresh(); await completeFirstSet(controller);
    const response = deferred<Awaited<ReturnType<ActiveSessionApi['finish']>>>();
    api.finish.mockReturnValueOnce(response.promise);
    const first = controller.finish(), second = controller.finish();
    expect(second).toBe(first); await settle();
    expect(controller.finish()).toBe(controller.finish());
    response.resolve(ok(testFinished())); expect(await first).toBe(true);
    expect(api.finish).toHaveBeenCalledTimes(1);
  });
  it('keeps everything on a lost response and replays the SAME key and metadata, then cleans up only after confirmation', async () => {
    const { controller, api, repository, values } = setup(); await controller.refresh(); await completeFirstSet(controller);
    controller.startRest(EXERCISE_ID); controller.updateSummary(summary => ({ ...summary, energyLevel: 4, notes: 'buena' })); await settle();
    api.finish.mockResolvedValueOnce(unavailable);
    expect(await controller.finish()).toBe(false);
    const intent = await repository.readIntent();
    expect(intent).toEqual({ kind: 'finish', metadata: { energyLevel: 4, performanceLevel: null, painLevel: null, notes: 'buena' }, idempotencyKey: expect.any(String) });
    expect(controller.getSnapshot().intent?.phase).toBe('uncertain'); expect(controller.getSnapshot().finished).toBeNull();
    expect(controller.getTimer()).not.toBeNull(); expect((await repository.readSummary())?.notes).toBe('buena');
    expect(controller.canEdit(EXERCISE_ID)).toBe(false);
    controller.updateSummary(summary => ({ ...summary, notes: 'changed after send' })); expect(controller.getSnapshot().summary.notes).toBe('buena');
    expect(await controller.retryIntent()).toBe(true);
    expect(api.finish).toHaveBeenCalledTimes(2);
    expect(api.finish.mock.calls[1][0]).toEqual(api.finish.mock.calls[0][0]);
    expect(api.finish.mock.calls[1][0].idempotencyKey).toBe(intent && intent.kind === 'finish' ? intent.idempotencyKey : '');
    expect(controller.getSnapshot().finished?.status).toBe('finished');
    expect(controller.getSnapshot().detail?.session.status).toBe('completed');
    expect(controller.getTimer()).toBeNull();
    expect([...values.keys()].filter(key => key.startsWith(repository.prefix))).toEqual([]);
  });
  it('recovers a pending finish after remount with the persisted key (no second effect)', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); await completeFirstSet(controller);
    api.finish.mockResolvedValueOnce(unavailable); expect(await controller.finish()).toBe(false); controller.dispose();
    api.detail.mockResolvedValue(ok(completedDetail()));
    const restored = new ActiveSessionController(api, repository); await restored.refresh();
    expect(restored.getSnapshot().intent).toMatchObject({ phase: 'uncertain', value: { kind: 'finish' } });
    expect(await restored.retryIntent()).toBe(true);
    expect(api.finish.mock.calls[1][0]).toEqual(api.finish.mock.calls[0][0]);
    expect(await repository.readIntent()).toBeNull(); expect(restored.getSnapshot().finished).not.toBeNull();
  });
  it('keeps the replay key if local cleanup fails after a confirmed finish', async () => {
    const { controller, api, repository, storage } = setup(); await controller.refresh(); await completeFirstSet(controller);
    const removeItem = storage.removeItem; let failed = false;
    storage.removeItem = async key => { if (!failed && key.endsWith('timer')) { failed = true; throw new Error('disk'); } return removeItem(key); };
    controller.startRest(EXERCISE_ID); await settle();
    expect(await controller.finish()).toBe(false);
    expect(controller.getSnapshot().intent?.phase).toBe('uncertain'); expect(await repository.readIntent()).not.toBeNull();
    expect(await controller.retryIntent()).toBe(true); expect(api.finish.mock.calls[1][0]).toEqual(api.finish.mock.calls[0][0]);
    expect(await repository.readIntent()).toBeNull();
  });
  it('treats a session closed elsewhere as a definitive outcome: clears the intent and reads server truth', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); await completeFirstSet(controller);
    api.finish.mockResolvedValueOnce({ status: 'conflict', code: 'SESSION_CLOSED', message: 'La sesión ya no está en curso.', meta });
    api.detail.mockResolvedValue(ok(completedDetail()));
    expect(await controller.finish()).toBe(false);
    expect(await repository.readIntent()).toBeNull(); expect(controller.getSnapshot().intent).toBeNull();
    expect(controller.getSnapshot().finished).toBeNull(); expect(controller.getSnapshot().detail?.session.status).toBe('completed');
    expect(controller.getSnapshot().notice).toBe('La sesión ya no está en curso.');
  });
  it('returns to editing after NO_COMPLETED_SETS, keeping drafts and the summary', async () => {
    const { controller, api, repository } = setup(); await controller.refresh(); await completeFirstSet(controller);
    controller.updateSummary(summary => ({ ...summary, notes: 'keep' })); await settle();
    api.finish.mockResolvedValueOnce({ status: 'conflict', code: 'NO_COMPLETED_SETS', message: 'Marcá y guardá al menos una serie antes de finalizar.', meta });
    expect(await controller.finish()).toBe(false);
    expect(controller.getSnapshot().intent).toBeNull(); expect(controller.canEdit(EXERCISE_ID)).toBe(true);
    expect((await repository.readSummary())?.notes).toBe('keep'); expect(controller.getSnapshot().notice).toContain('al menos una serie');
  });
  it('does not attempt a finish while offline', async () => {
    const { controller, api } = setup(); await controller.refresh(); await completeFirstSet(controller);
    api.detail.mockResolvedValueOnce(unavailable); await controller.refresh();
    expect(await controller.finish()).toBe(false); expect(api.finish).not.toHaveBeenCalled();
    expect(controller.getSnapshot().notice).toContain('Sin conexión');
  });
  it('uses chosen rest duration without a suggested range, preserving snapshots and the existing deadline storage', async () => {
    const { controller, api, repository } = setup(); const detail = testDetail();
    detail.exercises[0].restMinSecondsSnapshot = null; detail.exercises[0].restMaxSecondsSnapshot = null;
    api.detail.mockResolvedValue(ok(detail)); await controller.refresh(); controller.startRest(EXERCISE_ID);
    expect(controller.getTimer()).toBeNull(); controller.startRest(EXERCISE_ID, 75);
    expect(controller.getTimer()?.endAt).toBe(85000); expect((await repository.readTimer())).toMatchObject({ exerciseId: EXERCISE_ID, endAt: 85000 });
    controller.startRest(EXERCISE_ID, 0); controller.startRest(EXERCISE_ID, 3601); expect(controller.getTimer()?.endAt).toBe(85000);
    expect(controller.getExercise(EXERCISE_ID)?.exercise.restMaxSecondsSnapshot).toBeNull(); expect(api.save).not.toHaveBeenCalled(); controller.dispose();
  });
  it('copies actual historical series through the same draft/autosave CAS and never marks today completed', async () => {
    const { controller, api } = setup(); await controller.refresh();
    controller.change(EXERCISE_ID, draft => draftUsingHistory(draft, { sessionId: SECOND_ID, logDate: '2026-09-29', completedAt: null, routineId: null, routineName: 'PULL', decision: 'increase_weight',
      sets: [{ ...testPayload().sets[0], actualWeightKg: 0, actualReps: null, targetRir: 0, isCompleted: true }, { ...testPayload().sets[0], actualWeightKg: null, actualReps: 0, targetRir: null, isCompleted: true }] }), true);
    await controller.flush(EXERCISE_ID);
    expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, VERSION, expect.objectContaining({ isCompleted: false, decision: 'maintain', applyToRoutine: false, sets: [
      expect.objectContaining({ setNumber: 1, actualWeightKg: 0, actualReps: null, targetRir: 0, isCompleted: false }),
      expect.objectContaining({ setNumber: 2, actualWeightKg: null, actualReps: 0, targetRir: null, isCompleted: false }),
    ] })); controller.dispose();
  });

});
