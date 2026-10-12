import type { SessionDetailDto } from '@/api/active-session';
import type { MobileApiReadResult, MobileApiRequestResult } from '@/api/results';
import type { MobileTrainingActiveSession, MobileTrainingResponse } from '@/api/training';
import type { ActiveSessionController } from './active-session-controller';
import { restoreRestDeadline, type RestDeadline } from './active-session-model';
import { SessionDraftRepository, type SessionStoragePort } from './active-session-storage';

export type SessionPresence = {
  session: MobileTrainingActiveSession | null;
  timer: RestDeadline | null;
  unavailable: boolean;
  recovery: boolean;
};
export type SessionPresenceApi = {
  active: () => Promise<MobileApiReadResult<MobileTrainingResponse>>;
  detail: (id: string) => Promise<MobileApiRequestResult<SessionDetailDto>>;
};
const empty: SessionPresence = { session: null, timer: null, unavailable: false, recovery: false };

/** Read-only presentation shared by the tabs. The session controller still owns every write. */
export class SessionPresenceStore {
  private snapshot = empty;
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private alive = true;
  private flight: Promise<void> | null = null;

  constructor(private readonly api: SessionPresenceApi, private readonly storage: SessionStoragePort, private readonly owner: string) {}
  getSnapshot = () => this.snapshot;
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
        this.publish({ session: { id, name: detail.session.name, logDate: detail.session.logDate }, timer: controller.getTimer(),
          unavailable: state.status === 'unavailable', recovery: !!state.intent });
      }
    };
    const unsubscribe = controller.subscribe(observe);
    const unsubscribeTimer = controller.subscribeTimer(observe);
    observe();
    return () => { unsubscribe(); unsubscribeTimer(); };
  }

  refresh(): Promise<void> {
    if (!this.alive) return Promise.resolve();
    if (this.flight) return this.flight;
    const revision = this.revision;
    const current = () => this.alive && this.revision === revision;
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
        if (!session) { this.publish(empty); return; }
        const previousTimer = this.snapshot.session?.id === session.id ? this.snapshot.timer : null;
        this.publish({ session, timer: previousTimer, unavailable: false, recovery: false });
        const detail = await this.api.detail(session.id);
        if (!current()) return;
        if (detail.status === 'not_found' || (detail.status === 'ok' && detail.data.session.status !== 'in_progress')) {
          this.publish(empty); return;
        }
        if (detail.status !== 'ok') { this.publish({ ...this.snapshot, unavailable: true }); return; }
        const repository = new SessionDraftRepository(this.storage, this.owner, session.id);
        const storedTimer = await repository.readTimer();
        if (!current()) return;
        this.publish({ session, timer: restoreRestDeadline(storedTimer, new Set(detail.data.exercises.map(exercise => exercise.id))), unavailable: false, recovery: false });
      } catch {
        if (current()) this.publish({ ...this.snapshot, unavailable: true });
      }
    })().finally(() => { if (this.flight === flight) this.flight = null; });
    this.flight = flight; return flight;
  }
}
