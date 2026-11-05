import { parseConfigurationInput, parseConfigurationsResponse, sameConfiguration, TRAINING_EXERCISE_CONFIGURATION_CONTRACT,
  type ConfigurationInput, type ConfigurationItem, type ConfigurationValue, type ConfigurationsResponse } from './training-exercise-configuration-contract';

export type ConfigurationResult = { status: 'ok'; data: ConfigurationsResponse } | { status: string; message?: string };
export type ConfigurationPort = { read: () => Promise<ConfigurationResult>; write: (input: ConfigurationInput) => Promise<ConfigurationResult> };
export type ConfigurationStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
type RecordV1 = { version: 1; server: ConfigurationsResponse | null; pending: ConfigurationInput | null };
export type ConfigurationSnapshot = RecordV1 & { ready: boolean; busy: boolean; error: string | null };
/** The answer for one exercise as the screen shows it: what is saved, or what is waiting for confirmation. */
export type ConfigurationView = { item: ConfigurationItem | null; value: ConfigurationValue | null; state: 'saved' | 'unconfirmed' | 'saving' };

// A 400 or 404 cannot have written anything: the intent is retired. Anything else may have: it is kept and replayed as is.
const DEFINITIVE = new Set(['validation', 'not_found']);
const queues = new WeakMap<ConfigurationStorage, Map<string, Promise<unknown>>>();

/**
 * One session's configuration answers. One write at a time, frozen with its key before it is sent, so a lost response or a
 * closed app replays the identical request and the ledger answers it. A conflict never overwrites: the saved value is shown.
 */
export class ExerciseConfigurationJournal {
  readonly key: string;
  private state: ConfigurationSnapshot = { version: 1, server: null, pending: null, ready: false, busy: false, error: null };
  private listeners = new Set<() => void>();
  constructor(private storage: ConfigurationStorage, private port: ConfigurationPort, userId: string, private sessionId: string, private newKey: () => string) {
    this.key = `ownlevel.exercise-configuration.v1.${encodeURIComponent(userId)}.${encodeURIComponent(sessionId)}`;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(update: Partial<ConfigurationSnapshot>) { this.state = { ...this.state, ...update }; this.listeners.forEach(fn => fn()); }
  private async persist(update: Partial<RecordV1>) {
    const next = { ...this.state, ...update };
    const record: RecordV1 = { version: 1, server: next.server, pending: next.pending };
    await this.storage.setItem(this.key, JSON.stringify(record));
    this.publish(record);
  }
  private async hydrate() {
    const raw = await this.storage.getItem(this.key);
    if (!raw) { this.publish({ ready: true }); return; }
    const value = JSON.parse(raw) as RecordV1;
    if (value.version !== 1) throw Error('Invalid configuration journal');
    const server = value.server ? parseConfigurationsResponse(value.server) : null;
    const pending = value.pending ? parseConfigurationInput(value.pending) : null;
    if (server && server.sessionId !== this.sessionId) throw Error('Wrong journal session');
    this.publish({ server, pending, ready: true });
  }
  private run<T>(action: () => Promise<T>): Promise<T | null> {
    const queue = queues.get(this.storage) ?? new Map(); queues.set(this.storage, queue);
    const task = (queue.get(this.key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      this.publish({ busy: true });
      try { await this.hydrate(); return await action(); }
      catch {
        this.publish({ error: 'No pudimos guardar o leer la variante en este dispositivo. Entrenar no depende de esto.' });
        return null;
      }
      finally { this.publish({ busy: false }); }
    });
    queue.set(this.key, task);
    const cleanup = () => { if (queue.get(this.key) === task) queue.delete(this.key); };
    void task.then(cleanup, cleanup);
    return task;
  }
  private async readServer() {
    let result: ConfigurationResult;
    try { result = await this.port.read(); } catch { result = { status: 'unavailable' }; }
    if (result.status !== 'ok' || !('data' in result)) { this.publish({ error: 'No pudimos leer las variantes. Podés seguir entrenando.' }); return null; }
    const server = parseConfigurationsResponse(result.data);
    if (server.sessionId !== this.sessionId) throw Error('Wrong response session');
    await this.persist({ server });
    if (!this.state.pending) this.publish({ error: null });
    return server;
  }
  private async submit() {
    const pending = this.state.pending;
    if (!pending) return true;
    let result: ConfigurationResult;
    try { result = await this.port.write(pending); } catch { result = { status: 'unavailable' }; }
    if (result.status === 'ok' && 'data' in result) {
      const server = parseConfigurationsResponse(result.data);
      if (server.sessionId !== this.sessionId) throw Error('Invalid receipt');
      await this.persist({ server, pending: null }); this.publish({ error: null }); return true;
    }
    if (result.status === 'conflict') {
      await this.persist({ pending: null }); await this.readServer();
      this.publish({ error: 'La variante cambió en otro lugar. Mostramos la guardada; elegila de nuevo si querés cambiarla.' }); return false;
    }
    if (DEFINITIVE.has(result.status)) {
      await this.persist({ pending: null }); await this.readServer();
      this.publish({ error: 'No pudimos guardar esa variante. Mostramos la guardada.' }); return false;
    }
    this.publish({ error: 'Variante sin confirmar. Reintentá: es la misma operación y no se duplica.' }); return false;
  }
  /** Reads what is saved. A write left pending (closed app, lost answer) is replayed first, with its own key. */
  refresh = () => this.run(async () => { if (this.state.pending) await this.submit(); else await this.readServer(); return this.state.server; });
  retry = () => this.run(() => this.submit());
  /** Null clears it on purpose. Nothing happens while another answer waits for confirmation. */
  choose = (sessionExerciseId: string, value: ConfigurationValue | null) => this.run(async () => {
    if (this.state.pending) return false;
    const server = this.state.server ?? await this.readServer();
    const item = server?.items.find(entry => entry.sessionExerciseId === sessionExerciseId.toLowerCase());
    if (!item) return false;
    if (item.value?.source === value?.source && sameConfiguration(item.value, value) && item.value?.label === value?.label) return true;
    const pending = parseConfigurationInput({ contractVersion: TRAINING_EXERCISE_CONFIGURATION_CONTRACT, sessionExerciseId: item.sessionExerciseId,
      expectedRevision: item.revision, value, idempotencyKey: this.newKey() });
    await this.persist({ pending });
    return this.submit();
  });
  /**
   * Another block of the same exercise in this session with a different answer, unknown included. The comparator reads them
   * as one exposure, and two contexts in it make it not comparable.
   */
  mixed(sessionExerciseId: string) {
    const items = this.state.server?.items ?? [];
    const own = items.find(item => item.sessionExerciseId === sessionExerciseId.toLowerCase());
    if (!own) return false;
    const value = this.view(own.sessionExerciseId).value;
    return items.some(item => item.exerciseId === own.exerciseId && item.sessionExerciseId !== own.sessionExerciseId
      && !sameConfiguration(this.view(item.sessionExerciseId).value, value));
  }
  view(sessionExerciseId: string): ConfigurationView {
    const id = sessionExerciseId.toLowerCase();
    const item = this.state.server?.items.find(entry => entry.sessionExerciseId === id) ?? null;
    if (this.state.pending?.sessionExerciseId === id) return { item, value: this.state.pending.value, state: this.state.busy ? 'saving' : 'unconfirmed' };
    return { item, value: item?.value ?? null, state: 'saved' };
  }
}
