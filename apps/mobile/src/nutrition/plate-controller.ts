import type { MobileApiReadResult, MobileApiRequestResult } from '@/api/results';
import type { FoodsResponse, PersonalFood } from '@/api/nutrition-food';
import { sameQuickSelection, type QuickIntent, type QuickPreview, type QuickResponse, type QuickSelection } from '@/api/nutrition-quick';
import type { MobileNutritionDayResponse, NutritionDayMeal } from '@/api/nutrition-day';
import { plateDraft, plateable, selectionFromPlate, stepped, withFood, PLATE_TITLE_MAX, type PlateDraft } from './plate-model';
import type { PlateIntentRepository, StoredPlateIntent } from './plate-storage';

export type PlateApi = {
  foods: () => Promise<MobileApiReadResult<FoodsResponse>>;
  preview: (s: QuickSelection) => Promise<MobileApiRequestResult<QuickPreview>>;
  confirm: (i: QuickIntent) => Promise<MobileApiRequestResult<QuickResponse>>;
  read: (date: string) => Promise<MobileApiReadResult<MobileNutritionDayResponse>>;
};
export type PlateState = {
  phase: 'loading' | 'idle' | 'pending' | 'uncertain' | 'confirmed' | 'blocked';
  open: boolean;
  /** `pick`: the foods, to fill the plate; `review`: the plate itself, its total and «Registrar». */
  view: 'pick' | 'review';
  date: string | null; draft: PlateDraft | null; search: string;
  foods: PersonalFood[] | null; foodsLoading: boolean; foodsError: boolean;
  preview: QuickPreview | null; previewLoading: boolean;
  intent: StoredPlateIntent | null; message: string | null; errors: Record<string, string>;
};
const SAVED_NAME = 'Ya tenés una comida guardada con ese nombre. Cambialo o desactivá Guardar en mis comidas.';

/**
 * «Plato»: builds one meal from several personal foods by quantity and registers it through the quick source `plate`
 * (same preview, idempotency ledger and atomic confirm as Rápido). Closing the sheet keeps the plate as it is (no
 * confirmation needed, nothing is lost); only «Vaciar» or a registration empties it. A write is stored before it is sent
 * and an unknown outcome is only ever re-sent as the same intent, on request.
 */
export class PlateController {
  private state: PlateState = { phase: 'loading', open: false, view: 'pick', date: null, draft: null, search: '', foods: null, foodsLoading: false,
    foodsError: false, preview: null, previewLoading: false, intent: null, message: null, errors: {} };
  private listeners = new Set<() => void>(); private disposed = false; private busy = false; private previewGeneration = 0; private foodsGeneration = 0;
  private confirmedListeners = new Set<(meal: NutritionDayMeal, date: string) => void>();
  constructor(private api: PlateApi, private repository: PlateIntentRepository, private invalidate: () => void,
    private newKey: () => string = () => `plate:${Date.now()}:${Math.random().toString(36).slice(2)}`) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeConfirmed = (f: (meal: NutritionDayMeal, date: string) => void) => { this.confirmedListeners.add(f); return () => { this.confirmedListeners.delete(f); }; };
  private update(patch: Partial<PlateState>) { if (!this.disposed) { this.state = { ...this.state, ...patch }; this.listeners.forEach(f => f()); } }
  dispose() { this.disposed = true; this.previewGeneration++; this.foodsGeneration++; this.listeners.clear(); this.confirmedListeners.clear(); }
  private get editable() { return this.state.phase === 'idle' && !this.state.intent && !this.busy; }

  async initialize() {
    try {
      const stored = await this.repository.read();
      this.update(stored ? { phase: stored.receipt ? 'confirmed' : 'uncertain', intent: stored, draft: stored.draft, date: stored.intent.date, view: 'review',
        message: stored.receipt ? 'El plato está registrado. Falta actualizar el día.' : 'Hay un plato sin resultado confirmado. Comprobalo antes de registrar otro.' } : { phase: 'idle' });
    } catch { this.update({ phase: 'blocked', message: 'No pudimos leer el plato guardado. Comprobá el almacenamiento.' }); }
  }
  /** Opens on the plate kept from before (moved to `date`), or a new one; with foods already in it, on its review. */
  open(date: string) {
    if (!this.editable) return;
    this.previewGeneration++;
    const kept = this.state.draft, draft = kept ? this.moved(kept, date) : plateDraft(date);
    this.update({ open: true, date, draft, view: draft.items.length ? 'review' : 'pick', search: '', preview: null, previewLoading: false, message: null, errors: {} });
    void this.loadFoods();
  }
  /** Closing never loses the plate: it is here the next time «Plato» opens. */
  close() { if (this.busy) return; this.previewGeneration++; this.update({ open: false, previewLoading: false }); }
  showRecovery() { if (this.state.intent && !this.busy) this.update({ open: true, view: 'review', date: this.state.intent.intent.date, draft: this.state.intent.draft }); }
  /** «Vaciar»: the only way to drop a plate on purpose. */
  clear() { if (!this.editable || !this.state.date) return; this.previewGeneration++; this.update({ draft: plateDraft(this.state.date), view: 'pick', preview: null, previewLoading: false, message: null, errors: {} }); }
  showPicker() { if (this.state.open && !this.state.intent) this.update({ view: 'pick' }); }
  showReview() { if (this.state.open && this.state.draft?.items.length) this.update({ view: 'review' }); }
  query(search: string) { this.update({ search: search.slice(0, 200) }); }

  async loadFoods() {
    if (this.disposed) return;
    const generation = ++this.foodsGeneration;
    this.update({ foodsLoading: true, foodsError: false });
    try {
      const result = await this.api.foods();
      if (this.disposed || generation !== this.foodsGeneration) return;
      if (result.status !== 'ok') { this.update({ foodsLoading: false, foodsError: true }); return; }
      this.update({ foods: result.data.foods.filter(food => food.isActive), foodsLoading: false, foodsError: false });
    } catch { if (generation === this.foodsGeneration) this.update({ foodsLoading: false, foodsError: true }); }
  }

  private edit(next: PlateDraft, patch: Partial<PlateState> = {}) {
    this.previewGeneration++;
    this.update({ draft: next, preview: null, previewLoading: false, errors: {}, message: null, ...patch });
  }
  add(food: PersonalFood) { const d = this.state.draft; if (d && this.editable && plateable(food)) this.edit(withFood(d, food)); }
  remove(foodId: string) {
    const d = this.state.draft;
    if (!d || !this.editable) return;
    const items = d.items.filter(item => item.food.id !== foodId);
    this.edit({ ...d, items }, items.length ? {} : { view: 'pick' });
  }
  change(foodId: string, value: string) {
    const d = this.state.draft;
    if (d && this.editable && d.items.some(item => item.food.id === foodId)) this.edit({ ...d, items: d.items.map(item => item.food.id === foodId ? { ...item, quantity: value } : item) });
  }
  step(foodId: string, delta: number) { const d = this.state.draft; if (d && this.editable) this.edit(stepped(d, foodId, delta)); }
  rename(title: string) { const d = this.state.draft; if (d && this.editable) this.edit({ ...d, title: title.slice(0, PLATE_TITLE_MAX + 20) }); }
  saveToLibrary(value: boolean) { const d = this.state.draft; if (d && this.editable) this.edit({ ...d, saveToLibrary: value }); }
  timing(mealLabel: PlateDraft['mealLabel'], consumedAt?: string, declared = false) {
    const d = this.state.draft;
    if (d && this.editable) this.edit({ ...d, mealLabel, ...(consumedAt ? { consumedAt } : {}), ...(declared ? { consumedAtSource: 'user_declared' as const } : {}) });
  }
  changeDate(date: string) { const d = this.state.draft; if (d && this.editable) this.edit(this.moved(d, date), { date }); }
  /** Same wall-clock time on the new day (Córdoba, −03:00), like Rápido. */
  private moved(d: PlateDraft, date: string): PlateDraft {
    if (d.date === date) return d;
    return { ...d, date, ...(d.consumedAt ? { consumedAt: `${date}T${new Date(Date.parse(d.consumedAt) - 10800000).toISOString().slice(11, 16)}:00-03:00` } : {}) };
  }

  async requestPreview() {
    const d = this.state.draft;
    if (this.disposed || !d || !this.editable) return;
    const { selection, errors } = selectionFromPlate(d);
    if (!selection) { this.update({ errors, preview: null }); return; }
    const generation = ++this.previewGeneration;
    this.update({ previewLoading: true, preview: null, errors: {}, message: null });
    try {
      const result = await this.api.preview(selection);
      if (this.disposed || generation !== this.previewGeneration || !this.state.open) return;
      if (result.status === 'ok' && sameQuickSelection(selection, result.data.selection)) this.update({ preview: result.data, previewLoading: false });
      else if (result.status === 'conflict') { this.update({ previewLoading: false }); await this.reconcile(result.code, result.message); }
      else this.update({ previewLoading: false, message: result.status === 'validation' ? result.message : 'No pudimos calcular el total. Tu plato sigue intacto.' });
    } catch { if (generation === this.previewGeneration) this.update({ previewLoading: false, message: 'No pudimos calcular el total. Tu plato sigue intacto.' }); }
  }
  /**
   * A food changed or is gone since it was added: read the foods again and bring the plate up to them. A changed food keeps
   * the quantity (its new values recompute the total on the next preview); a food no longer usable leaves, and says so.
   */
  private async reconcile(code: string, message: string) {
    if (code === 'SAVED_NAME_EXISTS') { this.update({ message: SAVED_NAME, errors: { title: 'Ese nombre ya está en tus comidas.' } }); return; }
    await this.loadFoods();
    const d = this.state.draft, foods = this.state.foods;
    if (!d || !foods || this.state.foodsError) { this.update({ message: 'Un alimento cambió y no pudimos leerlo de nuevo. Tu plato sigue intacto.' }); return; }
    const current = new Map(foods.map(food => [food.id, food]));
    const gone = d.items.filter(item => { const food = current.get(item.food.id); return !food || !plateable(food); });
    const items = d.items.filter(item => !gone.includes(item)).map(item => ({ ...item, food: current.get(item.food.id)! }));
    this.edit({ ...d, items }, { view: items.length ? this.state.view : 'pick' });
    this.update({ message: gone.length ? `${gone.map(item => item.food.name).join(', ')} ya no ${gone.length === 1 ? 'está disponible' : 'están disponibles'}: lo sacamos del plato.`
      : code === 'QUICK_SOURCE_CHANGED' ? 'Un alimento cambió. Actualizamos el plato con sus valores actuales; revisá el total.'
      : code === 'QUICK_SOURCE_UNUSABLE' ? 'Así el plato suma 0 kcal y no se puede registrar. Sumá algo con calorías.' : message });
  }

  async save() {
    const { draft, preview } = this.state;
    if (this.disposed || !draft || !preview || !this.editable) return;
    const selection = selectionFromPlate(draft).selection;
    if (!selection || !sameQuickSelection(preview.selection, selection)) return;
    const stored: StoredPlateIntent = { version: 1, intent: { ...selection, operation: 'register', idempotencyKey: this.newKey() }, draft };
    this.busy = true; this.previewGeneration++; this.update({ phase: 'pending', message: null });
    try { await this.repository.write(stored); this.update({ intent: stored }); await this.send(stored); }
    catch { this.update({ phase: 'blocked', message: 'No pudimos conservar el plato antes de enviarlo. Comprobá el almacenamiento.' }); }
    finally { this.busy = false; }
  }
  async recover() {
    if (this.disposed || this.busy) return;
    if (!this.state.intent) { await this.initialize(); return; }
    this.busy = true; const stored = this.state.intent; this.update({ phase: 'pending', message: null });
    try { if (stored.receipt) await this.confirmed(stored); else await this.send(stored); }
    catch { this.update({ phase: 'uncertain', message: 'El plato sigue guardado. No pudimos comprobar su resultado.' }); }
    finally { this.busy = false; }
  }
  private async send(stored: StoredPlateIntent) {
    if (this.disposed) return;
    let result: MobileApiRequestResult<QuickResponse>;
    try { result = await this.api.confirm(stored.intent); }
    catch { this.update({ phase: 'uncertain', message: 'No sabemos si se registró. Comprobar usa exactamente el mismo intento.' }); return; }
    if (result.status === 'ok' && !('error' in result.data)) {
      const confirmed = { ...stored, receipt: result.data };
      this.update({ intent: confirmed, phase: 'confirmed' });
      await this.repository.write(confirmed); await this.confirmed(confirmed); return;
    }
    const conflict = result.status === 'conflict' ? { code: result.code, message: result.message }
      : result.status === 'ok' && 'error' in result.data ? { code: result.data.error, message: result.data.message } : null;
    if (conflict || result.status === 'validation' || result.status === 'not_found') {
      // A definite refusal: nothing was written, the plate stays to fix and send again.
      await this.repository.clear(stored.intent.idempotencyKey);
      this.update({ intent: null, phase: 'idle', preview: null, view: 'review', draft: stored.draft });
      if (conflict) await this.reconcile(conflict.code, conflict.message);
      else this.update({ message: 'message' in result ? result.message : 'Revisá el plato.' });
      return;
    }
    this.update({ phase: 'uncertain', message: 'El resultado es incierto. Conservamos el plato; comprobalo explícitamente.' });
  }
  private async confirmed(stored: StoredPlateIntent) {
    const receipt = stored.receipt!; this.invalidate();
    const result = await this.api.read(receipt.date);
    if (this.disposed) return;
    if (result.status !== 'ok' || result.data.date !== receipt.date || result.data.nutrition.status !== 'ok') {
      this.update({ phase: 'confirmed', message: 'El plato está registrado. Falta actualizar el día; no vuelvas a registrarlo.' }); return;
    }
    let registered = result.data.nutrition.data.meals.find(meal => meal.id === receipt.resourceId);
    // The version created by THIS write: «Deshacer» must conflict if someone edited it since.
    if (registered) registered = { ...registered, updatedAt: receipt.updatedAt };
    await this.repository.clear(stored.intent.idempotencyKey);
    this.update({ phase: 'idle', intent: null, open: false, draft: null, view: 'pick', preview: null, message: null, errors: {}, search: '' });
    if (registered) this.confirmedListeners.forEach(f => f(registered!, receipt.date));
  }
}
