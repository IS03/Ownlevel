import { parseInputNutritionDate } from './day-format';
import type { MobileApiRequestResult, MobileApiReadResult } from '@/api/results';
import type { MealMutationIntent, MealMutationResponse } from '@/api/nutrition-meal';
import type { MobileNutritionDayResponse, NutritionDayMeal } from '../../../../src/lib/mobile-api/nutrition-day-contract';
import { mealDraft, validateMealDraft, type MealDraft, repeatMealDraft } from './meal-form-model';
import { MealIntentRepository, type StoredMealIntent } from './meal-storage';
export type MealApi = { mutate: (intent: MealMutationIntent) => Promise<MobileApiRequestResult<MealMutationResponse>>;
  read: (date: string) => Promise<MobileApiReadResult<MobileNutritionDayResponse>> };
type Editor = { sourceDate: string; mealId: string | null; expectedUpdatedAt: string | null; draft: MealDraft; original: MealDraft };
export type MealEditorState = { phase: 'loading' | 'idle' | 'pending' | 'uncertain' | 'duplicate' | 'conflict' | 'blocked' | 'confirmed';
  editor: Editor | null; intent: StoredMealIntent | null; message: string | null;
  errors: Partial<Record<keyof MealDraft, string>>; truth: NutritionDayMeal | null; truthDate: string | null };
export class MealController {
  private state: MealEditorState = { phase: 'loading', editor: null, intent: null, message: null, errors: {}, truth: null, truthDate: null };
  private listeners = new Set<() => void>();
  private busy = false;
  private disposed = false;
  constructor(private api: MealApi, private repository: MealIntentRepository, private invalidate: (dates: string[]) => void,
    private newKey: () => string = () => `meal:${Date.now()}:${Math.random().toString(36).slice(2)}`) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<MealEditorState>) { if (!this.disposed) { this.state = { ...this.state, ...patch }; this.listeners.forEach(f => f()); } }
  dispose() { this.disposed = true; this.listeners.clear(); this.confirmedListeners.clear(); }
  async initialize() {
    try {
      const stored = await this.repository.read();
      if (stored) {
        const i = stored.intent;
        this.update({ phase: stored.receipt ? 'confirmed' : 'uncertain', intent: stored, message: stored.receipt ? 'La operación está confirmada. Falta actualizar los días.' : 'Hay un intento sin resultado confirmado. Comprobalo antes de guardar otra comida.',
          editor: { sourceDate: i.sourceDate, mealId: i.mealId, expectedUpdatedAt: i.expectedUpdatedAt, draft: stored.draft, original: stored.draft } });
      } else this.update({ phase: 'idle', intent: null, message: null });
    } catch { this.update({ phase: 'blocked', message: 'No pudimos leer el intento local. Revisá el almacenamiento antes de continuar.' }); }
  }
  open(date: string, meal?: NutritionDayMeal) {
    if (this.state.phase !== 'idle' || this.state.intent || (meal && (meal.sourceType !== 'manual' || meal.entryKind !== 'meal'))) return;
    const draft = mealDraft(date, meal);
    this.update({ editor: { sourceDate: date, mealId: meal?.id ?? null, expectedUpdatedAt: meal?.updatedAt ?? null, draft, original: draft }, errors: {}, message: null, truth: null, truthDate: null });
  }
  /** Opens "A mano" prefilled from any meal (also ChatGPT/imported ones): it creates a new manual meal, never edits the source. */
  repeat(date: string, meal: NutritionDayMeal) {
    if (this.state.phase !== 'idle' || this.state.intent || this.busy || meal.entryKind !== 'meal') return;
    const draft = repeatMealDraft(date, meal);
    this.update({ editor: { sourceDate: date, mealId: null, expectedUpdatedAt: null, draft, original: draft }, errors: {}, message: null, truth: null, truthDate: null });
  }
  change(field: Exclude<keyof MealDraft, 'saveToLibrary' | 'mealLabel'>, value: string) {
    const editor = this.state.editor;
    if (!editor || this.state.intent || this.busy || ['loading','blocked','confirmed'].includes(this.state.phase)) return;
    // Moving the meal to another day keeps its clock time: a time stays on the meal's own day (server rule).
    const day = field === 'date' ? parseInputNutritionDate(value) : null;
    const moved = day && editor.draft.consumedAt ? { consumedAt: `${day}T${new Date(Date.parse(editor.draft.consumedAt) - 10800000).toISOString().slice(11, 16)}:00-03:00` } : {};
    this.update({ editor: { ...editor, draft: { ...editor.draft, [field]: value, ...moved } }, errors: {},
      ...(this.state.phase === 'duplicate' ? { phase: 'idle' as const, message: null } : {}) });
  }
  timing(mealLabel: MealDraft['mealLabel'], consumedAt?: string) {
    if (this.state.editor && !this.state.intent && !this.busy && this.state.phase === 'idle') this.update({ editor: { ...this.state.editor, draft: { ...this.state.editor.draft, mealLabel, ...(consumedAt ? { consumedAt } : {}) } } });
  }
  saveToLibrary(value: boolean) {
    if (this.state.editor && !this.state.editor.mealId && !this.state.intent && !this.busy && this.state.phase === 'idle') this.update({ editor: { ...this.state.editor, draft: { ...this.state.editor.draft, saveToLibrary: value } } });
  }
  private confirmedListeners = new Set<(stored: StoredMealIntent) => void>();
  subscribeConfirmed = (f: (stored: StoredMealIntent) => void) => { this.confirmedListeners.add(f); return () => { this.confirmedListeners.delete(f); }; };
  dirty() { const e = this.state.editor; return !!e && JSON.stringify(e.draft) !== JSON.stringify(e.original); }
  close() {
    if (this.busy) return;
    if (this.state.intent) this.update({ editor: null });
    else this.update({ editor: null, phase: this.state.phase === 'blocked' ? 'blocked' : 'idle', errors: {}, message: this.state.phase === 'blocked' ? this.state.message : null, truth: null, truthDate: null });
  }
  showRecovery() {
    const stored = this.state.intent;
    if (!stored || this.busy) return;
    const i = stored.intent;
    this.update({ editor: { sourceDate: i.sourceDate, mealId: i.mealId, expectedUpdatedAt: i.expectedUpdatedAt, draft: stored.draft, original: stored.draft } });
  }
  async save(forceDuplicate = false, deleting = false) {
    const e = this.state.editor;
    if (this.disposed || !e || this.busy || this.state.intent || !['idle','duplicate'].includes(this.state.phase)) return;
    const validation = validateMealDraft(e.draft);
    if (!deleting && !validation.fields) { this.update({ errors: validation.errors }); return; }
    // A new meal lives where the Día chip points (the server requires create's destination to be its source).
    const sourceDate = !e.mealId && !deleting && validation.fields ? validation.fields.date : e.sourceDate;
    const intent: MealMutationIntent = { operation: deleting ? 'delete' : e.mealId ? 'edit' : 'create', sourceDate,
      mealId: e.mealId, expectedUpdatedAt: e.expectedUpdatedAt, idempotencyKey: this.newKey(), fields: deleting ? null : validation.fields!, forceDuplicate };
    const stored: StoredMealIntent = { version: 1, intent, draft: e.draft };
    this.busy = true; this.update({ phase: 'pending', errors: {}, message: null });
    try { await this.repository.write(stored); this.update({ intent: stored }); await this.send(stored); }
    catch { this.update({ phase: 'blocked', message: 'No pudimos guardar el intento local. No enviamos una operación nueva. Comprobá el almacenamiento.' }); }
    finally { this.busy = false; }
  }
  async recover() {
    if (this.disposed || this.busy) return;
    if (!this.state.intent) { await this.initialize(); return; }
    this.busy = true; const stored = this.state.intent; this.update({ phase: 'pending', message: null });
    try { if (stored.receipt) await this.confirmed(stored); else await this.send(stored); }
    catch { this.update({ phase: 'uncertain', message: 'El intento sigue guardado. No pudimos comprobar su resultado.' }); }
    finally { this.busy = false; }
  }
  private async send(stored: StoredMealIntent) {
    // A delayed storage write must not send after logout/scope teardown.
    if (this.disposed) return;
    let result: MobileApiRequestResult<MealMutationResponse>;
    try { result = await this.api.mutate(stored.intent); }
    catch { this.update({ phase: 'uncertain', message: 'No sabemos si se guardó. Comprobar usa exactamente el mismo intento.' }); return; }
    if (result.status === 'ok' && 'status' in result.data) {
      const confirmed = { ...stored, receipt: result.data };
      this.update({ intent: confirmed, phase: 'confirmed' });
      await this.repository.write(confirmed); await this.confirmed(confirmed); return;
    }
    if (result.status === 'unavailable') { this.update({ phase: 'uncertain', message: 'No sabemos si se guardó. Comprobar usa exactamente el mismo intento.' }); return; }
    if (result.status === 'unauthorized' || result.status === 'auth_required') {
      this.update({ phase: 'uncertain', message: 'Revalidá tu sesión y comprobá el intento. Conservamos sus datos.' }); return;
    }
    if (result.status === 'conflict' || result.status === 'not_found' || result.status === 'validation') {
      await this.repository.clear(stored.intent.idempotencyKey); this.update({ intent: null, message: result.message });
      this.invalidate([stored.intent.sourceDate, ...(stored.intent.fields ? [stored.intent.fields.date] : [])]);
      if (result.status === 'conflict' && result.code === 'POSSIBLE_DUPLICATE') { this.update({ phase: 'duplicate' }); return; }
      if (result.status === 'conflict' && result.code === 'MEAL_CHANGED') {
        const date = result.data && 'error' in result.data ? result.data.currentDate : undefined;
        this.update({ phase: 'conflict', truth: null, truthDate: date ?? null });
        if (date) await this.readConflict(date, stored.intent.mealId!);
      } else this.update({ phase: result.status === 'validation' || result.status === 'conflict' && result.code === 'SAVED_NAME_EXISTS' ? 'idle' : 'conflict', truth: null, truthDate: null });
      return;
    }
    this.update({ phase: 'uncertain', message: 'La respuesta no confirma el resultado. Comprobá el intento guardado.' });
  }
  private async confirmed(stored: StoredMealIntent) {
    const receipt = stored.receipt!;
    const dates = [...new Set([receipt.sourceDate, receipt.destinationDate])];
    this.invalidate(dates);
    const reads = await Promise.all(dates.map(date => this.api.read(date)));
    if (reads.some(r => r.status !== 'ok' || r.data.nutrition.status !== 'ok')) {
      this.update({ phase: 'confirmed', message: 'La operación está confirmada, pero no pudimos actualizar todos los días. No vuelvas a guardar.' }); return;
    }
    await this.repository.clear(stored.intent.idempotencyKey);
    this.confirmedListeners.forEach(f => f(stored));
    this.update({ phase: 'idle', intent: null, editor: null, message: receipt.status === 'deleted' ? 'Comida eliminada.' : 'Comida guardada.', errors: {}, truth: null, truthDate: null });
  }
  private async readConflict(date: string, id: string) {
    try {
      const result = await this.api.read(date);
      if (result.status === 'ok' && result.data.nutrition.status === 'ok') {
        this.update({ truth: result.data.nutrition.data.meals.find(m => m.id === id && m.entryKind === 'meal' && m.sourceType === 'manual') ?? null });
      }
    } catch { /* A failed truth read must never authorize a new version. */ }
  }
  cancelDuplicate() { if (!this.busy && !this.state.intent && this.state.phase === 'duplicate') this.update({ phase: 'idle', message: null }); }
  reviseCreate() { if (!this.busy && !this.state.intent && !this.state.editor?.mealId && this.state.phase === 'conflict') this.update({ phase: 'idle' }); }
  async undo(meal: NutritionDayMeal, date: string) {
    if (this.busy || this.state.phase !== 'idle' || this.state.intent) return;
    this.open(date, meal);
    await this.save(false, true);
  }
  async refreshConflict() {
    const e = this.state.editor;
    if (!this.busy && this.state.phase === 'conflict' && e?.mealId && this.state.truthDate) {
      this.busy = true; this.update({ phase: 'pending', truth: null });
      await this.readConflict(this.state.truthDate, e.mealId); this.update({ phase: 'conflict' }); this.busy = false;
    }
  }
  reviewWithServerVersion() {
    const { truth, truthDate, editor } = this.state;
    if (!truth || !truthDate || !editor || this.state.phase !== 'conflict') return;
    // Explicit review only: preserve the draft, adopt the observed CAS and
    // require another deliberate Save. No retry with a new version here.
    this.update({ phase: 'idle', editor: { ...editor, sourceDate: truthDate, expectedUpdatedAt: truth.updatedAt },
      message: 'Revisá tu borrador y guardá sólo si querés aplicar estos valores a la versión mostrada.' });
  }
}
