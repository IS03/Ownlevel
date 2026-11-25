import type { SessionDetailDto } from '@/api/active-session';
import type { MobileApiReadResult, MobileApiRequestResult } from '@/api/results';
import type { MobileTrainingActiveSession, MobileTrainingResponse } from '@/api/training';
import type { ActiveSessionController } from './active-session-controller';
import { restoreRestDeadline, type RestDeadline, type SessionExerciseDraft } from './active-session-model';
import { SessionDraftRepository, type SessionStoragePort } from './active-session-storage';
import { detailProgress, type SessionLiveProgress } from './session-progress-model';

export type SessionPresence = {
  /** `startedAt` only once a detail read confirmed it (#634: elapsed time on the Live Activity); never guessed. */
  session: (MobileTrainingActiveSession & { startedAt?: string }) | null;
  timer: RestDeadline | null;
  /** #645: sets done and the next set, for the Live Activity; null when no detail is known. */
  progress?: SessionLiveProgress | null;
  /** #645: the session screen is mounted, so the Live Activity's buttons can act on it. */
  controls?: boolean;
  unavailable: boolean;
  recovery: boolean;
};
export type SessionPresenceApi = {
  active: () => Promise<MobileApiReadResult<MobileTrainingResponse>>;
  detail: (id: string) => Promise<MobileApiRequestResult<SessionDetailDto>>;
};
export const PRESENCE_REUSE_MS = 30_000;
type PresenceReadOptions = { now?: () => number; writeRevision?: () => number };
const empty: SessionPresence = { session: null, timer: null, unavailable: false, recovery: false };

/** Read-only presentation shared by the tabs. The session controller still owns every write. */
export class SessionPresenceStore {
  private snapshot = empty;
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private alive = true;
  private flight: Promise<void> | null = null;
  private attached: { id: string; controller: ActiveSessionController } | null = null;

  private confirmedAt: number | null = null;
  private confirmedWrites = -1;
  private readonly now: () => number;
  private readonly writeRevision: () => number;

  constructor(private readonly api: SessionPresenceApi, private readonly storage: SessionStoragePort, private readonly owner: string,
    { now = Date.now, writeRevision = () => 0 }: PresenceReadOptions = {}) {
    this.now = now; this.writeRevision = writeRevision;
  }
  getSnapshot = () => this.snapshot;
  /** The mounted session's controller, only for that session: a Live Activity action never reaches another one. */
  controllerFor = (sessionId: string) => this.attached?.id === sessionId ? this.attached.controller : null;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  activate() { this.alive = true; }
  dispose() { this.alive = false; this.revision++; this.flight = null; }

  private publish(next: SessionPresence) {
    if (!this.alive || JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next; this.listeners.forEach(listener => listener());
  }

  /** Detaching a screen retains its last confirmed session and its absolute rest deadline. */
  attach(id: string, controller: ActiveSessionController) {
    const observe = () => {
      if (!this.alive) return;
      const state = controller.getSnapshot();
      const detail = state.detail;
      this.revision++; // A late discovery read cannot overwrite a newer local observation.
      if (!state.intent && (state.status === 'cancelled' || state.status === 'not_found' || (detail && detail.session.status !== 'in_progress'))) {
        if (this.snapshot.session?.id === id) this.publish(empty);
      } else if (detail) {
        const drafts = new Map<string, SessionExerciseDraft>();
        for (const exercise of detail.exercises) { const entry = controller.getExercise(exercise.id); if (entry) drafts.set(exercise.id, entry.draft); }
        this.publish({ session: { id, name: detail.session.name, logDate: detail.session.logDate, startedAt: detail.session.startedAt }, timer: controller.getTimer(),
          progress: detailProgress(detail, drafts), controls: state.status === 'ready' && !state.intent && !state.fenced && !state.finishing,
          unavailable: state.status === 'unavailable', recovery: !!state.intent });
      }
    };
    const unsubscribe = controller.subscribe(observe);
    const unsubscribeTimer = controller.subscribeTimer(observe);
    const unsubscribeProgress = controller.subscribeProgress(observe);
    this.attached = { id, controller };
    observe();
    return () => {
      unsubscribe(); unsubscribeTimer(); unsubscribeProgress();
      if (this.attached?.controller !== controller) return;
      this.attached = null;
      // Without the screen nothing can act: the buttons go, the rest of what it showed stays.
      if (this.alive && this.snapshot.session?.id === id && this.snapshot.controls) this.publish({ ...this.snapshot, controls: false });
    };
  }

  /** Navigation reuses a complete, successful discovery only while fresh and with no intervening writes. */
  refreshIfNeeded(): Promise<void> {
    if (this.confirmedAt !== null && !this.snapshot.unavailable && this.confirmedWrites === this.writeRevision()
      && this.now() - this.confirmedAt < PRESENCE_REUSE_MS) return Promise.resolve();
    return this.refresh();
  }

  /** Explicit/foreground reads bypass the navigation window. */
  refresh(): Promise<void> {
    if (!this.alive) return Promise.resolve();
    if (this.flight) return this.flight;
    const revision = this.revision;
    const writes = this.writeRevision();
    const current = () => this.alive && this.revision === revision && this.writeRevision() === writes;
    const confirmed = () => { this.confirmedAt = this.now(); this.confirmedWrites = writes; };
    const flight = (async () => {
      try {
        const result = await this.api.active();
        if (!current()) return;
        if (result.status !== 'ok' || result.data.activeSession.status !== 'ok') {
          this.publish({ ...this.snapshot, unavailable: true }); return;
        }
        const session = result.data.activeSession.data;
        // A pending finish/cancel still needs its established recovery screen.
        if (this.snapshot.recovery) return;
        if (!session) { this.publish(empty); confirmed(); return; }
        const same = this.snapshot.session?.id === session.id;
        this.publish({ session: same ? { ...session, startedAt: this.snapshot.session?.startedAt } : session, timer: same ? this.snapshot.timer : null,
          progress: same ? this.snapshot.progress ?? null : null, controls: same && this.attached?.id === session.id ? this.snapshot.controls : false,
          unavailable: false, recovery: false });
        const detail = await this.api.detail(session.id);
        if (!current()) return;
        if (detail.status === 'not_found' || (detail.status === 'ok' && detail.data.session.status !== 'in_progress')) {
          this.publish(empty); confirmed(); return;
        }
        if (detail.status !== 'ok') { this.publish({ ...this.snapshot, unavailable: true }); return; }
        const repository = new SessionDraftRepository(this.storage, this.owner, session.id);
        const storedTimer = await repository.readTimer();
        // This device's unsent drafts count too: the Live Activity shows the same sets as the session screen.
        const drafts = new Map<string, SessionExerciseDraft>();
        for (const exercise of detail.data.exercises) {
          const stored = await repository.readDraft(exercise.id).catch(() => null);
          if (stored && stored.sessionId === session.id) drafts.set(exercise.id, stored.draft);
        }
        if (!current()) return;
        // A mounted session publishes its own live progress (with row ids for the buttons); a read never overrides it.
        const live = this.attached?.id === session.id && this.snapshot.session?.id === session.id;
        this.publish({ session: { ...session, startedAt: detail.data.session.startedAt }, progress: live ? this.snapshot.progress ?? null : detailProgress(detail.data, drafts),
          controls: live ? this.snapshot.controls : false, timer: restoreRestDeadline(storedTimer, new Set(detail.data.exercises.map(exercise => exercise.id))), unavailable: false, recovery: false });
        confirmed();
      } catch {
        if (current()) this.publish({ ...this.snapshot, unavailable: true });
      }
    })().finally(() => {
      if (this.flight !== flight) return;
      this.flight = null;
      // A route can join a read started before a write settled. Discard that response and revalidate once the
      // flight finishes; a controller observation takes precedence and never causes a competing discovery.
      if (this.alive && this.revision === revision && this.writeRevision() !== writes) return this.refresh();
    });
    this.flight = flight; return flight;
  }
}
