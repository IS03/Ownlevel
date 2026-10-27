import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import type { SessionDetailDto } from '@/api/active-session';
import type { ActiveSessionApi } from './active-session-controller';
import { ActiveSessionController } from './active-session-controller';
import { SessionDraftRepository, type SessionStoragePort } from './active-session-storage';
import { exerciseDraft } from './active-session-model';
import { SessionExerciseActions, SESSION_UNDO_MS } from './session-exercise-actions';
import { EXERCISE_ID, NEXT_VERSION, SECOND_ID, SESSION_ID, VERSION, testDetail, testExercise, testPayload } from './active-session-test-fixtures';
const meta = { durationMs: 0, httpStatus: 200, outcome: 'ok' as const };
function fixture(detail: SessionDetailDto = testDetail()) {
  const values = new Map<string, string>();
  const port: SessionStoragePort = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
  const repository = new SessionDraftRepository(port, 'owner', SESSION_ID);
  const api = {
    detail: jest.fn<ActiveSessionApi['detail']>().mockImplementation(async () => ({ status: 'ok', data: detail, meta })),
    sync: jest.fn<ActiveSessionApi['sync']>(),
    save: jest.fn<ActiveSessionApi['save']>().mockImplementation(async (id, _version, payload) => {
      detail = { ...detail, exercises: detail.exercises.map(row => row.id === id ? { ...row, payload, updatedAt: NEXT_VERSION } : row) };
      return { status: 'ok', data: { sessionExerciseId: id, updatedAt: NEXT_VERSION }, meta };
    }),
    add: jest.fn<ActiveSessionApi['add']>().mockImplementation(async input => {
      const row = testExercise('44444444-4444-4444-8444-444444444444', 3);
      if (input.operation === 'add_existing') row.exerciseId = input.exerciseId;
      detail = { ...detail, exercises: [...detail.exercises, row] };
      return { status: 'ok', data: { status: 'added', sessionId: SESSION_ID, sessionExerciseId: row.id, exerciseId: row.exerciseId }, meta };
    }),
    remove: jest.fn<ActiveSessionApi['remove']>().mockImplementation(async id => { detail = { ...detail, exercises: detail.exercises.filter(row => row.id !== id) }; return { status: 'ok', data: { status: 'removed', sessionId: SESSION_ID, sessionExerciseId: id }, meta }; }),
    cancel: jest.fn<ActiveSessionApi['cancel']>(), finish: jest.fn<ActiveSessionApi['finish']>(),
    reorder: jest.fn<ActiveSessionApi['reorder']>().mockImplementation(async input => {
      const rows = new Map(detail.exercises.map(row => [row.id, row]));
      detail = { ...detail, session: { ...detail.session, updatedAt: NEXT_VERSION },
        exercises: input.orderedSessionExerciseIds.map((id, index) => ({ ...rows.get(id)!, order: index + 1 })) };
      return { status: 'ok', data: { status: 'reordered', sessionId: SESSION_ID, sessionUpdatedAt: NEXT_VERSION, orderedSessionExerciseIds: input.orderedSessionExerciseIds }, meta };
    }),
  };
  let key = 0;
  const controller = new ActiveSessionController(api, repository, () => `key-${++key}`);
  const actions = new SessionExerciseActions(controller);
  return { api, repository, controller, actions, port };
}
beforeEach(() => { jest.useFakeTimers(); }); afterEach(() => { jest.useRealTimers(); });
it('persists the last removal before six seconds, including exit and a fresh controller read', async () => {
  const { api, controller, actions, repository } = fixture(); await controller.refresh(); actions.activate();
  await actions.remove(EXERCISE_ID);
  actions.cancelWindow(); controller.suspend();
  expect(api.remove).toHaveBeenCalledTimes(1);
  const reopened = new ActiveSessionController(api, repository); await reopened.refresh();
  expect(reopened.getSnapshot().detail?.exercises.map(row => row.id)).toEqual([SECOND_ID]);
  actions.dispose(); controller.dispose(); reopened.dispose();
});
it('does not announce success before a persistence error', async () => {
  const { api, controller, actions } = fixture(); await controller.refresh(); actions.activate();
  api.remove.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } });
  expect(await actions.remove(EXERCISE_ID)).toBe(false);
  expect(actions.getSnapshot().notice?.message).not.toContain('quitado');
  expect(controller.getSnapshot().detail?.exercises.map(row => row.id)).toContain(EXERCISE_ID);
  expect(controller.getSnapshot().intent?.phase).toBe('uncertain');
  actions.dispose(); controller.dispose();
});
it('keeps the exercise and its exact draft until persistence confirms, with no success or inverse write', async () => {
  const { api, controller, actions } = fixture(); await controller.refresh(); actions.activate();
  controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'Technique', sets: draft.sets.map(set => ({ ...set, isCompleted: true })) }));
  const before = controller.getExercise(EXERCISE_ID)!.draft;
  let proceed!: () => void; const gate = new Promise<void>(resolve => { proceed = resolve; }), remove = api.remove.getMockImplementation()!;
  api.remove.mockImplementation(async (...args) => { await gate; return remove(...args); });
  const removing = actions.remove(EXERCISE_ID);
  expect(actions.getSnapshot().working).toBe(true);
  expect(actions.getSnapshot().notice?.message).toBe('Quitando PRESS…');
  expect(controller.getSnapshot().detail?.exercises.map(row => row.id)).toContain(EXERCISE_ID);
  await actions.undo(); expect(controller.getExercise(EXERCISE_ID)!.draft).toBe(before);
  expect(await actions.remove(EXERCISE_ID)).toBe(false);
  proceed(); expect(await removing).toBe(true);
  expect(actions.getSnapshot().notice).toEqual({ message: 'PRESS quitado', undo: null });
  expect(api.remove).toHaveBeenCalledTimes(1); expect(api.add).not.toHaveBeenCalled();
  actions.dispose(); controller.dispose();
});
it('waits for an autosave in flight and removes with its confirmed CAS version, exactly once', async () => {
  const { api, controller, actions } = fixture(); await controller.refresh(); actions.activate();
  let complete!: (value: Awaited<ReturnType<ActiveSessionApi['save']>>) => void;
  api.save.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'today' }), true);
  await jest.advanceTimersByTimeAsync(0); expect(api.save).toHaveBeenCalledTimes(1);
  const removing = actions.remove(EXERCISE_ID); await jest.advanceTimersByTimeAsync(0);
  expect(api.remove).not.toHaveBeenCalled();
  complete({ status: 'ok', data: { sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION }, meta });
  expect(await removing).toBe(true); expect(api.remove).toHaveBeenCalledTimes(1); expect(api.remove).toHaveBeenCalledWith(EXERCISE_ID, NEXT_VERSION, expect.any(String));
  actions.dispose(); controller.dispose();
});
it('does not cancel an in-flight removal on background/exit', async () => {
  const { api, controller, actions } = fixture(); await controller.refresh(); actions.activate();
  let proceed!: () => void; const gate = new Promise<void>(resolve => { proceed = resolve; }), remove = api.remove.getMockImplementation()!;
  api.remove.mockImplementation(async (...args) => { await gate; return remove(...args); });
  const removing = actions.remove(EXERCISE_ID); await jest.advanceTimersByTimeAsync(0);
  actions.cancelWindow(); actions.dispose(); controller.suspend(); proceed();
  expect(await removing).toBe(true); await controller.resume();
  expect(controller.getSnapshot().detail?.exercises.map(row => row.id)).toEqual([SECOND_ID]);
  expect(api.remove).toHaveBeenCalledTimes(1); controller.dispose();
});
it('keeps an ambiguous deletion in the existing durable intent and offers no undo or re-add', async () => {
  const { api, controller, actions, repository } = fixture(); await controller.refresh(); actions.activate();
  api.remove.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } });
  await actions.remove(EXERCISE_ID);
  expect(controller.getSnapshot().intent?.phase).toBe('uncertain'); const intent = await repository.readIntent(); expect(intent?.kind).toBe('remove');
  await actions.undo(); expect(api.remove).toHaveBeenCalledTimes(1); expect(api.add).not.toHaveBeenCalled();
  actions.dispose(); controller.dispose();
});
it('reveals a confirmed add, then permanently removes its undo after a user edit, even once autosaved', async () => {
  const { api, controller, actions } = fixture(); await controller.refresh(); actions.activate();
  await actions.add({ operation: 'add_existing', exerciseId: '55555555-5555-4555-8555-555555555555', idempotencyKey: 'one-add' }, 'ROW');
  const addedId = actions.getSnapshot().addedId!; expect(addedId).toBeTruthy(); expect(actions.getSnapshot().notice?.undo).toBe('added');
  controller.change(addedId, draft => ({ ...draft, sets: draft.sets.map(set => ({ ...set, actualReps: '0' })) }), true);
  await controller.flush(addedId); expect(actions.getSnapshot().notice?.undo).toBeNull(); await actions.undo(); expect(api.remove).not.toHaveBeenCalled();
  expect(api.add).toHaveBeenCalledTimes(1); actions.dispose(); controller.dispose();
});
it('undoes an untouched add through the existing remove only', async () => {
  const { api, controller, actions } = fixture(); await controller.refresh(); actions.activate();
  await actions.add({ operation: 'add_existing', exerciseId: '55555555-5555-4555-8555-555555555555', idempotencyKey: 'one-add' }, 'ROW');
  const addedId = actions.getSnapshot().addedId!; await actions.undo();
  expect(api.remove).toHaveBeenCalledWith(addedId, VERSION, expect.any(String)); actions.dispose(); controller.dispose();
});
it('blocks removal on conflict and preserves the local draft instead of creating an inverse write', async () => {
  const { api, controller, actions, repository } = fixture(); await controller.refresh(); actions.activate();
  controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'unsaved', sets: draft.sets.map(set => ({ ...set, actualReps: '11', actualWeightKg: '42.5', targetRir: 1 })) }));
  const before = controller.getExercise(EXERCISE_ID)!.draft;
  const remote = testDetail(); remote.exercises[0] = { ...remote.exercises[0], updatedAt: NEXT_VERSION, payload: testPayload('remote') };
  api.detail.mockResolvedValue({ status: 'ok', data: remote, meta });
  api.remove.mockResolvedValue({ status: 'conflict', code: 'SESSION_EXERCISE_CHANGED', message: 'Cambió', meta: { ...meta, outcome: 'conflict' } });
  expect(await actions.remove(EXERCISE_ID)).toBe(false);
  expect((await repository.readDraft(EXERCISE_ID))?.draft).toEqual(before);
  expect(controller.getSnapshot().notice).toBe('Cambió'); expect(actions.getSnapshot().notice?.message).not.toContain('quitado');
  expect(api.add).not.toHaveBeenCalled(); expect(controller.getExercise(EXERCISE_ID)).not.toBeNull(); actions.dispose(); controller.dispose();
});

const THIRD_ID = '66666666-6666-4666-8666-666666666666';
function routineDetail() {
  const detail = testDetail();
  detail.session = { ...detail.session, routineId: '77777777-7777-4777-8777-777777777777', routineNameSnapshot: 'PUSH' };
  detail.exercises = [...detail.exercises, testExercise(THIRD_ID, 3)].map((row, index) => ({ ...row,
    exerciseId: `88888888-8888-4888-8888-88888888888${index}`, routineExerciseId: `99999999-9999-4999-8999-99999999999${index}`,
    payload: { ...row.payload, isCompleted: true, sets: [{ ...row.payload.sets[0], actualReps: 9 + index, actualWeightKg: index === 0 ? 0 : 42.5 + index, targetRir: index === 2 ? null : index, isCompleted: true }] },
  }));
  return detail;
}
it.each([0, 1, 2])('removes position %i by session exercise identity and preserves remaining payloads after reload/reentry', async position => {
  const original = routineDetail(), target = original.exercises[position], remaining = original.exercises.filter(row => row.id !== target.id);
  const { controller, actions, api, repository } = fixture(original); await controller.refresh(); actions.activate();
  expect(await actions.remove(target.id)).toBe(true);
  expect(api.remove).toHaveBeenCalledWith(target.id, target.updatedAt, expect.any(String));
  expect(api.reorder).not.toHaveBeenCalled();
  await controller.refresh(); expect(controller.getSnapshot().detail?.exercises).toEqual(remaining);
  controller.suspend(); await controller.resume(); expect(controller.getSnapshot().detail?.exercises).toEqual(remaining);
  actions.dispose(); controller.dispose();
  const reopened = new ActiveSessionController(api, repository); await reopened.refresh();
  expect(reopened.getSnapshot().detail?.exercises).toEqual(remaining);
  expect(reopened.getSnapshot().detail?.session.routineId).toBe(original.session.routineId);
  expect(reopened.getProgress().exercises).toBe(2); expect(reopened.getProgress().completedSets).toBe(2);
  expect(api.add).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled(); reopened.dispose();
});
it('persists consecutive removals including the last exercise, without a timer or reorder', async () => {
  const { controller, actions, api, repository } = fixture(routineDetail()); await controller.refresh(); actions.activate();
  for (const id of [SECOND_ID, EXERCISE_ID, THIRD_ID]) expect(await actions.remove(id)).toBe(true);
  expect(api.remove.mock.calls.map(args => args[0])).toEqual([SECOND_ID, EXERCISE_ID, THIRD_ID]);
  expect(new Set(api.remove.mock.calls.map(args => args[2])).size).toBe(3);
  actions.dispose(); controller.dispose();
  const reopened = new ActiveSessionController(api, repository); await reopened.refresh();
  expect(reopened.getSnapshot().detail?.exercises).toEqual([]); expect(reopened.getProgress().exercises).toBe(0);
  expect(api.reorder).not.toHaveBeenCalled(); reopened.dispose();
});
it('persists reorder then remove without changing the other exercises or their sets', async () => {
  const original = routineDetail(), { controller, actions, api, repository } = fixture(original); await controller.refresh(); actions.activate();
  expect(controller.beginExerciseDrag()).toBe(true);
  expect(await controller.dropExercises([THIRD_ID, EXERCISE_ID, SECOND_ID])).toBe(true);
  expect(await actions.remove(EXERCISE_ID)).toBe(true);
  actions.dispose(); controller.dispose();
  const reopened = new ActiveSessionController(api, repository); await reopened.refresh();
  expect(reopened.getSnapshot().detail?.exercises).toEqual([
    { ...original.exercises[2], order: 1 }, { ...original.exercises[1], order: 3 },
  ]); reopened.dispose();
});
it('preserves another exercise pending reps, weight, RIR and completion while removing, then autosaves on resume', async () => {
  const { controller, actions, api, repository } = fixture(); await controller.refresh(); actions.activate();
  controller.change(SECOND_ID, draft => ({ ...draft, notes: 'keep', sets: draft.sets.map(set => ({ ...set, actualReps: '12', actualWeightKg: '47.5', targetRir: 0, isCompleted: true })) }));
  const expected = controller.getExercise(SECOND_ID)!.draft; controller.suspend();
  expect(await actions.remove(EXERCISE_ID)).toBe(true);
  expect(controller.getExercise(SECOND_ID)?.draft).toEqual(expected);
  expect((await repository.readDraft(SECOND_ID))?.draft).toEqual(expected);
  await controller.resume(); await controller.flush(SECOND_ID);
  actions.dispose(); controller.dispose();
  const reopened = new ActiveSessionController(api, repository); await reopened.refresh();
  expect(reopened.getSnapshot().detail?.exercises).toHaveLength(1);
  expect(reopened.getExercise(SECOND_ID)?.draft).toMatchObject({ notes: 'keep', sets: [{ actualReps: '12', actualWeightKg: '47,5', targetRir: 0, isCompleted: true }] });
  expect(api.save).toHaveBeenCalledTimes(1); reopened.dispose();
});
it('keeps a confirmed removal and correct counters when the follow-up read is unavailable', async () => {
  const { controller, actions, api } = fixture(); await controller.refresh(); actions.activate();
  api.detail.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } });
  expect(await actions.remove(EXERCISE_ID)).toBe(true);
  expect(controller.getSnapshot().detail?.exercises.map(row => row.id)).toEqual([SECOND_ID]);
  expect(controller.getProgress().exercises).toBe(1); expect(controller.getProgress().totalSets).toBe(1);
  expect(controller.getSnapshot().notice).toContain('No pudimos comprobar');
  await controller.refresh(); expect(controller.getSnapshot().detail?.exercises.map(row => row.id)).toEqual([SECOND_ID]);
  actions.dispose(); controller.dispose();
});
it.each([false, true])('checks an ambiguous removal with the same key after remount, even with an unavailable initial read (%s)', async unavailableRead => {
  const { controller, actions, api, repository } = fixture(); await controller.refresh(); actions.activate();
  const remove = api.remove.getMockImplementation()!;
  api.remove.mockResolvedValueOnce({ status: 'unavailable', reason: 'timeout', meta: { ...meta, outcome: 'unavailable' } });
  expect(await actions.remove(EXERCISE_ID)).toBe(false);
  const request = api.remove.mock.calls[0]; actions.dispose(); controller.dispose();
  if (unavailableRead) api.detail.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } });
  const reopened = new ActiveSessionController(api, repository); await reopened.refresh();
  expect(reopened.getSnapshot().intent?.phase).toBe('uncertain'); expect(api.remove).toHaveBeenCalledTimes(1);
  api.remove.mockImplementation(remove); expect(await reopened.retryIntent()).toBe(true);
  expect(api.remove.mock.calls[1]).toEqual(request); expect(reopened.getSnapshot().detail?.exercises.map(row => row.id)).toEqual([SECOND_ID]);
  expect(await repository.readIntent()).toBeNull(); reopened.dispose();
});
it('does not send or show success when the local intent cannot be persisted', async () => {
  const { controller, actions, api, port } = fixture(); await controller.refresh(); actions.activate();
  port.setItem = async () => { throw new Error('disk unavailable'); };
  expect(await actions.remove(EXERCISE_ID)).toBe(false); expect(api.remove).not.toHaveBeenCalled();
  expect(controller.getSnapshot().storageError).toBe(true); expect(controller.getSnapshot().notice).toContain('No se envió');
  expect(actions.getSnapshot().notice?.message).not.toContain('quitado');
  expect(controller.getSnapshot().detail?.exercises.map(row => row.id)).toContain(EXERCISE_ID);
  actions.dispose(); controller.dispose();
});
it('retains the durable intent if unmounted during the request, then checks a committed result with the same key', async () => {
  const { controller, actions, api, repository } = fixture(); await controller.refresh(); actions.activate();
  let proceed!: () => void; const gate = new Promise<void>(resolve => { proceed = resolve; }), remove = api.remove.getMockImplementation()!;
  let receipt!: Awaited<ReturnType<ActiveSessionApi['remove']>>;
  api.remove.mockImplementationOnce(async (...args) => { await gate; receipt = await remove(...args); return receipt; });
  const removing = actions.remove(EXERCISE_ID); await jest.advanceTimersByTimeAsync(0);
  const request = api.remove.mock.calls[0]; expect(request).toBeDefined();
  expect(await repository.readIntent()).toMatchObject({ kind: 'remove', exerciseId: request[0], expectedUpdatedAt: request[1], idempotencyKey: request[2] });
  actions.dispose(); controller.dispose(); proceed(); expect(await removing).toBe(false);
  const reopened = new ActiveSessionController(api, repository); await reopened.refresh();
  expect(reopened.getSnapshot().detail?.exercises.map(row => row.id)).toEqual([SECOND_ID]);
  expect(reopened.getSnapshot().intent?.phase).toBe('uncertain'); expect(api.remove).toHaveBeenCalledTimes(1);
  api.remove.mockResolvedValueOnce(receipt); expect(await reopened.retryIntent()).toBe(true);
  expect(api.remove.mock.calls[1]).toEqual(request); expect(await repository.readIntent()).toBeNull();
  expect(reopened.getSnapshot().detail?.exercises.map(row => row.id)).toEqual([SECOND_ID]);
  expect(api.add).not.toHaveBeenCalled(); reopened.dispose();
});
it('persists history dismissal separately from drafts and isolates user/session keys', async () => {
  const { repository, controller, port } = fixture(); await repository.writeDraft({ version: 1, sessionId: SESSION_ID, sessionExerciseId: EXERCISE_ID, serverUpdatedAt: VERSION, basePayload: testPayload(), draft: exerciseDraft(testPayload()), writeId: 'untouched' });
  await Promise.all([repository.dismissHistory(EXERCISE_ID), repository.dismissHistory(SECOND_ID)]);
  expect(await repository.readDismissedHistory()).toEqual([EXERCISE_ID, SECOND_ID]); expect((await repository.readDraft(EXERCISE_ID))?.writeId).toBe('untouched'); expect((await repository.readIntent())).toBeNull();
  const anotherUser = new SessionDraftRepository(port, 'another-owner', SESSION_ID), anotherSession = new SessionDraftRepository(port, 'owner', 'another-session');
  expect(await anotherUser.readDismissedHistory()).toEqual([]); expect(await anotherSession.readDismissedHistory()).toEqual([]);
  await anotherUser.dismissHistory(SECOND_ID); await repository.clearSession();
  expect(await repository.readDismissedHistory()).toEqual([]); expect(await anotherUser.readDismissedHistory()).toEqual([SECOND_ID]);
  controller.dispose();
});

it('does not remove after disposal or attach a late add notice after leaving the screen', async () => {
  const first = fixture(); await first.controller.refresh(); first.actions.activate();
  first.actions.dispose(); const pendingRemoval = first.actions.remove(EXERCISE_ID);
  expect(await pendingRemoval).toBe(false); await jest.advanceTimersByTimeAsync(SESSION_UNDO_MS); expect(first.api.remove).not.toHaveBeenCalled(); first.controller.dispose();
  const next = fixture(); await next.controller.refresh(); next.actions.activate();
  let proceed!: () => void; const gate = new Promise<void>(resolve => { proceed = resolve; }), add = next.api.add.getMockImplementation()!;
  next.api.add.mockImplementation(async input => { await gate; return add(input); });
  const pendingAdd = next.actions.add({ operation: 'add_existing', exerciseId: '55555555-5555-4555-8555-555555555555', idempotencyKey: 'late-add' }, 'ROW');
  for (let i = 0; i < 12; i++) await Promise.resolve();
  next.actions.dispose(); proceed(); await pendingAdd;
  expect(next.actions.getSnapshot().notice).toBeNull(); expect(next.actions.getSnapshot().addedId).toBeNull(); next.controller.dispose();
});
