import type { MobileApiReadResult, MobileApiRequestResult } from '@/api/results';
import type {
  MetricDefinition, MetricDefinitionIntent, MetricDefinitionOperation, MetricDefinitionReceipt, MetricDefinitionsResponse,
  MetricOrderIntent, MetricOrderReceipt,
} from '@/api/metric-definitions';
import { activeDefinitions, definitionDraft, draftDirty, moveId, validateDefinitionDraft, type DefinitionDraft } from './definitions-model';
import type { DefinitionEditor, DefinitionIntentRepository, StoredDefinitionIntent } from './definitions-storage';

export type DefinitionsApi = {
  read: () => Promise<MobileApiReadResult<MetricDefinitionsResponse>>;
  mutate: (intent: MetricDefinitionIntent) => Promise<MobileApiRequestResult<MetricDefinitionReceipt>>;
  reorder: (intent: MetricOrderIntent) => Promise<MobileApiRequestResult<MetricOrderReceipt>>;
};
export type DefinitionsRead = { status: 'loading' | 'ready' | 'unavailable'; definitions: MetricDefinition[] | null; refreshing: boolean; stale: boolean };
export type DefinitionsState = {
  read: DefinitionsRead;
  phase: 'loading' | 'idle' | 'pending' | 'uncertain' | 'confirmed' | 'conflict' | 'blocked';
  editor: DefinitionEditor | null; intent: StoredDefinitionIntent | null; message: string | null; errors: Record<string, string>; notice: string | null;
};
const unavailable = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } };

export class DefinitionsController {
  private state: DefinitionsState = { read: { status: 'loading', definitions: null, refreshing: false, stale: false }, phase: 'loading',
    editor: null, intent: null, message: null, errors: {}, notice: null };
  private busy = false; private disposed = false; private generation = 0; private listeners = new Set<() => void>();
  constructor(private api: DefinitionsApi, private repository: DefinitionIntentRepository, private onChanged: () => void = () => undefined,
    private key: () => string = () => `metric:${Date.now()}:${Math.random().toString(36).slice(2)}`) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<DefinitionsState>) { if (!this.disposed) { this.state = { ...this.state, ...patch }; this.listeners.forEach(f => f()); } }
  dispose() { this.disposed = true; this.generation++; this.listeners.clear(); }

  async initialize() {
    try {
      const stored = await this.repository.read();
      this.update(stored ? { phase: stored.receipt ? 'confirmed' : 'uncertain', intent: stored, editor: stored.kind === 'definition' ? stored.editor : null,
        message: stored.receipt ? 'El cambio está confirmado. Falta mostrar tus métricas actualizadas.' : 'Hay un cambio sin resultado confirmado. Comprobalo antes de hacer otro.' }
        : { phase: 'idle' });
    } catch { this.update({ phase: 'blocked', message: 'No pudimos leer el cambio guardado en el teléfono. Revisá el almacenamiento antes de continuar.' }); }
    await this.load();
  }

  /** Server truth. A newer load or write invalidates older responses; never fabricates an empty list. */
  async load(): Promise<boolean> {
    const generation = ++this.generation;
    this.update({ read: { ...this.state.read, ...(this.state.read.definitions ? { refreshing: true } : { status: 'loading' as const }) } });
    let result: MobileApiReadResult<MetricDefinitionsResponse>;
    try { result = await this.api.read(); } catch { result = unavailable; }
    if (this.disposed || generation !== this.generation) return false;
    if (result.status === 'ok') { this.update({ read: { status: 'ready', definitions: result.data.definitions, refreshing: false, stale: false } }); return true; }
    this.update({ read: this.state.read.definitions ? { ...this.state.read, refreshing: false, stale: true } : { status: 'unavailable', definitions: null, refreshing: false, stale: false } });
    return false;
  }

  private canEdit() { return !this.busy && !this.state.intent && this.state.phase === 'idle' && this.state.read.status === 'ready' && !!this.state.read.definitions; }
  openCreate() {
    if (!this.canEdit() || this.state.editor) return;
    this.update({ editor: { mode: 'create', baseline: null, draft: definitionDraft(null) }, errors: {}, message: null, notice: null });
  }
  openEdit(definition: MetricDefinition) {
    if (!this.canEdit() || this.state.editor) return;
    this.update({ editor: { mode: 'edit', baseline: definition, draft: definitionDraft(definition) }, errors: {}, message: null, notice: null });
  }
  change<K extends keyof DefinitionDraft>(key: K, value: DefinitionDraft[K]) {
    const editor = this.state.editor;
    if (this.busy || this.state.intent || this.state.phase !== 'idle' || !editor) return;
    const b = editor.baseline;
    // Never offer what the server would reject: system identity and frozen meaning stay as they are.
    if (key === 'name' && b && !b.actions.editName) return;
    if ((key === 'valueType' || key === 'unit') && b && !b.actions.editMeaning) return;
    this.update({ editor: { ...editor, draft: { ...editor.draft, [key]: value } }, errors: {}, message: null });
  }
  dirty() { const e = this.state.editor; return !!e && draftDirty(e.draft, e.baseline); }
  close() {
    if (this.busy || this.state.intent) return;
    this.update({ editor: null, phase: this.state.phase === 'blocked' ? 'blocked' : 'idle', errors: {}, message: null });
  }

  async save() {
    const editor = this.state.editor;
    if (!this.canEdit() || !editor) return;
    const parsed = validateDefinitionDraft(editor.draft, editor.baseline);
    if ('errors' in parsed) { this.update({ errors: parsed.errors }); return; }
    const b = editor.baseline;
    await this.submit({ version: 1, kind: 'definition', editor, intent: b
      ? { operation: 'update', metricId: b.id, expectedUpdatedAt: b.updatedAt, fields: parsed.fields, idempotencyKey: this.key() }
      : { operation: 'create', metricId: null, expectedUpdatedAt: null, fields: parsed.fields, idempotencyKey: this.key() } });
  }
  archive() { return this.transition(op => op.archive, 'archive'); }
  restore() { return this.transition(op => op.restore, 'restore'); }
  remove() { return this.transition(op => op.delete, 'delete'); }
  private async transition(allowed: (a: MetricDefinition['actions']) => boolean, operation: Exclude<MetricDefinitionOperation, 'create' | 'update'>) {
    const editor = this.state.editor, b = editor?.baseline;
    if (!this.canEdit() || !editor || !b || !allowed(b.actions)) return;
    await this.submit({ version: 1, kind: 'definition', editor,
      intent: { operation, metricId: b.id, expectedUpdatedAt: b.updatedAt, fields: null, idempotencyKey: this.key() } });
  }
  /** One move = one full-list reorder, with the order the user saw as CAS. */
  async move(id: string, direction: -1 | 1) {
    const definitions = this.state.read.definitions;
    if (!this.canEdit() || this.state.editor || !definitions) return;
    const expected = activeDefinitions(definitions).map(d => d.id);
    const metricIds = moveId(expected, id, direction);
    if (!metricIds) return;
    await this.reorder(metricIds,expected);
  }
  /** The full order captured on lift is the CAS, not a later background read. One request on drop. */
  async reorder(metricIds:string[],expectedMetricIds:string[]) {
    if(!this.canEdit()||this.state.editor||metricIds.join()===expectedMetricIds.join())return;
    if(metricIds.length!==expectedMetricIds.length||new Set(metricIds).size!==metricIds.length||[...metricIds].sort().join()!==[...expectedMetricIds].sort().join())return;
    const all=this.state.read.definitions!;
    this.generation++;
    this.update({read:{...this.state.read,definitions:[...metricIds.map((id,i)=>({...all.find(d=>d.id===id)!,sortOrder:i})),...all.filter(d=>!d.isActive)],refreshing:false}});
    await this.submit({version:1,kind:'order',intent:{operation:'reorder',metricIds,expectedMetricIds,idempotencyKey:this.key()}});
  }

  private async submit(stored: StoredDefinitionIntent) {
    if (this.disposed || this.busy) return;
    this.busy = true; this.update({ phase: 'pending', message: null, errors: {}, notice: null });
    try {
      // Durable BEFORE the request: a lost response is recovered with this same key.
      await this.repository.write(stored);
      this.update({ intent: stored });
      await this.send(stored);
    } catch { this.update({ phase: this.state.intent?.receipt?'confirmed':this.state.intent?'uncertain':'blocked', message: this.state.intent?.receipt?'Se guardó. Falta actualizar tus métricas.':this.state.intent?'Tu cambio sigue acá. Comprobá si se guardó.':'No pudimos conservar el cambio en este teléfono.' }); }
    finally { this.busy = false; }
  }
  async recover() {
    if (this.busy || this.disposed) return;
    const stored = this.state.intent;
    if (!stored) { await this.initialize(); return; }
    this.busy = true; this.update({ phase: 'pending', message: null });
    try { if (stored.receipt) await this.confirmed(stored); else await this.send(stored); }
    catch { this.update({ phase: 'uncertain', message: 'Conservamos el cambio. No pudimos comprobar su resultado.' }); }
    finally { this.busy = false; }
  }
  private async send(stored: StoredDefinitionIntent) {
    let result: MobileApiRequestResult<MetricDefinitionReceipt> | MobileApiRequestResult<MetricOrderReceipt>;
    try { result = stored.kind === 'order' ? await this.api.reorder(stored.intent) : await this.api.mutate(stored.intent); }
    catch { this.update({ phase: 'uncertain', message: 'No sabemos si se guardó. Comprobar reenvía el mismo cambio, sin duplicarlo.' }); return; }
    if (result.status === 'ok') {
      const confirmed = { ...stored, receipt: result.data } as StoredDefinitionIntent;
      this.update({ phase: 'confirmed', intent: confirmed });
      await this.repository.write(confirmed);
      await this.confirmed(confirmed);
      return;
    }
    if (result.status === 'conflict' || result.status === 'validation' || result.status === 'not_found') {
      // Definitive outcome: nothing was applied. Keep the draft; refresh server truth.
      await this.repository.clear(stored.intent.idempotencyKey);
      const keepsDraft = stored.kind === 'definition' && !!this.state.editor && result.status !== 'validation';
      this.update({ intent: null, phase: keepsDraft ? 'conflict' : 'idle', message: result.message });
      await this.load();
      return;
    }
    this.update({ phase: 'uncertain', message: 'El resultado es incierto. Conservamos el cambio para comprobarlo cuando quieras.' });
  }
  private async confirmed(stored: StoredDefinitionIntent) {
    const fresh = await this.load();
    if (this.disposed) return;
    if (!fresh) { this.update({ phase: 'confirmed', message: 'Se guardó. Falta mostrar tus métricas actualizadas.' }); return; }
    await this.repository.clear(stored.intent.idempotencyKey);
    this.update({ phase: 'idle', intent: null, editor: null, errors: {}, message: null, notice: successNotice(stored) });
    this.onChanged();
  }
  /** After a conflict the draft stays; the user rebases it on server truth explicitly. */
  reviewTruth() {
    const editor = this.state.editor, definitions = this.state.read.definitions;
    if (this.busy || this.state.phase !== 'conflict' || !editor || !definitions) return;
    if (!editor.baseline) { this.update({ phase: 'idle', message: 'Revisá lo que escribiste antes de guardar.' }); return; }
    const current = definitions.find(d => d.id === editor.baseline!.id);
    if (!current) { this.update({ phase: 'idle', editor: null, message: null, notice: 'Esa métrica ya no existe.' }); return; }
    const draft = { ...editor.draft };
    // What can no longer change follows server truth; the rest of the draft is kept.
    if (!current.actions.editName) draft.name = current.name;
    if (!current.actions.editMeaning) { const truth = definitionDraft(current); draft.valueType = truth.valueType; draft.unit = truth.unit; }
    this.update({ phase: 'idle', editor: { mode: 'edit', baseline: current, draft },
      message: 'Actualizamos la métrica con los datos actuales. Revisá lo que escribiste antes de guardar.' });
  }
  dismissNotice() { this.update({ notice: null }); }
}

function successNotice(stored: StoredDefinitionIntent): string {
  if (stored.kind === 'order') return 'Orden actualizado.';
  return { create: 'Métrica creada.', update: 'Métrica guardada.', archive: 'Métrica archivada. Su historial se conserva.',
    restore: 'Métrica restaurada. Vuelve a estar activa.', delete: 'Métrica eliminada.' }[stored.intent.operation];
}
