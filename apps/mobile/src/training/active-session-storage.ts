import { parseSessionExerciseOrder, parseSessionFinishMetadata, type SessionAddInput, type SessionExerciseOrderInput, type SessionFinishMetadata } from '@/api/active-session';
import { parseStoredExerciseDraft, parseStoredSummary, type RestDeadline, type SessionSummaryDraft, type StoredExerciseDraft } from './active-session-model';

export type SessionStoragePort = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  getAllKeys: () => Promise<readonly string[]>;
};
export type StructuralIntent =
  | { kind: 'add'; input: SessionAddInput }
  | { kind: 'reorder'; input: SessionExerciseOrderInput }
  | { kind: 'remove'; exerciseId: string; expectedUpdatedAt: string; idempotencyKey: string; draftWriteId?: string }
  | { kind: 'cancel'; idempotencyKey: string }
  // Metadata is frozen with the key: a recovery replays the identical request.
  | { kind: 'finish'; metadata: SessionFinishMetadata; idempotencyKey: string };
// A shared queue per port/key prevents unmount/remount storage writes from racing.
const queues = new WeakMap<SessionStoragePort, Map<string, Promise<unknown>>>();
export class SessionDraftRepository {
  readonly prefix: string;
  private readonly queue: Map<string, Promise<unknown>>;
  constructor(private readonly port: SessionStoragePort, userId: string, readonly sessionId: string) {
    this.prefix = `ownlevel.active.v1.${encodeURIComponent(userId)}.${encodeURIComponent(sessionId)}.`;
    this.queue = queues.get(port) ?? new Map(); queues.set(port, this.queue);
  }
  private serialize<T>(key: string, action: () => Promise<T>): Promise<T> {
    const operation = (this.queue.get(key) ?? Promise.resolve()).catch(() => undefined).then(action);
    this.queue.set(key, operation);
    void operation.finally(() => { if (this.queue.get(key) === operation) this.queue.delete(key); }).catch(() => undefined);
    return operation;
  }
  private async read(key: string): Promise<unknown> {
    return this.serialize(key, async () => {
      const raw = await this.port.getItem(key);
      if (raw === null) return null;
      try { return JSON.parse(raw); } catch { throw new Error('Unreadable local session record'); }
    });
  }
  private write(key: string, value: unknown) { return this.serialize(key, () => this.port.setItem(key, JSON.stringify(value))); }
  readDraft(id: string): Promise<StoredExerciseDraft | null> {
    return this.read(`${this.prefix}exercise.${id}`).then(value => {
      if (value === null) return null;
      const parsed = parseStoredExerciseDraft(value, this.sessionId, id);
      if (!parsed) throw new Error('Invalid local exercise draft');
      return parsed;
    });
  }
  writeDraft(draft: StoredExerciseDraft) { return this.write(`${this.prefix}exercise.${draft.sessionExerciseId}`, draft); }
  removeDraft(id: string, onlyWriteId?: string) {
    const key = `${this.prefix}exercise.${id}`;
    return this.serialize(key, async () => {
      if (onlyWriteId) {
        const raw = await this.port.getItem(key);
        if (raw && (JSON.parse(raw) as StoredExerciseDraft).writeId !== onlyWriteId) return;
      }
      await this.port.removeItem(key);
    });
  }
  async readDismissedHistory(): Promise<string[]> {
    const value = await this.read(`${this.prefix}ui.history-dismissals`);
    return Array.isArray(value) && value.every(id => typeof id === 'string') ? value : [];
  }
  dismissHistory(exerciseId: string) {
    const key = `${this.prefix}ui.history-dismissals`;
    return this.serialize(key, async () => {
      const raw = await this.port.getItem(key);
      const value: unknown = raw ? JSON.parse(raw) : [];
      const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
      await this.port.setItem(key, JSON.stringify([...new Set([...ids, exerciseId])]));
    });
  }
  readTimer() { return this.read(`${this.prefix}timer`); }
  writeTimer(timer: RestDeadline | null) {
    const key = `${this.prefix}timer`;
    return timer ? this.write(key, timer) : this.serialize(key, () => this.port.removeItem(key));
  }
  async readIntent(): Promise<StructuralIntent | null> {
    const value = await this.read(`${this.prefix}intent`);
    if (value === null) return null;
    const intent = value as StructuralIntent;
    const key = intent.kind === 'add' || intent.kind === 'reorder' ? intent.input?.idempotencyKey : intent.idempotencyKey;
    if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new Error('Invalid pending intent');
    if (intent.kind === 'cancel') return intent;
    if (intent.kind === 'finish' && parseSessionFinishMetadata(intent.metadata)) return intent;
    if (intent.kind === 'reorder' && parseSessionExerciseOrder({ status: 'reordered', sessionId: this.sessionId,
      sessionUpdatedAt: intent.input.expectedSessionUpdatedAt, orderedSessionExerciseIds: intent.input.orderedSessionExerciseIds })) return intent;
    if (intent.kind === 'remove' && typeof intent.exerciseId === 'string' && typeof intent.expectedUpdatedAt === 'string') return intent;
    if (intent.kind === 'add' && ((intent.input.operation === 'add_existing' && typeof intent.input.exerciseId === 'string') ||
      (intent.input.operation === 'create_and_add' && intent.input.exercise && typeof intent.input.exercise.name === 'string'))) return intent;
    throw new Error('Invalid pending intent');
  }
  readSummary(): Promise<SessionSummaryDraft | null> {
    return this.read(`${this.prefix}metadata`).then(value => {
      if (value === null) return null;
      const parsed = parseStoredSummary(value);
      if (!parsed) throw new Error('Invalid local session summary');
      return parsed;
    });
  }
  writeSummary(summary: SessionSummaryDraft) { return this.write(`${this.prefix}metadata`, summary); }
  writeIntent(intent: StructuralIntent) { return this.write(`${this.prefix}intent`, intent); }
  clearIntent() { return this.serialize(`${this.prefix}intent`, () => this.port.removeItem(`${this.prefix}intent`)); }
  async clearSession() {
    await Promise.all([...this.queue.entries()].filter(([key]) => key.startsWith(this.prefix)).map(([, job]) => job.catch(() => undefined)));
    const keys = await this.port.getAllKeys();
    await Promise.all(keys.filter(key => key.startsWith(`${this.prefix}exercise.`) || key === `${this.prefix}timer` || key === `${this.prefix}metadata` || key.startsWith(`${this.prefix}ui.`))
      .map(key => this.serialize(key, () => this.port.removeItem(key))));
    // Keep the replay key until every draft/timer cleanup has succeeded.
    await this.clearIntent();
  }
}
