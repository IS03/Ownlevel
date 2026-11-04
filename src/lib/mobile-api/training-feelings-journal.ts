import { FEELING_KEYS, parseFeelingsInput, parseFeelingsResponse, type FeelingKey, type FeelingPatch, type FeelingsFinishInput, type FeelingsResponse, type FeelingsSaveInput } from './training-feelings-contract';

export const FEELING_LABELS = {
  energy: ['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'],
  fatigue: ['Ninguna', 'Poca', 'Moderada', 'Mucha', 'Muchísima'],
} as const;
export type FeelingsInput = FeelingsSaveInput | FeelingsFinishInput;
export type FeelingsResult = { status: 'ok'; data: FeelingsResponse } | { status: 'conflict'; message?: string } | { status: string };
export type FeelingsPort = { read: () => Promise<FeelingsResult>; write: (input: FeelingsInput) => Promise<FeelingsResult> };
export type FeelingsStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; lock?: <T>(key: string, action: () => Promise<T>) => Promise<T> };
type RecordV1 = { version: 1; server: FeelingsResponse | null; patch: FeelingPatch; baseRevision: number | null; pending: FeelingsInput | null; blocked: boolean };
export type FeelingsSnapshot = RecordV1 & { ready: boolean; busy: boolean; readError: boolean; localError: boolean; error: string | null };
const empty = (): RecordV1 => ({ version: 1, server: null, patch: {}, baseRevision: null, pending: null, blocked: false });
const queues = new WeakMap<FeelingsStorage, Map<string, Promise<unknown>>>();

/** One session's journal. Never derive a new write from an uncertain result. */
export class TrainingFeelingsJournal {
  readonly key: string;
  private state: FeelingsSnapshot = { ...empty(), ready: false, busy: false, readError: false, localError: false, error: null };
  private listeners = new Set<() => void>();
  private disposed = false;
  constructor(private storage: FeelingsStorage, private port: FeelingsPort, userId: string, private sessionId: string,
    private source: 'web' | 'mobile', private newKey: () => string, private now: () => Date = () => new Date()) {
    this.key = `ownlevel.feelings.v1.${encodeURIComponent(userId)}.${encodeURIComponent(sessionId)}`;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  activate() { this.disposed = false; }
  dispose() { this.disposed = true; }
  private publish(update: Partial<FeelingsSnapshot>) {
    this.state = { ...this.state, ...update };
    if (!this.disposed) this.listeners.forEach(fn => fn());
  }
  private async persist(update: Partial<RecordV1>) {
    const next = { ...this.state, ...update };
    const record: RecordV1 = { version: 1, server: next.server, patch: next.patch, baseRevision: next.baseRevision, pending: next.pending, blocked: next.blocked };
    await this.storage.setItem(this.key, JSON.stringify(record));
    this.publish(record);
  }
  private async hydrate() {
    const raw = await this.storage.getItem(this.key);
    if (!raw) { this.publish({ ...empty(), ready: true }); return; }
    const value = JSON.parse(raw) as RecordV1;
    if (value.version !== 1 || typeof value.blocked !== 'boolean' || (value.baseRevision !== null && (!Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0))) throw Error('Invalid feelings journal');
    const patch = parseFeelingsInput({ contractVersion: 'training-feelings/1', operation: 'save', expectedRevision: value.baseRevision ?? 0, patch: value.patch, idempotencyKey: 'validate' }, 'save').patch;
    const pending = value.pending ? (value.pending.operation === 'finish' ? parseFeelingsInput(value.pending, 'finish') : parseFeelingsInput(value.pending, 'save')) : null;
    const server = value.server ? parseFeelingsResponse(value.server) : null;
    if (server && server.sessionId !== this.sessionId) throw Error('Wrong journal session');
    this.publish({ version: 1, patch, pending, server, blocked: value.blocked, baseRevision: value.baseRevision, ready: true });
  }
  private run<T>(action: () => Promise<T>, keepLocalEdit = false): Promise<T | null> {
    const queue = queues.get(this.storage) ?? new Map(); queues.set(this.storage, queue);
    const actionWithStorage = async () => {
      if (this.disposed && !keepLocalEdit) return null;
      this.publish({ busy: true, error: null });
      try { await this.hydrate(); if (this.disposed && !keepLocalEdit) return null; return await action(); }
      catch { this.publish({ localError: true, error: 'No pudimos guardar o leer el borrador local. Revisá tus respuestas antes de finalizar; no se confirmó el guardado.' }); return null; }
      finally { this.publish({ busy: false }); }
    };
    const task = (queue.get(this.key) ?? Promise.resolve()).catch(() => undefined).then(() => this.storage.lock ? this.storage.lock(this.key, actionWithStorage) : actionWithStorage());
    queue.set(this.key, task);
    void task.finally(() => { if (queue.get(this.key) === task) queue.delete(this.key); });
    return task;
  }
  private async readServer() {
    let result: FeelingsResult;
    try { result = await this.port.read(); } catch { result = { status: 'unavailable' }; }
    if (result.status !== 'ok' || !('data' in result)) {
      this.publish({ readError: true, error: 'No pudimos leer las sensaciones. Lo que aparece pendiente sigue en este dispositivo.' }); return null;
    }
    const server = parseFeelingsResponse(result.data);
    if (server.sessionId !== this.sessionId) throw Error('Wrong response session');
    await this.persist({ server }); this.publish({ readError: false }); return server;
  }
  refresh = () => this.run(() => this.readServer());
  change = (key: FeelingKey, value: number | null) => {
    const time = this.now().toISOString();
    return this.run(async () => {
    if (this.state.pending || this.state.blocked) return false;
    const patch: FeelingPatch = { ...this.state.patch, [key]: value === null ? { op: 'clear' } : {
      op: 'set', value, instrumentVersion: 'energy-fatigue/1', declaredMoment: key.endsWith('Pre') ? 'pre' : 'post', declaredAt: time, capturedAt: time, source: this.source,
    } };
    await this.persist({ patch, baseRevision: this.state.baseRevision ?? this.state.server?.revision ?? null }); this.publish({ localError: false }); return true;
    }, true);
  };
  value(key: FeelingKey): number | null {
    const pending = this.state.patch[key];
    return pending ? pending.op === 'set' ? pending.value : null : this.state.server?.values[key]?.value ?? null;
  }
  hasWork() { return !!this.state.pending || Object.keys(this.state.patch).length > 0; }
  needsFinish() { return this.hasWork() || !!this.state.server?.values.energyPost || !!this.state.server?.values.fatiguePost; }
  private async freeze(operation: 'save' | 'finish', metadata: FeelingsFinishInput['metadata'] = {}) {
    if (this.state.pending) return this.state.pending;
    if (this.state.blocked) return null;
    const server = await this.readServer();
    if (!server || this.disposed) return null;
    if ((this.state.baseRevision !== null && server.revision !== this.state.baseRevision) ||
      (this.state.baseRevision === null && Object.keys(this.state.patch).length > 0 && Object.keys(server.values).length > 0)) {
      await this.persist({ blocked: true }); this.publish({ error: 'Las sensaciones cambiaron en otro lugar. Revisá lo guardado antes de decidir.' }); return null;
    }
    const common = { contractVersion: 'training-feelings/1' as const, expectedRevision: server.revision, patch: this.state.patch, idempotencyKey: this.newKey() };
    const pending: FeelingsInput = operation === 'finish' ? { ...common, operation, metadata, expectedSessionUpdatedAt: server.sessionUpdatedAt } : { ...common, operation };
    await this.persist({ pending }); return pending;
  }
  prepareFinish = (metadata: FeelingsFinishInput['metadata']) => this.run(async () => {
    const pending = await this.freeze('finish', metadata);
    return pending?.operation === 'finish' ? pending : null;
  });
  private async submit() {
    const pending = this.state.pending;
    if (!pending || this.state.blocked || this.disposed) return null;
    let result: FeelingsResult;
    try { result = await this.port.write(pending); } catch { result = { status: 'unavailable' }; }
    if (result.status === 'conflict') {
      await this.persist({ blocked: true }); await this.readServer();
      this.publish({ error: 'La operación necesita revisión. Elegí qué conservar; no sobrescribimos lo guardado.' }); return null;
    }
    if (result.status !== 'ok' || !('data' in result)) {
      this.publish({ error: 'Guardado sin confirmar. Las respuestas siguen pendientes; reintentá con la misma operación.' }); return null;
    }
    const server = parseFeelingsResponse(result.data);
    if (server.sessionId !== this.sessionId || (pending.operation === 'finish' && server.sessionStatus !== 'completed')) throw Error('Invalid receipt');
    // Save receipt checkpoint durably before retiring an intent. Finish waits for the session's existing cleanup.
    await this.persist({ server, ...(pending.operation === 'save' ? { pending: null, patch: {}, baseRevision: null } : {}) });
    this.publish({ readError: false, localError: false }); return server;
  }
  save = () => this.run(async () => { if (!this.hasWork()) return this.state.server; if (!(await this.freeze('save'))) return null; return this.submit(); });
  retry = () => this.run(() => this.submit());
  replayFinish = (input: FeelingsFinishInput) => this.run(async () => {
    if (this.state.pending && this.state.pending.idempotencyKey !== input.idempotencyKey) return null;
    // The session journal can outlive feelings cleanup. Restore its identical durable body, never create a new key.
    if (!this.state.pending) await this.persist({ pending: parseFeelingsInput(input, 'finish') });
    return this.submit();
  });
  confirmFinish = () => this.run(async () => {
    if (this.state.pending?.operation !== 'finish' || this.state.server?.sessionStatus !== 'completed') return false;
    await this.persist({ pending: null, patch: {}, baseRevision: null, blocked: false }); return true;
  });
  /** Explicit resolution only. Keep original capture timestamps when choosing the local answers. */
  resolve = (choice: 'server' | 'mine') => this.run(async () => {
    if (!this.state.blocked) return false;
    const server = await this.readServer(); if (!server || this.disposed) return false;
    if (choice === 'mine' && this.state.pending?.operation === 'finish' && server.sessionStatus !== 'in_progress') {
      this.publish({ error: 'La sesión ya está cerrada. Conservá la versión guardada para salir de esta operación.' }); return false;
    }
    await this.persist({ pending: null, patch: choice === 'server' ? {} : this.state.pending?.patch ?? this.state.patch,
      baseRevision: choice === 'server' ? null : server.revision, blocked: false }); return true;
  });
}
export const feelingKeysFor = (phase: 'pre' | 'post') => FEELING_KEYS.filter(key => phase === 'pre' ? key.endsWith('Pre') : key.endsWith('Post'));
