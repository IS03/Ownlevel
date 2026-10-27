import type { SessionAddInput } from '@/api/active-session';
import type { ActiveSessionController } from './active-session-controller';

export const SESSION_UNDO_MS = 6000;
type Controller = Pick<ActiveSessionController, 'getSnapshot' | 'getExercise' | 'getExerciseRevision' | 'subscribe' | 'subscribeExercise' | 'canEdit' | 'add' | 'remove'>;
export type SessionActionState = {
  addedId: string | null; working: boolean;
  notice: { message: string; undo: 'added' | null } | null;
};
/** Removal goes straight to the durable controller; notices never substitute for persistence. */
export class SessionExerciseActions {
  private state: SessionActionState = { addedId: null, working: false, notice: null };
  private active = false;
  private listeners = new Set<() => void>();
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private detach: (() => void) | null = null;
  private detachAdded: (() => void) | null = null;
  private removal: Promise<boolean> | null = null;
  private pendingAdd: { ids: Set<string>; detail: ReturnType<Controller['getSnapshot']>['detail']; exerciseId?: string; key: string } | null = null;
  constructor(private readonly controller: Controller) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<SessionActionState>) { this.state = { ...this.state, ...next }; this.listeners.forEach(listener => listener()); }
  activate() { this.active = true; this.detach?.(); this.detach = this.controller.subscribe(() => this.observe()); this.observe(); }
  private stopClock() { if (this.deadline) clearTimeout(this.deadline); this.deadline = null; }
  private stopAdded() { this.detachAdded?.(); this.detachAdded = null; }
  private observe() {
    if (!this.active) return;
    const snapshot = this.controller.getSnapshot();
    if (snapshot.detail?.session.status !== 'in_progress' || snapshot.fenced) { this.cancelWindow(); return; }
    const pending = this.pendingAdd;
    if (!pending || snapshot.refreshing) return;
    if (snapshot.intent) {
      if (snapshot.intent.value.kind !== 'add' || snapshot.intent.value.input.idempotencyKey !== pending.key) this.pendingAdd = null;
      return;
    }
    if (snapshot.detail === pending.detail) return;
    const added = snapshot.detail.exercises.filter(row => !pending.ids.has(row.id) && (!pending.exerciseId || row.exerciseId === pending.exerciseId));
    if (added.length !== 1) { this.pendingAdd = null; return; }
    this.pendingAdd = null;
    const row = added[0], revision = this.controller.getExerciseRevision(row.id);
    this.stopClock(); this.stopAdded();
    this.update({ addedId: row.id, notice: { message: `${row.nameSnapshot} agregado`, undo: 'added' } });
    this.detachAdded = this.controller.subscribeExercise(row.id, () => {
      if (this.controller.getExerciseRevision(row.id) !== revision || ['closed', 'removed', 'stale', 'conflict'].includes(this.controller.getExercise(row.id)?.phase ?? '')) {
        this.stopAdded();
        if (this.state.notice?.undo === 'added') this.update({ notice: { ...this.state.notice, undo: null } });
      }
    });
    this.deadline = setTimeout(() => { this.stopAdded(); this.update({ notice: null }); }, SESSION_UNDO_MS);
  }
  async add(input: SessionAddInput, _name: string) {
    if (!await this.settleRemoval() || !this.active) return false;
    this.pendingAdd = { ids: new Set(this.controller.getSnapshot().detail?.exercises.map(row => row.id)), detail: this.controller.getSnapshot().detail,
      exerciseId: input.operation === 'add_existing' ? input.exerciseId : undefined, key: input.idempotencyKey };
    const confirmed = await this.controller.add(input);
    this.observe();
    if (!confirmed && !this.controller.getSnapshot().intent) this.pendingAdd = null;
    return confirmed;
  }
  remove(id: string): Promise<boolean> {
    if (this.removal || !this.active || !this.controller.canEdit(id)) return Promise.resolve(false);
    const exercise = this.controller.getExercise(id);
    if (!exercise) return Promise.resolve(false);
    this.stopClock(); this.stopAdded();
    this.update({ working: true, notice: { message: `Quitando ${exercise.exercise.nameSnapshot}…`, undo: null } });
    const flight = this.controller.remove(id).then(confirmed => {
      if (this.active) {
        this.update({ notice: { message: confirmed ? `${exercise.exercise.nameSnapshot} quitado` : 'No pudimos confirmar la eliminación. Comprobá la sesión.', undo: null } });
        this.deadline = setTimeout(() => this.update({ notice: null }), SESSION_UNDO_MS);
      }
      return confirmed;
    }).finally(() => { this.removal = null; this.update({ working: false }); });
    this.removal = flight; return flight;
  }
  async undo() {
    if (this.state.working) return;
    if (this.state.notice?.undo === 'added' && this.state.addedId && this.controller.canEdit(this.state.addedId)) {
      const id = this.state.addedId;
      await this.remove(id);
    }
  }
  settleRemoval(): Promise<boolean> {
    return this.removal ?? Promise.resolve(true);
  }
  /** Leaving/backgrounding clears feedback only; the controller owns pending writes. */
  cancelWindow() {
    this.pendingAdd = null;
    if (this.removal) return;
    this.stopClock(); this.stopAdded(); this.update({ notice: null });
  }
  dispose() { this.active = false; this.detach?.(); this.detach = null; this.cancelWindow(); this.stopAdded(); this.stopClock(); }
}
