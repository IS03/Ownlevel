import type { MobileApiReadResult, MobileApiRequestResult } from '@/api/results';
import { QUICK_PINS_MAX, parseQuickPinsWrite, type QuickOptions, type QuickPins, type QuickPinsConflict, type QuickPinsSnapshot, type QuickPinsWrite } from '@/api/nutrition-quick';
import type { QuickPinsIntentRepository, StoredQuickPinsIntent } from './quick-pins-storage';

/**
 * #479 increment B: the person's pinned saved meals in Rápido. Independent of QuickController (it never adds, previews or
 * blocks a meal) and of its journal: its own durable intent, its own key per user.
 * - Truth comes from the GET Rápido already makes (`adopt(options.pins)`); `read` is only an explicit reconciliation.
 * - A write is the whole ordered list against the confirmed revision, frozen with its idempotency key BEFORE it is sent.
 * - An unknown outcome keeps the intent: `recover()` replays exactly the same request (same key, same body).
 * - A conflict shows the server's confirmed truth and keeps what the person wanted, to apply again only on request:
 *   preferences are never merged automatically.
 * - `unavailable` pins are unknown, never «no pins»: without a confirmed snapshot nothing can be written. A snapshot that
 *   could not be refreshed (the last read failed) is shown but not written against either: no write, replay or reapply
 *   leaves the device while the pins are not readable, so no useless PUT is ever sent (a stored intent just waits).
 * - #303 C3b: when Rápido reused its options at an opening (no GET), the confirmed pins are a retained reading: before a
 *   pin, unpin or move the pins are read again and the new list is built from THAT truth, so a retained revision is
 *   never the authority for a write and another device's change is never overwritten with an old list.
 */
export type QuickPinsApi = {
  write: (write: QuickPinsWrite) => Promise<MobileApiRequestResult<QuickPinsSnapshot | QuickPinsConflict>>;
  read: () => Promise<MobileApiReadResult<QuickOptions>>;
};
export type QuickPinsError = 'unavailable' | 'storage' | 'changed' | 'pin_unavailable' | 'key_reused' | 'invalid' | 'session' | 'uncertain' | 'full';
export type QuickPinsState = {
  /** loading: the durable intent is being read. pending: a write in flight. uncertain: a write whose outcome is unknown.
   *  conflict: refused against newer server truth. blocked: the device storage could not be read or cleared. */
  phase: 'loading' | 'idle' | 'pending' | 'uncertain' | 'conflict' | 'blocked';
  /** The last server-confirmed pins (GET or write receipt); null until one is known. Never goes back in revision. */
  confirmed: QuickPinsSnapshot | null;
  /** The last pins read: `unavailable` keeps an earlier confirmed snapshot (still valid for CAS) but says the read failed. */
  availability: 'unknown' | 'ok' | 'unavailable';
  /** The write that is in flight or unconfirmed, as stored on the device. */
  intent: StoredQuickPinsIntent | null;
  /** What the person wanted when a write was refused or abandoned: shown next to the truth, applied again only on request. */
  wanted: string[] | null;
  error: QuickPinsError | null;
  message: string | null;
};
export type QuickPinsWriteOutcome = 'sent' | 'unchanged' | 'refused';

const MESSAGES: Record<QuickPinsError, string> = {
  unavailable: 'No pudimos leer tus fijadas. Probá de nuevo en un rato.',
  storage: 'No pudimos guardar el cambio en este dispositivo. No enviamos nada.',
  changed: 'Tus fijadas cambiaron en otro dispositivo. Te mostramos las guardadas; tu cambio sigue a mano para aplicarlo de nuevo.',
  pin_unavailable: 'Una de esas comidas ya no está disponible para fijar. Te mostramos tus fijadas guardadas.',
  key_reused: 'No pudimos confirmar ese cambio. Te mostramos tus fijadas guardadas.',
  invalid: 'Revisá las comidas fijadas.',
  session: 'Tu sesión venció. Volvé a entrar para confirmar el cambio de tus fijadas.',
  uncertain: 'No sabemos si se guardó el cambio de tus fijadas. Comprobalo: se repite exactamente el mismo cambio.',
  full: `Podés fijar hasta ${QUICK_PINS_MAX} comidas.`,
};
const STORAGE_READ = 'No pudimos leer un cambio de fijadas guardado en este dispositivo.';
const ids = (snapshot: QuickPinsSnapshot) => snapshot.items.map(item => item.id);
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

/** The list to show: the person's own change while it is in flight or unconfirmed, otherwise the confirmed one (null = unknown). */
export function visibleQuickPins(state: QuickPinsState): { ids: string[]; unconfirmed: boolean } | null {
  if (state.intent) return { ids: state.intent.intent.savedMealIds, unconfirmed: true };
  return state.confirmed ? { ids: ids(state.confirmed), unconfirmed: false } : null;
}

export class QuickPinsController {
  private state: QuickPinsState = { phase: 'loading', confirmed: null, availability: 'unknown', intent: null, wanted: null, error: null, message: null };
  private listeners = new Set<() => void>(); private disposed = false; private busy = false; private readGeneration = 0;
  /** False while the confirmed pins come from a reused (not re-read) reading: a write first reads them again. */
  private verified = true;
  constructor(private api: QuickPinsApi, private repository: QuickPinsIntentRepository,
    private newKey: () => string = () => `pins:${Date.now()}:${Math.random().toString(36).slice(2)}`) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<QuickPinsState>) { if (!this.disposed) { this.state = { ...this.state, ...patch }; this.listeners.forEach(f => f()); } }
  /** After an account switch or unmount, late answers are ignored; an unconfirmed intent stays stored for its own user. */
  dispose() { this.disposed = true; this.readGeneration++; this.listeners.clear(); }

  async initialize() {
    try {
      const stored = await this.repository.read();
      if (this.disposed) return;
      this.update(stored ? { phase: 'uncertain', intent: stored, error: 'uncertain', message: MESSAGES.uncertain } : { phase: 'idle' });
    } catch { this.update({ phase: 'blocked', error: 'storage', message: STORAGE_READ }); }
  }

  /** Pins from the GET Rápido already made. An older revision (an answer that arrives late) never replaces a newer one. */
  adopt(pins: QuickPins) {
    if (this.disposed) return;
    if (pins.status !== 'ok') { this.update({ availability: 'unavailable' }); return; }
    this.accept({ revision: pins.revision, items: pins.items });
  }
  /** Rápido reused its options without a GET: the pins it holds must be read again before they authorize a write. */
  requireVerification() { if (!this.disposed && this.state.confirmed) this.verified = false; }
  private accept(snapshot: QuickPinsSnapshot) {
    // A server answer (GET or write receipt): what is confirmed now was read, not retained.
    this.verified = true;
    const current = this.state.confirmed;
    // The read worked («ok»), but an older revision never replaces the newer confirmed one.
    if (current && snapshot.revision < current.revision) { this.update({ availability: 'ok' }); return; }
    this.update({ confirmed: snapshot, availability: 'ok' });
  }
  /** Explicit reconciliation through the same quick-options GET (no new endpoint). */
  async reload() {
    if (this.disposed) return;
    const generation = ++this.readGeneration;
    let result: MobileApiReadResult<QuickOptions> | null = null;
    try { result = await this.api.read(); } catch { result = null; }
    if (this.disposed || generation !== this.readGeneration) return;
    if (result?.status === 'ok') this.adopt(result.data.pins); else this.update({ availability: 'unavailable' });
  }

  pin(id: string) {
    return this.fromVerified(current => current?.includes(id.toLowerCase()) ? 'unchanged' : current ? [...current, id] : []);
  }
  unpin(id: string) {
    return this.fromVerified(current => current ? current.filter(pinned => pinned !== id.toLowerCase()) : []);
  }
  move(id: string, index: number) {
    return this.fromVerified(current => {
      if (!current?.includes(id.toLowerCase())) return 'refused';
      const rest = current.filter(pinned => pinned !== id.toLowerCase());
      rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id.toLowerCase());
      return rest;
    });
  }
  /** Builds the new list from the confirmed pins, read again first if they were only retained. */
  private async fromVerified(build: (current: string[] | null) => string[] | 'unchanged' | 'refused'): Promise<QuickPinsWriteOutcome> {
    if (!await this.verify()) return 'refused';
    const next = build(this.state.confirmed ? ids(this.state.confirmed) : null);
    return next === 'unchanged' || next === 'refused' ? next : this.write(next);
  }
  /**
   * Every NEW write passes here (pin, unpin, move, «Aplicar mi cambio» and any direct write): if the confirmed pins are a
   * retained reading they are read again first. Not read again (offline, denied, failed): false, nothing is written and
   * `wanted` is untouched. A stored intent's replay (`recover`) never comes here: it resends its exact body and key.
   */
  private async verify(): Promise<boolean> {
    if (this.verified) return true;
    if (this.disposed || this.busy || this.state.intent || (this.state.phase !== 'idle' && this.state.phase !== 'conflict')) return false;
    this.busy = true;
    try { await this.reload(); } finally { this.busy = false; }
    if (this.disposed) return false;
    if (!this.verified || this.state.availability !== 'ok') { this.update({ error: 'unavailable', message: MESSAGES.unavailable }); return false; }
    return true;
  }
  /** What the person wanted before a refusal, sent again over the new truth only because they asked. */
  reapply() { return this.state.wanted ? this.write(this.state.wanted) : Promise.resolve<QuickPinsWriteOutcome>('refused'); }
  dismiss() {
    if (this.busy || this.state.intent) return;
    this.update({ wanted: null, error: null, message: null, ...(this.state.phase === 'conflict' ? { phase: 'idle' as const } : {}) });
  }

  /** The whole ordered list. One write at a time, stored with its key before it is sent, against a verified revision. */
  async write(savedMealIds: string[]): Promise<QuickPinsWriteOutcome> {
    if (this.disposed || this.busy || this.state.intent || (this.state.phase !== 'idle' && this.state.phase !== 'conflict')) return 'refused';
    if (!await this.verify()) return 'refused';
    const confirmed = this.state.confirmed;
    if (!confirmed || this.state.availability !== 'ok') { this.update({ error: 'unavailable', message: MESSAGES.unavailable }); return 'refused'; }
    if (savedMealIds.length > QUICK_PINS_MAX) { this.update({ error: 'full', message: MESSAGES.full }); return 'refused'; }
    const intent = parseQuickPinsWrite({ savedMealIds, expectedRevision: confirmed.revision, idempotencyKey: this.newKey() });
    if (!intent) { this.update({ error: 'invalid', message: MESSAGES.invalid }); return 'refused'; }
    if (sameIds(intent.savedMealIds, ids(confirmed))) { this.update({ phase: 'idle', wanted: null, error: null, message: null }); return 'unchanged'; }
    const stored: StoredQuickPinsIntent = { version: 1, intent, base: confirmed };
    this.busy = true;
    try {
      try { await this.repository.write(stored); } catch { this.update({ error: 'storage', message: MESSAGES.storage }); return 'refused'; }
      // Stored but not sent (the controller went away): the next session finds it unconfirmed and replays it on request.
      if (this.disposed) return 'refused';
      this.update({ phase: 'pending', intent: stored, wanted: null, error: null, message: null });
      await this.send(stored);
      return 'sent';
    } finally { this.busy = false; }
  }

  /** Replays exactly the stored request: the server answers its stored receipt if it was applied, or applies it now. */
  async recover() {
    const stored = this.state.intent;
    if (this.disposed || this.busy || !stored || this.state.phase !== 'uncertain' || this.state.availability !== 'ok') return;
    this.busy = true; this.update({ phase: 'pending', error: null, message: null });
    try { await this.send(stored); } finally { this.busy = false; }
  }
  /** Stop waiting for an unconfirmed write: what the person wanted is kept (never re-sent by itself) and truth is re-read. */
  async forget() {
    const stored = this.state.intent;
    if (this.disposed || this.busy || !stored || this.state.phase !== 'uncertain') return;
    this.busy = true;
    try {
      try { await this.repository.clear(stored.intent.idempotencyKey); } catch { this.update({ error: 'storage', message: MESSAGES.storage }); return; }
      this.update({ phase: 'idle', intent: null, wanted: stored.intent.savedMealIds, error: null, message: null });
    } finally { this.busy = false; }
    await this.reload();
  }

  private async send(stored: StoredQuickPinsIntent) {
    let result: MobileApiRequestResult<QuickPinsSnapshot | QuickPinsConflict> | null = null;
    try { result = await this.api.write(stored.intent); } catch { result = null; }
    // A late answer for a controller that is gone: the stored intent replays for its own user later.
    if (this.disposed) return;
    const key = stored.intent.idempotencyKey;
    if (result?.status === 'ok' && !('error' in result.data) && sameIds(ids(result.data), stored.intent.savedMealIds)
      && result.data.revision >= stored.intent.expectedRevision) {
      // If clearing fails, the stored intent replays to this same receipt: nothing is applied twice.
      try { await this.repository.clear(key); } catch { /* replay-safe */ }
      if (this.disposed) return;
      this.accept(result.data);
      this.update({ phase: 'idle', intent: null, wanted: null, error: null, message: null });
      return;
    }
    if (result?.status === 'conflict' && (result.code === 'QUICK_PINS_CHANGED' || result.code === 'QUICK_PIN_UNAVAILABLE' || result.code === 'IDEMPOTENCY_KEY_REUSED')) {
      const error: QuickPinsError = result.code === 'QUICK_PINS_CHANGED' ? 'changed' : result.code === 'QUICK_PIN_UNAVAILABLE' ? 'pin_unavailable' : 'key_reused';
      if (!await this.settleRefused(stored, 'conflict', error)) return;
      const current = result.data && 'error' in result.data ? result.data.current : null;
      if (current) this.accept(current); else await this.reload();
      return;
    }
    if (result?.status === 'validation') { await this.settleRefused(stored, 'idle', 'invalid'); return; }
    // Nothing was confirmed: the same request can be replayed once the session is back.
    if (result?.status === 'auth_required' || result?.status === 'unauthorized') { this.update({ phase: 'uncertain', error: 'session', message: MESSAGES.session }); return; }
    this.update({ phase: 'uncertain', error: 'uncertain', message: MESSAGES.uncertain });
  }
  /** A refused write wrote nothing: its stored copy goes (or a later replay could apply a stale wish), the wish stays visible. */
  private async settleRefused(stored: StoredQuickPinsIntent, phase: 'conflict' | 'idle', error: QuickPinsError) {
    try { await this.repository.clear(stored.intent.idempotencyKey); }
    catch { this.update({ phase: 'blocked', error: 'storage', message: STORAGE_READ }); return false; }
    this.update({ phase, intent: null, wanted: stored.intent.savedMealIds, error, message: MESSAGES[error] });
    return true;
  }
}
