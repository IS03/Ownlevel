import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import type { ActiveSessionApi } from './active-session-controller';
import { ActiveSessionController } from './active-session-controller';
import { SessionDraftRepository, type SessionStoragePort } from './active-session-storage';
import { exerciseDraft } from './active-session-model';
import { SessionExerciseActions, SESSION_UNDO_MS } from './session-exercise-actions';
import { EXERCISE_ID, NEXT_VERSION, SECOND_ID, SESSION_ID, VERSION, testDetail, testExercise, testPayload } from './active-session-test-fixtures';
const meta = { durationMs: 0, httpStatus: 200, outcome: 'ok' as const };
function fixture() {
  let detail = testDetail();
  const values = new Map<string, string>();
  const port: SessionStoragePort = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
  const repository = new SessionDraftRepository(port, 'owner', SESSION_ID);
  const api = {
    detail: jest.fn<ActiveSessionApi['detail']>().mockImplementation(async () => ({ status: 'ok', data: detail, meta })),
    sync: jest.fn<ActiveSessionApi['sync']>(),
    save: jest.fn<ActiveSessionApi['save']>().mockImplementation(async id => ({ status: 'ok', data: { sessionExerciseId: id, updatedAt: NEXT_VERSION }, meta })),
    add: jest.fn<ActiveSessionApi['add']>().mockImplementation(async input => {
      const row = testExercise('44444444-4444-4444-8444-444444444444', 3);
      if (input.operation === 'add_existing') row.exerciseId = input.exerciseId;
      detail = { ...detail, exercises: [...detail.exercises, row] };
      return { status: 'ok', data: { status: 'added', sessionId: SESSION_ID, sessionExerciseId: row.id, exerciseId: row.exerciseId }, meta };
    }),
    remove: jest.fn<ActiveSessionApi['remove']>().mockImplementation(async id => { detail = { ...detail, exercises: detail.exercises.filter(row => row.id !== id) }; return { status: 'ok', data: { status: 'removed', sessionId: SESSION_ID, sessionExerciseId: id }, meta }; }),
    cancel: jest.fn<ActiveSessionApi['cancel']>(), finish: jest.fn<ActiveSessionApi['finish']>(), reorder: jest.fn<ActiveSessionApi['reorder']>(),
  };
  let key = 0;
  const controller = new ActiveSessionController(api, repository, () => `key-${++key}`);
  const actions = new SessionExerciseActions(controller);
  return { api, repository, controller, actions, port };
}
beforeEach(() => { jest.useFakeTimers(); }); afterEach(() => { jest.useRealTimers(); });
it('undoes a UI-only removal with the exact same draft, completion and identity, without a remove/add write', async () => {
  const { api, controller, actions } = fixture(); await controller.refresh(); actions.activate();
  controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'Technique', sets: draft.sets.map(set => ({ ...set, isCompleted: true })) }));
  const before = controller.getExercise(EXERCISE_ID)!.draft;
  await actions.stageRemoval(EXERCISE_ID); expect(actions.getSnapshot().hiddenId).toBe(EXERCISE_ID);
  await actions.undo(); expect(controller.getExercise(EXERCISE_ID)!.draft).toBe(before); expect(actions.getSnapshot().hiddenId).toBeNull();
  await jest.advanceTimersByTimeAsync(SESSION_UNDO_MS); expect(api.remove).not.toHaveBeenCalled(); expect(api.add).not.toHaveBeenCalled();
  actions.dispose(); controller.dispose();
});
it('waits for an autosave in flight and removes with its confirmed CAS version, exactly once', async () => {
  const { api, controller, actions } = fixture(); await controller.refresh(); actions.activate();
  let complete!: (value: Awaited<ReturnType<ActiveSessionApi['save']>>) => void;
  api.save.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'today' }), true);
  await actions.stageRemoval(EXERCISE_ID); await jest.advanceTimersByTimeAsync(SESSION_UNDO_MS);
  expect(api.remove).not.toHaveBeenCalled();
  complete({ status: 'ok', data: { sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION }, meta });
  await actions.settleRemoval(); expect(api.remove).toHaveBeenCalledTimes(1); expect(api.remove).toHaveBeenCalledWith(EXERCISE_ID, NEXT_VERSION, expect.any(String));
  actions.dispose(); controller.dispose();
});
it('cancels the deferred delete on background/exit and keeps recoverable drafts on process restart', async () => {
  const { api, controller, actions, repository } = fixture(); await controller.refresh(); actions.activate();
  controller.change(EXERCISE_ID, draft => ({ ...draft, notes: 'unsaved' }));
  await actions.stageRemoval(EXERCISE_ID); actions.cancelWindow(); controller.suspend();
  await jest.advanceTimersByTimeAsync(SESSION_UNDO_MS); expect(api.remove).not.toHaveBeenCalled(); expect(actions.getSnapshot().hiddenId).toBeNull();
  expect((await repository.readDraft(EXERCISE_ID))?.draft.notes).toBe('unsaved'); actions.dispose(); controller.dispose();
});
it('keeps an ambiguous deletion in the existing durable intent and offers no undo or re-add', async () => {
  const { api, controller, actions, repository } = fixture(); await controller.refresh(); actions.activate();
  api.remove.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } });
  await actions.stageRemoval(EXERCISE_ID); await actions.settleRemoval();
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
it('blocks a deferred removal on conflict and preserves the local draft instead of creating an inverse write', async () => {
  const { api, controller, actions } = fixture(); await controller.refresh(); actions.activate();
  api.remove.mockResolvedValue({ status: 'conflict', code: 'SESSION_EXERCISE_CHANGED', message: 'Cambió', meta: { ...meta, outcome: 'conflict' } });
  await actions.stageRemoval(EXERCISE_ID); expect(await actions.settleRemoval()).toBe(false); expect(actions.getSnapshot().hiddenId).toBeNull();
  expect(api.add).not.toHaveBeenCalled(); expect(controller.getExercise(EXERCISE_ID)).not.toBeNull(); actions.dispose(); controller.dispose();
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

it('does not stage a removal after disposal or attach a late add notice after leaving the screen', async () => {
  const first = fixture(); await first.controller.refresh(); first.actions.activate();
  const pendingRemoval = first.actions.stageRemoval(EXERCISE_ID); first.actions.dispose();
  expect(await pendingRemoval).toBe(false); await jest.advanceTimersByTimeAsync(SESSION_UNDO_MS); expect(first.api.remove).not.toHaveBeenCalled(); first.controller.dispose();
  const next = fixture(); await next.controller.refresh(); next.actions.activate();
  let proceed!: () => void; const gate = new Promise<void>(resolve => { proceed = resolve; }), add = next.api.add.getMockImplementation()!;
  next.api.add.mockImplementation(async input => { await gate; return add(input); });
  const pendingAdd = next.actions.add({ operation: 'add_existing', exerciseId: '55555555-5555-4555-8555-555555555555', idempotencyKey: 'late-add' }, 'ROW');
  for (let i = 0; i < 12; i++) await Promise.resolve();
  next.actions.dispose(); proceed(); await pendingAdd;
  expect(next.actions.getSnapshot().notice).toBeNull(); expect(next.actions.getSnapshot().addedId).toBeNull(); next.controller.dispose();
});
