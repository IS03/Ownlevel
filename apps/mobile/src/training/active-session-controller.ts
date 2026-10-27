import {
  addSessionExercise, cancelSession, fetchSessionDetail, fetchSessionExerciseSync, finishSession, removeSessionExercise, reorderSessionExercises, saveSessionExercise,
  type SessionAddInput, type SessionDetailDto, type SessionExerciseDto, type SessionExerciseOrderDto, type SessionExerciseOrderInput, type SessionExercisePayloadDto, type SessionExerciseSyncDto,
  type SessionFinishedDto, type SessionFinishInput, type SessionStructuralDto,
} from '@/api/active-session';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiRequestResult } from '@/api/results';
import {
  draftIsDirty, emptySessionSummary, exerciseDraft, exercisePayload, finishMetadata, restSeconds, restoreRestDeadline, sameExercisePayload, setProgress,
  summaryIsValid, type RestDeadline, type SessionExerciseDraft, type SessionSummaryDraft, type StoredExerciseDraft,
} from './active-session-model';
import { SessionDraftRepository, type StructuralIntent } from './active-session-storage';
import { recordSessionResume } from './session-resume-telemetry';

export type ActiveSessionApi = {
  detail: () => Promise<MobileApiRequestResult<SessionDetailDto>>;
  sync: (id: string) => Promise<MobileApiRequestResult<SessionExerciseSyncDto>>;
  save: (id: string, version: string, payload: SessionExercisePayloadDto) => Promise<MobileApiRequestResult<{ sessionExerciseId: string; updatedAt: string }>>;
  add: (input: SessionAddInput) => Promise<MobileApiRequestResult<SessionStructuralDto>>;
  remove: (id: string, version: string, key: string) => Promise<MobileApiRequestResult<SessionStructuralDto>>;
  cancel: (key: string) => Promise<MobileApiRequestResult<SessionStructuralDto>>;
  reorder: (input: SessionExerciseOrderInput) => Promise<MobileApiRequestResult<SessionExerciseOrderDto>>;
  finish: (input: SessionFinishInput) => Promise<MobileApiRequestResult<SessionFinishedDto>>;
};
export function activeSessionApi(client: MobileApiClient, sessionId: string): ActiveSessionApi {
  return { detail: () => fetchSessionDetail(client, sessionId), sync: id => fetchSessionExerciseSync(client, sessionId, id),
    save: (id, expectedUpdatedAt, payload) => saveSessionExercise(client, sessionId, id, { expectedUpdatedAt, payload }),
    add: input => addSessionExercise(client, sessionId, input),
    remove: (id, expectedUpdatedAt, idempotencyKey) => removeSessionExercise(client, sessionId, id, { expectedUpdatedAt, idempotencyKey }),
    cancel: key => cancelSession(client, sessionId, key), reorder: input => reorderSessionExercises(client, sessionId, input),
    finish: input => finishSession(client, sessionId, input) };
}
export type ExercisePhase = 'idle' | 'scheduled' | 'saving' | 'saved' | 'validation' | 'conflict' | 'retryable' | 'unconfirmed' | 'stale' | 'closed' | 'removed';
export type ExerciseSnapshot = {
  exercise: SessionExerciseDto;
  draft: SessionExerciseDraft;
  phase: ExercisePhase;
  error: string | null;
  dirty: boolean;
  storageReady: boolean;
  stale: boolean;
};
export type SessionSnapshot = {
  status: 'loading' | 'ready' | 'unavailable' | 'not_found' | 'cancelled';
  detail: SessionDetailDto | null;
  refreshing: boolean;
  fenced: boolean;
  storageError: boolean;
  notice: string | null;
  intent: { value: StructuralIntent; phase: 'running' | 'uncertain' | 'blocked' } | null;
  interaction: 'sets' | 'exercises' | null;
  /** Local summary draft for finish; persisted per session, cleared only after a confirmed finish. */
  summary: SessionSummaryDraft;
  summaryReady: boolean;
  /** Pre-finish drain/verification in progress: edits are locked, saves may still drain. */
  finishing: boolean;
  /** Server truth returned by a confirmed (or replayed) finish. */
  finished: SessionFinishedDto | null;
};
export type SessionProgress = { completedSets: number; totalSets: number; completedExercises: number; exercises: number; pending: number; errors: number; drafts: number };
type Entry = {
  snapshot: ExerciseSnapshot;
  base: SessionExercisePayloadDto;
  version: string;
  revision: number;
  writeId: string;
  stale: StoredExerciseDraft | null;
  attempt: { payload: SessionExercisePayloadDto; revision: number } | null;
  timer: ReturnType<typeof setTimeout> | null;
  flight: Promise<void> | null;
  paused: boolean;
};
const recoveryPhases = new Set<ExercisePhase>(['conflict', 'stale', 'unconfirmed', 'retryable', 'closed', 'removed']);
const unavailable = { status: 'unavailable', reason: 'network', meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' } } as const;
export function sessionIntentKey() {
  return typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export class ActiveSessionController {
  private snapshot: SessionSnapshot = { status: 'loading', detail: null, refreshing: false, fenced: false, storageError: false, notice: null, intent: null,
    interaction: null, summary: emptySessionSummary, summaryReady: false, finishing: false, finished: null };
  private progress: SessionProgress = { completedSets: 0, totalSets: 0, completedExercises: 0, exercises: 0, pending: 0, errors: 0, drafts: 0 };
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private readonly exerciseListeners = new Map<string, Set<() => void>>();
  private readonly progressListeners = new Set<() => void>();
  private readonly timerListeners = new Set<() => void>();
  private readonly recoveryFlights = new Map<string, Promise<void>>();
  private rest: RestDeadline | null = null;
  private initialized = false;
  private intentHydrated = false;
  private disposed = false;
  private foreground = true;
  private writesPaused = false;
  private networkReady = false;
  private refreshFlight: Promise<void> | null = null;
  private structuralFlight: Promise<boolean> | null = null;
  private finishFlight: Promise<boolean> | null = null;
  private drag: { kind: 'sets'; id: string } | { kind: 'exercises'; version: string; ids: string[] } | null = null;
  private orderNeedsCheck = false;
  private readonly localRemovals = new Set<string>();
  private readonly reportedRemovals = new Set<string>();

  /** Plain server read for the closed-session view (no draft/intent side effects). */
  readonly readDetail = () => this.api.detail();
  constructor(private readonly api: ActiveSessionApi, private readonly repository: SessionDraftRepository,
    private readonly generateKey: () => string = sessionIntentKey, private readonly now: () => number = Date.now) {}
  getSnapshot = () => this.snapshot;
  getProgress = () => this.progress;
  getTimer = () => this.rest;
  getExerciseRevision = (id: string) => this.entries.get(id)?.revision ?? -1;
  readDismissedHistory = () => this.repository.readDismissedHistory();
  dismissHistory = (exerciseId: string) => this.repository.dismissHistory(exerciseId);
  getExercise = (id: string) => this.entries.get(id)?.snapshot ?? null;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeProgress = (listener: () => void) => { this.progressListeners.add(listener); return () => { this.progressListeners.delete(listener); }; };
  subscribeTimer = (listener: () => void) => { this.timerListeners.add(listener); return () => { this.timerListeners.delete(listener); }; };
  subscribeExercise(id: string, listener: () => void) {
    const listeners = this.exerciseListeners.get(id) ?? new Set(); listeners.add(listener); this.exerciseListeners.set(id, listeners);
    return () => { listeners.delete(listener); };
  }
  activate() { this.disposed = false; this.foreground = true; }
  dispose() { this.disposed = true; this.drag = null; this.pauseTimers(); }
  suspend() { this.foreground = false; this.cancelDrag(); this.pauseTimers(); }
  resume() {
    const wasSuspended = !this.foreground, startedAt = this.now();
    this.foreground = true;
    const flight = this.refresh();
    if (wasSuspended) {
      this.measureResume(startedAt, 'local');
      void flight.then(() => { if (!this.disposed) this.measureResume(startedAt, 'revalidated'); });
    }
    return flight;
  }
  private measureResume(startedAt: number, stage: 'local' | 'revalidated') {
    recordSessionResume({ stage, elapsedMs: Math.max(0, this.now() - startedAt), hasSnapshot: !!this.snapshot.detail,
      editable: [...this.entries.keys()].some(id => this.canEdit(id)),
      outcome: stage === 'local' ? 'pending' : this.snapshot.fenced || !!this.snapshot.intent ? 'blocked' : this.networkReady ? 'ready' : 'unavailable' });
  }
  private update(value: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    if (!this.disposed) this.listeners.forEach(listener => listener());
  }
  private publish(entry: Entry, value: Partial<ExerciseSnapshot> = {}) {
    entry.snapshot = { ...entry.snapshot, ...value, dirty: draftIsDirty(value.draft ?? entry.snapshot.draft, entry.base) };
    if (!this.disposed) this.exerciseListeners.get(entry.snapshot.exercise.id)?.forEach(listener => listener());
    this.summarize();
  }
  private summarize() {
    const next: SessionProgress = { completedSets: 0, totalSets: 0, completedExercises: 0, exercises: 0, pending: 0, errors: 0, drafts: 0 };
    const ids = this.snapshot.detail?.exercises.map(exercise => exercise.id) ?? [];
    for (const id of ids) {
      const snapshot = this.entries.get(id)?.snapshot; if (!snapshot) continue;
      const completion = setProgress(snapshot.draft);
      next.exercises++; next.completedSets += completion.completed; next.totalSets += completion.total;
      next.completedExercises += Number(completion.complete);
      next.pending += Number(snapshot.phase === 'saving' || snapshot.phase === 'scheduled');
      next.errors += Number(Boolean(snapshot.error)); next.drafts += Number(snapshot.dirty || snapshot.stale);
    }
    if (JSON.stringify(next) !== JSON.stringify(this.progress)) {
      this.progress = next; if (!this.disposed) this.progressListeners.forEach(listener => listener());
    }
  }
  private pauseTimers() { for (const entry of this.entries.values()) { if (entry.timer) clearTimeout(entry.timer); entry.timer = null; } }
  private canWrite(entry: Entry) {
    return !this.disposed && this.foreground && this.networkReady && !this.writesPaused && !this.snapshot.fenced && !this.snapshot.intent &&
      !(this.drag?.kind === 'exercises' || (this.drag?.kind === 'sets' && this.drag.id === entry.snapshot.exercise.id)) &&
      !entry.paused && entry.snapshot.storageReady && !recoveryPhases.has(entry.snapshot.phase);
  }
  canEdit(id: string) {
    const entry = this.entries.get(id);
    // Local edits stay journaled while loadDetail holds writes until CAS reconciliation.
    return !!entry && !this.disposed && !this.snapshot.fenced && !this.snapshot.intent && !this.snapshot.finishing && !entry.paused &&
      entry.snapshot.storageReady && !entry.stale && entry.snapshot.phase !== 'closed' && entry.snapshot.phase !== 'removed';
  }
  private async safe<T>(operation: () => Promise<MobileApiRequestResult<T>>): Promise<MobileApiRequestResult<T>> {
    try { return await operation(); } catch { return unavailable; }
  }
  private stored(entry: Entry): StoredExerciseDraft {
    return { version: 1, sessionId: this.repository.sessionId, sessionExerciseId: entry.snapshot.exercise.id,
      serverUpdatedAt: entry.version, basePayload: entry.base, draft: entry.snapshot.draft, writeId: entry.writeId,
      ...(entry.attempt ? { attemptPayload: entry.attempt.payload } : {}) };
  }
  private async persist(entry: Entry) {
    try { await this.repository.writeDraft(this.stored(entry)); }
    catch { this.update({ storageError: true }); }
  }
  private async clearDraft(entry: Entry) {
    try { await this.repository.removeDraft(entry.snapshot.exercise.id, entry.writeId); }
    catch { this.update({ storageError: true }); }
  }
  change(id: string, updater: (draft: SessionExerciseDraft) => SessionExerciseDraft, immediate = false) {
    const entry = this.entries.get(id); if (!entry || !this.canEdit(id)) return;
    entry.revision++; entry.writeId = this.generateKey();
    this.publish(entry, { draft: updater(entry.snapshot.draft) });
    void this.persist(entry);
    if (recoveryPhases.has(entry.snapshot.phase)) return;
    try { exercisePayload(entry.snapshot.draft); }
    catch (error) { this.publish(entry, { phase: 'validation', error: error instanceof Error ? error.message : 'Revisá las series.' }); return; }
    if (!entry.snapshot.dirty && !entry.flight) { this.publish(entry, { phase: 'saved', error: null }); void this.clearDraft(entry); return; }
    this.publish(entry, { phase: 'scheduled', error: this.networkReady ? null : 'Pendiente de conexión. Conservamos el borrador en este dispositivo.' });
    if (entry.flight) return;
    if (entry.timer) clearTimeout(entry.timer);
    if (immediate) { void this.flush(id); return; }
    entry.timer = setTimeout(() => { entry.timer = null; void this.flush(id); }, 850);
  }
  flush(id: string): Promise<void> {
    const entry = this.entries.get(id); if (!entry) return Promise.resolve();
    if (entry.timer) clearTimeout(entry.timer); entry.timer = null;
    if (entry.flight) return entry.flight;
    if (!this.canWrite(entry) || !entry.snapshot.dirty) return Promise.resolve();
    const flight = this.drain(entry).finally(() => { if (entry.flight === flight) entry.flight = null; });
    entry.flight = flight; return flight;
  }
  private async drain(entry: Entry) {
    while (this.canWrite(entry) && entry.snapshot.dirty) {
      let payload: SessionExercisePayloadDto;
      try { payload = exercisePayload(entry.snapshot.draft); }
      catch (error) { this.publish(entry, { phase: 'validation', error: error instanceof Error ? error.message : 'Revisá las series.' }); return; }
      const revision = entry.revision;
      entry.attempt = { payload, revision };
      await this.persist(entry); if (!this.canWrite(entry)) return;
      this.publish(entry, { phase: 'saving', error: null });
      const result = await this.safe(() => this.api.save(entry.snapshot.exercise.id, entry.version, payload));
      if (this.disposed) return; // Leave the journal for a new mount to reconcile.
      if (result.status === 'ok') await this.confirm(entry, payload, result.data.updatedAt);
      else if (result.status === 'conflict' && (result.code === 'SESSION_CLOSED' || result.code === 'SESSION_EXERCISE_REMOVED')) {
        this.terminal(entry, result.code === 'SESSION_CLOSED' ? 'closed' : 'removed'); return;
      } else if (result.status === 'validation') {
        entry.attempt = null; this.publish(entry, { phase: 'validation', error: result.message }); return;
      } else {
        // Read-back precedes every retry decision, including auth/network/timeouts.
        await this.readBack(entry, false);
        if (recoveryPhases.has(entry.snapshot.phase) || entry.snapshot.phase === 'validation') return;
      }
    }
  }
  private async confirm(entry: Entry, payload: SessionExercisePayloadDto, version: string) {
    entry.base = payload; entry.version = version; entry.attempt = null;
    this.publish(entry, { exercise: { ...entry.snapshot.exercise, updatedAt: version, payload }, phase: 'saved', error: null });
    if (entry.snapshot.dirty) { await this.persist(entry); this.publish(entry, { phase: 'scheduled' }); }
    else await this.clearDraft(entry);
  }
  private terminal(entry: Entry, phase: 'closed' | 'removed') {
    this.publish(entry, { phase, error: phase === 'closed' ? 'La sesión ya no está en curso.' : 'El ejercicio ya no está en la sesión.' });
    entry.paused = true;
    this.update({ fenced: true, notice: 'La sesión cambió en otro lugar. Estamos comprobando el estado.' });
    this.pauseTimers();
    // Never await a refresh that may itself be waiting for this save.
    void Promise.resolve().then(() => this.refresh());
  }
  private async readBack(entry: Entry, explicit: boolean) {
    const result = await this.safe(() => this.api.sync(entry.snapshot.exercise.id));
    if (this.disposed) return;
    if (result.status === 'not_found') { this.terminal(entry, 'removed'); return; }
    if (result.status !== 'ok') { this.publish(entry, { phase: 'unconfirmed', error: 'No pudimos comprobar si se guardó. Conservamos el borrador.' }); return; }
    if (result.data.status !== 'active') { this.terminal(entry, result.data.status === 'session_closed' ? 'closed' : 'removed'); return; }
    await this.reconcile(entry, result.data.payload, result.data.updatedAt, explicit);
  }
  private async reconcile(entry: Entry, server: SessionExercisePayloadDto, version: string, explicit: boolean) {
    const stored = entry.stale;
    const local = stored?.draft ?? entry.snapshot.draft;
    let desired: SessionExercisePayloadDto | null = null;
    try { desired = exercisePayload(local); } catch { /* Invalid text remains recoverable locally. */ }
    if (desired && sameExercisePayload(server, desired)) {
      entry.stale = null;
      if (stored) { entry.writeId = stored.writeId; this.publish(entry, { draft: local, stale: false }); }
      await this.confirm(entry, server, version); return;
    }
    const base = stored?.basePayload ?? entry.base;
    const attempt = stored?.attemptPayload ?? entry.attempt?.payload;
    if (!stored && attempt && sameExercisePayload(server, attempt)) {
      await this.confirm(entry, server, version); return;
    }
    if (sameExercisePayload(server, base) || (attempt && sameExercisePayload(server, attempt))) {
      if (stored && !explicit) return; // Never auto-apply stale drafts.
      entry.stale = null; entry.base = server; entry.version = version; entry.attempt = null;
      this.publish(entry, { draft: local, stale: false, exercise: { ...entry.snapshot.exercise, updatedAt: version, payload: server },
        phase: explicit ? 'scheduled' : 'retryable', error: explicit ? null : 'El guardado no quedó confirmado. Podés comprobarlo y reintentar.' });
      await this.persist(entry); return;
    }
    this.publish(entry, { phase: stored ? 'stale' : 'conflict', error: 'El ejercicio cambió en otro dispositivo. Conservamos tus cambios pendientes para revisar.' });
  }
  async checkExercise(id: string) {
    if (this.recoveryFlights.has(id)) return this.recoveryFlights.get(id);
    const entry = this.entries.get(id); if (!entry || this.snapshot.intent || this.snapshot.fenced || this.snapshot.refreshing) return;
    const operation = (async () => {
      entry.paused = true; this.publish(entry); await entry.flight;
      await this.readBack(entry, true);
      if (entry.snapshot.phase !== 'closed' && entry.snapshot.phase !== 'removed') entry.paused = false;
      this.publish(entry);
      if (this.canWrite(entry)) await this.flush(id);
    })().finally(() => this.recoveryFlights.delete(id));
    this.recoveryFlights.set(id, operation); return operation;
  }
  async useSaved(id: string) {
    if (this.recoveryFlights.has(id)) return this.recoveryFlights.get(id);
    const operation = this.adoptSaved(id).finally(() => this.recoveryFlights.delete(id));
    this.recoveryFlights.set(id, operation); return operation;
  }
  private async adoptSaved(id: string) {
    const entry = this.entries.get(id); if (!entry || this.snapshot.intent || this.snapshot.fenced || this.snapshot.refreshing) return;
    entry.paused = true; this.publish(entry); if (entry.timer) clearTimeout(entry.timer); entry.timer = null; await entry.flight;
    const result = await this.safe(() => this.api.sync(id));
    if (this.disposed) return;
    if (result.status !== 'ok') { entry.paused = false; this.publish(entry, { error: 'No pudimos consultar el ejercicio. Tus cambios pendientes se conservan.' }); return; }
    if (result.data.status !== 'active') { this.terminal(entry, result.data.status === 'session_closed' ? 'closed' : 'removed'); return; }
    entry.base = result.data.payload; entry.version = result.data.updatedAt; entry.stale = null; entry.attempt = null;
    const writeId = entry.writeId;
    this.publish(entry, { draft: exerciseDraft(result.data.payload), stale: false, phase: 'saved', error: null,
      exercise: { ...entry.snapshot.exercise, payload: result.data.payload, updatedAt: result.data.updatedAt } });
    try { await this.repository.removeDraft(id, writeId); } catch { this.update({ storageError: true }); }
    entry.paused = false;
  }
  refresh(): Promise<void> {
    if (this.disposed || this.drag) return Promise.resolve();
    if (this.refreshFlight) return this.refreshFlight;
    if (this.structuralFlight) return this.structuralFlight.then(() => this.refresh());
    const flight = this.loadDetail().finally(() => { if (this.refreshFlight === flight) this.refreshFlight = null; });
    this.refreshFlight = flight; return flight;
  }
  private async loadDetail() {
    this.writesPaused = true; this.pauseTimers(); this.update({ refreshing: true, storageError: false });
    await Promise.all([...this.entries.values()].map(entry => entry.flight));
    await Promise.all([...this.recoveryFlights.values()]);
    const result = await this.safe(() => this.api.detail());
    if (this.disposed) return;
    if (!this.intentHydrated) {
      try {
        const intent = await this.repository.readIntent();
        if (intent) this.update({ intent: { value: intent, phase: 'uncertain' }, notice: 'Hay una operación pendiente de confirmación.' });
        this.intentHydrated = true;
      } catch { this.update({ storageError: true, fenced: true, notice: 'No pudimos leer las operaciones guardadas en el dispositivo.' }); }
    }
    if (result.status === 'not_found') {
      this.networkReady = true; this.update({ status: 'not_found', fenced: true, refreshing: false, notice: 'Esta sesión ya no está disponible.' }); this.writesPaused = false; return;
    }
    if (result.status !== 'ok') {
      this.networkReady = false; this.writesPaused = false;
      this.update({ status: this.snapshot.detail ? 'ready' : 'unavailable', refreshing: false,
        notice: result.status === 'unauthorized' || result.status === 'auth_required' ? 'Necesitamos validar tu acceso antes de continuar.' : 'No pudimos comprobar la sesión. Los borradores se conservan.' });
      return;
    }
    this.networkReady = true;
    this.orderNeedsCheck = false;
    const detail = result.data;
    if (!this.snapshot.summaryReady) {
      try { this.update({ summary: (await this.repository.readSummary()) ?? emptySessionSummary, summaryReady: true }); }
      catch { this.update({ storageError: true }); }
      if (this.disposed) return;
    }
    this.update({ status: 'ready', detail, fenced: detail.session.status !== 'in_progress' || !this.intentHydrated, notice: this.snapshot.intent ? 'Hay una operación pendiente de confirmación.' : null });
    for (const exercise of detail.exercises) {
      let entry = this.entries.get(exercise.id);
      if (!entry) {
        entry = { snapshot: { exercise, draft: exerciseDraft(exercise.payload), phase: 'idle', error: null, dirty: false, stale: false, storageReady: false },
          base: exercise.payload, version: exercise.updatedAt, revision: 0, writeId: this.generateKey(), stale: null, attempt: null, timer: null, flight: null, paused: false };
        this.entries.set(exercise.id, entry);
      }
      if (!entry.snapshot.storageReady) {
        try {
          const stored = await this.repository.readDraft(exercise.id);
          if (stored) {
            entry.writeId = stored.writeId;
            if (stored.serverUpdatedAt === exercise.updatedAt && detail.session.status === 'in_progress') {
              entry.base = exercise.payload; entry.version = exercise.updatedAt; entry.revision++;
              this.publish(entry, { draft: stored.draft, phase: stored.attemptPayload ? 'unconfirmed' : 'scheduled',
                error: stored.attemptPayload ? 'Hay un guardado pendiente de comprobación.' : null });
              if (stored.attemptPayload) entry.attempt = { payload: stored.attemptPayload, revision: entry.revision };
            } else if (detail.session.status === 'in_progress') {
              entry.stale = stored; this.publish(entry, { stale: true, phase: 'stale', error: 'Tenés cambios pendientes que necesitan revisión. No se aplicaron automáticamente.' });
            }
          }
          this.publish(entry, { storageReady: true });
        } catch { this.update({ storageError: true }); this.publish(entry, { error: 'No pudimos leer el borrador local. Reintentá antes de editar.' }); }
      } else if (detail.session.status === 'in_progress' && !entry.stale) {
        if (!entry.snapshot.dirty) {
          const draft = sameExercisePayload(entry.base, exercise.payload) ? entry.snapshot.draft : exerciseDraft(exercise.payload);
          entry.base = exercise.payload; entry.version = exercise.updatedAt; entry.attempt = null;
          this.publish(entry, { draft, phase: 'idle', error: null });
        } else await this.reconcile(entry, exercise.payload, exercise.updatedAt, true);
      }
      if (detail.session.status !== 'in_progress') {
        entry.base = exercise.payload; entry.version = exercise.updatedAt;
        this.publish(entry, { draft: exerciseDraft(exercise.payload), phase: 'closed', stale: false, error: null });
      }
      this.publish(entry, { exercise, ...(entry.snapshot.phase === 'removed' ? { phase: 'idle', error: null } : {}) });
      entry.paused = false;
    }
    const ids = new Set(detail.exercises.map(exercise => exercise.id));
    for (const [id, entry] of this.entries) if (!ids.has(id)) {
      if (!this.localRemovals.has(id) && !this.reportedRemovals.has(id)) {
        this.update({ notice: entry.snapshot.dirty || entry.stale
          ? 'Se quitó un ejercicio en otro lugar. Conservamos sus cambios pendientes.' : 'Se quitó un ejercicio desde otro dispositivo.' });
        this.reportedRemovals.add(id);
      }
      entry.paused = true; this.publish(entry, { phase: 'removed', error: 'El ejercicio fue quitado de la sesión. Su borrador se conserva.' });
    }
    if (!this.initialized) {
      try { this.setRest(restoreRestDeadline(await this.repository.readTimer(), ids, this.now()), false); this.initialized = true; }
      catch { this.update({ storageError: true }); }
    }
    if (this.rest && (!ids.has(this.rest.exerciseId) || detail.session.status !== 'in_progress')) this.setRest(null);
    this.writesPaused = false; this.update({ refreshing: false }); this.summarize();
    if (!this.snapshot.fenced && !this.snapshot.intent) for (const [id, entry] of this.entries) {
      if (ids.has(id) && this.canWrite(entry) && entry.snapshot.dirty) void this.flush(id);
    }
  }
  startRest(id: string, duration?: number) {
    const entry = this.entries.get(id); if (!entry || !this.canEdit(id)) return;
    const seconds = duration ?? restSeconds(entry.snapshot.exercise);
    if (seconds === null || !Number.isInteger(seconds) || seconds <= 0 || seconds > 3600) return;
    this.setRest({ exerciseId: id, exerciseName: entry.snapshot.exercise.nameSnapshot, endAt: this.now() + seconds * 1000 });
  }
  adjustRest(seconds: number) { if (this.rest && !this.snapshot.fenced && !this.snapshot.intent) this.setRest({ ...this.rest, endAt: Math.max(this.now(), this.rest.endAt + seconds * 1000) }); }
  skipRest() { this.setRest(null); }
  private setRest(timer: RestDeadline | null, persist = true) {
    this.rest = timer; if (!this.disposed) this.timerListeners.forEach(listener => listener());
    if (persist) void this.repository.writeTimer(timer).catch(() => this.update({ storageError: true }));
  }
  beginSetDrag(id: string): boolean {
    if (this.drag || this.snapshot.refreshing || !this.canEdit(id) || !this.foreground) return false;
    this.drag = { kind: 'sets', id };
    const entry = this.entries.get(id)!; if (entry.timer) clearTimeout(entry.timer); entry.timer = null;
    this.update({ interaction: 'sets' }); return true;
  }
  dropSets(id: string, ids: string[]): Promise<boolean> {
    if (this.drag?.kind !== 'sets' || this.drag.id !== id || !this.canEdit(id)) { this.cancelDrag(); return Promise.resolve(false); }
    const entry = this.entries.get(id)!;
    const current = entry.snapshot.draft.sets;
    if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some(key => !current.some(set => set.localId === key))) {
      this.cancelDrag(); return Promise.resolve(false);
    }
    this.drag = null; this.update({ interaction: null });
    if (ids.some((key, index) => current[index].localId !== key)) {
      const rows = new Map(current.map(set => [set.localId, set]));
      // One immutable payload revision at DROP; never a revision per crossed slot.
      this.change(id, draft => ({ ...draft, sets: ids.map((key, index) => ({ ...rows.get(key)!, setNumber: index + 1 })) }), true);
    } else void this.flush(id);
    return Promise.resolve(true);
  }
  beginExerciseDrag(): boolean {
    const detail = this.snapshot.detail;
    if (!detail || this.drag || this.orderNeedsCheck || this.snapshot.intent || this.snapshot.refreshing || this.snapshot.fenced || !this.foreground || this.disposed) return false;
    this.drag = { kind: 'exercises', version: detail.session.updatedAt, ids: detail.exercises.map(exercise => exercise.id) };
    this.pauseTimers(); this.update({ interaction: 'exercises' }); return true;
  }
  async dropExercises(ids: string[]): Promise<boolean> {
    const drag = this.drag;
    if (drag?.kind !== 'exercises') return false;
    this.drag = null; this.update({ interaction: null });
    if (ids.length !== drag.ids.length || new Set(ids).size !== ids.length || ids.some(id => !drag.ids.includes(id))) { this.resumeSaves(); return false; }
    if (ids.every((id, index) => id === drag.ids[index])) { this.resumeSaves(); return true; }
    return this.startIntent({ kind: 'reorder', input: { orderedSessionExerciseIds: ids, expectedSessionUpdatedAt: drag.version, idempotencyKey: this.generateKey() } });
  }
  cancelDrag() { this.drag = null; this.update({ interaction: null }); this.resumeSaves(); }
  private resumeSaves() {
    for (const [id, entry] of this.entries) if (this.canWrite(entry) && entry.snapshot.dirty) void this.flush(id);
  }
  async add(input: SessionAddInput) { await this.refreshFlight; return this.startIntent({ kind: 'add', input }); }
  async remove(id: string) {
    await this.refreshFlight;
    if (this.drag || this.snapshot.intent || this.snapshot.refreshing || this.snapshot.fenced) return false;
    const entry = this.entries.get(id); if (!entry) return false;
    entry.paused = true; if (entry.timer) clearTimeout(entry.timer); entry.timer = null; await entry.flight;
    if (this.disposed || this.snapshot.refreshing || this.snapshot.fenced || this.snapshot.intent) { entry.paused = false; return false; }
    if (recoveryPhases.has(entry.snapshot.phase) || !entry.snapshot.storageReady) {
      entry.paused = false; this.update({ notice: 'Comprobá los cambios y usá la versión guardada antes de quitar el ejercicio.' }); return false;
    }
    return this.startIntent({ kind: 'remove', exerciseId: id, expectedUpdatedAt: entry.version, idempotencyKey: this.generateKey(), draftWriteId: entry.writeId });
  }
  async cancel() { await this.refreshFlight; return this.startIntent({ kind: 'cancel', idempotencyKey: this.generateKey() }); }
  private async startIntent(intent: StructuralIntent): Promise<boolean> {
    if (this.drag || this.disposed || this.snapshot.intent || this.snapshot.refreshing || this.snapshot.fenced || !this.snapshot.detail) { this.resumeSaves(); return false; }
    this.pauseTimers(); this.update({ intent: { value: intent, phase: 'running' }, notice: null });
    return this.executeIntent(false);
  }
  retryIntent() { return this.snapshot.intent ? this.executeIntent(true) : Promise.resolve(false); }
  private executeIntent(replay: boolean): Promise<boolean> {
    if (this.structuralFlight) return this.structuralFlight;
    const intent = this.snapshot.intent?.value; if (!intent || this.disposed) return Promise.resolve(false);
    const flight = this.runIntent(intent, replay).finally(() => { if (this.structuralFlight === flight) this.structuralFlight = null; });
    this.structuralFlight = flight; return flight;
  }
  private async runIntent(intent: StructuralIntent, replay: boolean): Promise<boolean> {
    this.update({ intent: { value: intent, phase: 'running' }, notice: null });
    this.pauseTimers();
    try { await this.repository.writeIntent(intent); }
    catch { this.update({ storageError: true, intent: { value: intent, phase: 'uncertain' }, notice: 'No pudimos guardar la intención en el dispositivo. No se envió.' }); return false; }
    await Promise.all([...this.entries.values()].map(entry => entry.flight));
    await Promise.all([...this.recoveryFlights.values()]);
    if (this.disposed) return false;
    const result = await this.safe<SessionStructuralDto | SessionExerciseOrderDto | SessionFinishedDto>(() => intent.kind === 'add' ? this.api.add(intent.input) : intent.kind === 'remove'
      ? this.api.remove(intent.exerciseId, intent.expectedUpdatedAt, intent.idempotencyKey) : intent.kind === 'reorder' ? this.api.reorder(intent.input)
      : intent.kind === 'finish' ? this.api.finish({ metadata: intent.metadata, idempotencyKey: intent.idempotencyKey }) : this.api.cancel(intent.idempotencyKey));
    if (this.disposed) return false;
    if (result.status === 'ok' && intent.kind === 'finish') return this.confirmFinish(intent, result.data as SessionFinishedDto);
    if (result.status === 'not_found' && intent.kind === 'finish') {
      // The session no longer exists (cancelled elsewhere): nothing was finished.
      try { await this.repository.clearIntent(); }
      catch { this.update({ storageError: true, intent: { value: intent, phase: 'blocked' }, notice: 'No pudimos limpiar la intención local.' }); return false; }
      this.update({ intent: null }); await this.loadDetail(); return false;
    }
    if (result.status === 'ok') {
      if (intent.kind === 'cancel') {
        try { await this.repository.clearSession(); }
        catch { this.update({ storageError: true, intent: { value: intent, phase: 'uncertain' }, notice: 'La cancelación se confirmó. Reintentá la limpieza local.' }); return false; }
        this.setRest(null, false); this.update({ status: 'cancelled', intent: null, fenced: true, notice: null }); return true;
      }
      if (intent.kind === 'remove') {
        this.localRemovals.add(intent.exerciseId);
        // The mutation receipt confirms membership even if the subsequent read fails.
        const detail = this.snapshot.detail;
        if (detail) this.update({ detail: { ...detail, exercises: detail.exercises.filter(exercise => exercise.id !== intent.exerciseId) } });
        const entry = this.entries.get(intent.exerciseId);
        if (entry) { entry.paused = true; entry.stale = null; this.publish(entry, { draft: exerciseDraft(entry.base), stale: false, phase: 'removed', error: null }); }
        try { await this.repository.removeDraft(intent.exerciseId, intent.draftWriteId); }
        catch { this.update({ storageError: true, intent: { value: intent, phase: 'uncertain' }, notice: 'Se confirmó la eliminación. Reintentá la limpieza del borrador local.' }); return false; }
        if (this.rest?.exerciseId === intent.exerciseId) this.setRest(null);
      }
      try { await this.repository.clearIntent(); }
      catch { this.update({ storageError: true, intent: { value: intent, phase: 'uncertain' }, notice: 'Se confirmó la operación. Reintentá la limpieza local.' }); return false; }
      this.update({ intent: null });
      if (intent.kind === 'reorder') {
        if (replay) {
          // A ledger replay is historical truth, not necessarily the current order.
          await this.loadDetail(); return !this.orderNeedsCheck && this.networkReady && !this.snapshot.fenced;
        }
        if (result.data.status !== 'reordered') { this.orderNeedsCheck = true; this.update({ notice: 'No pudimos comprobar el orden. Comprobá la sesión.' }); return false; }
        const detail = this.snapshot.detail!;
        const rows = new Map(detail.exercises.map(exercise => [exercise.id, exercise]));
        if (result.data.orderedSessionExerciseIds.length !== rows.size || result.data.orderedSessionExerciseIds.some(id => !rows.has(id))) {
          this.orderNeedsCheck = true; this.update({ notice: 'La sesión cambió. Comprobá el orden antes de volver a mover ejercicios.' }); return false;
        }
        const exercises = result.data.orderedSessionExerciseIds.map((id, index) => {
          const entry = this.entries.get(id)!;
          const exercise = { ...entry.snapshot.exercise, order: index + 1 }; this.publish(entry, { exercise }); return exercise;
        });
        this.update({ detail: { ...detail, session: { ...detail.session, updatedAt: result.data.sessionUpdatedAt }, exercises }, notice: null });
        this.resumeSaves(); return true;
      }
      await this.loadDetail(); return true;
    }
    if (result.status === 'validation' || (result.status === 'conflict' && result.code !== 'IDEMPOTENCY_KEY_REUSED')) {
      if (result.status === 'conflict' && (result.code === 'SESSION_CLOSED' || result.code === 'SESSION_EXERCISE_REMOVED')) {
        this.update({ fenced: true }); this.pauseTimers();
        if (intent.kind === 'remove') {
          const entry = this.entries.get(intent.exerciseId);
          if (entry) { entry.paused = true; this.publish(entry, { phase: result.code === 'SESSION_CLOSED' ? 'closed' : 'removed', error: result.message }); }
        }
      }
      try { await this.repository.clearIntent(); }
      catch { this.update({ storageError: true, intent: { value: intent, phase: 'blocked' }, notice: 'No pudimos limpiar la intención local.' }); return false; }
      this.update({ intent: null });
      if (intent.kind === 'reorder') {
        this.orderNeedsCheck = true;
        this.update({ notice: result.status === 'conflict' && result.code === 'SESSION_CHANGED'
          ? 'Cambio en otro dispositivo. Se conservó el orden confirmado y tus borradores. Comprobá la sesión.' : result.message });
        this.resumeSaves(); return false;
      }
      await this.loadDetail(); this.update({ notice: result.message }); return false;
    }
    this.update({ intent: { value: intent, phase: result.status === 'conflict' ? 'blocked' : 'uncertain' },
      notice: result.status === 'conflict' ? result.message : 'No pudimos confirmar la operación. Comprobala antes de volver a editar.' });
    return false;
  }
  updateSummary(updater: (summary: SessionSummaryDraft) => SessionSummaryDraft) {
    if (!this.snapshot.summaryReady || this.snapshot.intent || this.snapshot.finishing || this.snapshot.fenced ||
      this.snapshot.detail?.session.status !== 'in_progress') return;
    this.update({ summary: updater(this.snapshot.summary) });
    void this.repository.writeSummary(this.snapshot.summary).catch(() => this.update({ storageError: true }));
  }
  /** One finish intent per user action: a second tap joins the same flight. */
  finish(): Promise<boolean> {
    if (this.finishFlight) return this.finishFlight;
    if (this.structuralFlight) return this.structuralFlight;
    const flight = this.prepareFinish().finally(() => { if (this.finishFlight === flight) this.finishFlight = null; });
    this.finishFlight = flight; return flight;
  }
  private finishBlockers(): string[] {
    return (this.snapshot.detail?.exercises ?? []).flatMap(exercise => {
      const entry = this.entries.get(exercise.id);
      if (!entry) return [exercise.nameSnapshot];
      const unconfirmed = entry.snapshot.dirty || entry.stale || entry.attempt || entry.flight || entry.timer || !entry.snapshot.storageReady ||
        recoveryPhases.has(entry.snapshot.phase) || ['validation', 'saving', 'scheduled'].includes(entry.snapshot.phase);
      return unconfirmed ? [entry.snapshot.exercise.nameSnapshot] : [];
    });
  }
  private async prepareFinish(): Promise<boolean> {
    await this.refreshFlight;
    const detail = this.snapshot.detail;
    if (!detail || detail.session.status !== 'in_progress' || this.drag || this.disposed || !this.foreground || this.snapshot.intent ||
      this.snapshot.refreshing || this.snapshot.fenced || !this.snapshot.summaryReady || this.snapshot.storageError) {
      this.update({ notice: 'No podemos finalizar en este momento. Comprobá la sesión y reintentá.' }); return false;
    }
    if (!this.networkReady) { this.update({ notice: 'Sin conexión. Tus cambios se conservan; finalizá cuando vuelva la conexión.' }); return false; }
    if (!summaryIsValid(this.snapshot.summary)) { this.update({ notice: 'Revisá el resumen antes de finalizar.' }); return false; }
    if (this.progress.completedSets === 0) { this.update({ notice: 'Marcá al menos una serie antes de finalizar.' }); return false; }
    // Lock edits, then drain every pending draft through the normal CAS autosave.
    this.update({ finishing: true, notice: null });
    let blockers: string[] = [];
    try {
      for (let round = 0; round < 3; round++) {
        await Promise.all([...this.entries.keys()].map(id => this.flush(id)));
        await Promise.all([...this.recoveryFlights.values()]);
        if (![...this.entries.values()].some(entry => entry.flight || entry.timer)) break;
      }
      if (this.disposed) return false;
      if (!this.foreground || this.snapshot.fenced || this.snapshot.intent || this.snapshot.refreshing || !this.networkReady ||
        this.snapshot.detail?.session.status !== 'in_progress') {
        this.update({ finishing: false, notice: 'La sesión cambió mientras preparábamos la finalización. Comprobala y reintentá.' }); return false;
      }
      blockers = this.finishBlockers();
    } catch { blockers = ['la sesión']; }
    if (blockers.length) {
      // Never finish over a local draft the server has not confirmed.
      this.update({ finishing: false, notice: `No finalizamos todavía: ${blockers.join(', ')} tiene cambios sin confirmar. Revisalos y reintentá.` });
      this.resumeSaves(); return false;
    }
    if (this.progress.completedSets === 0) { this.update({ finishing: false, notice: 'Marcá al menos una serie antes de finalizar.' }); return false; }
    // Synchronous hand-off: startIntent sets the intent lock before any await.
    this.update({ finishing: false });
    return this.startIntent({ kind: 'finish', metadata: finishMetadata(this.snapshot.summary), idempotencyKey: this.generateKey() });
  }
  private async confirmFinish(intent: Extract<StructuralIntent, { kind: 'finish' }>, finished: SessionFinishedDto): Promise<boolean> {
    // Server truth confirmed: only now drop drafts, timer, summary and the replay key.
    try { await this.repository.clearSession(); }
    catch { this.update({ storageError: true, intent: { value: intent, phase: 'uncertain' }, notice: 'El entrenamiento se guardó. Reintentá la limpieza local.' }); return false; }
    for (const entry of this.entries.values()) { entry.paused = true; if (entry.timer) clearTimeout(entry.timer); entry.timer = null; }
    this.setRest(null, false);
    const detail = this.snapshot.detail;
    this.update({ intent: null, fenced: true, notice: null, finished, summary: emptySessionSummary,
      ...(detail ? { detail: { ...detail, session: { ...detail.session, status: 'completed' as const, endedAt: finished.endedAt,
        updatedAt: finished.sessionUpdatedAt, metadata: { ...detail.session.metadata, ...finished.metadata } } } } : {}) });
    // Full completed read-back (exercises/sets) after this flight settles.
    void this.refresh();
    return true;
  }
  async discardBlockedIntent() {
    if (this.snapshot.intent?.phase !== 'blocked' || this.structuralFlight) return;
    try { await this.repository.clearIntent(); }
    catch { this.update({ storageError: true }); return; }
    this.update({ intent: null }); await this.refresh();
  }
}
