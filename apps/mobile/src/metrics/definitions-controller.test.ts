import { describe, expect, it, jest } from '@jest/globals';
import { parseMetricDefinitions, type MetricDefinitionReceipt } from '@/api/metric-definitions';
import type { NutritionStoragePort } from '@/nutrition/intent-repository';
import { DefinitionsController, type DefinitionsApi } from './definitions-controller';
import { validateDefinitionDraft, definitionDraft } from './definitions-model';
import { DefinitionIntentRepository } from './definitions-storage';
import { DEF_TS, defId, definition, fixtureDefinitions } from './definitions-fixture.test-helper';

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };
function setup(definitions = fixtureDefinitions()) {
  const map = new Map<string, string>();
  const port: NutritionStoragePort = { getItem: async k => map.get(k) ?? null, setItem: async (k, v) => { map.set(k, v); }, removeItem: async k => { map.delete(k); } };
  const api = {
    read: jest.fn<DefinitionsApi['read']>().mockImplementation(async () => ({ status: 'ok', data: { definitions }, meta })),
    mutate: jest.fn<DefinitionsApi['mutate']>().mockImplementation(async intent => {
      const base = definitions.find(d => d.id === intent.metricId) ?? definition({ id: defId(99) });
      const receipt: MetricDefinitionReceipt = { status: 'confirmed', operation: intent.operation, metricId: base.id,
        definition: intent.operation === 'delete' ? null : base };
      return { status: 'ok', data: receipt, meta };
    }),
    reorder: jest.fn<DefinitionsApi['reorder']>().mockImplementation(async intent => ({ status: 'ok', data: { status: 'confirmed', operation: 'reorder', metricIds: intent.metricIds }, meta })),
  };
  let n = 0;
  const changed = jest.fn();
  const repository = new DefinitionIntentRepository(port, 'owner');
  const controller = new DefinitionsController(api, repository, changed, () => `metric:${++n}`);
  return { map, api, controller, changed, repository, port };
}
const find = (c: DefinitionsController, id: string) => c.getSnapshot().read.definitions!.find(d => d.id === id)!;

describe('Metric definitions controller', () => {
  it('system presentation fields remain editable with history, and unknown icon keys fall back safely',async()=>{
    const s=setup();await s.controller.initialize();s.controller.openEdit(find(s.controller,defId(2)));
    s.controller.change('icon','book');s.controller.change('quickValue','0,25');await s.controller.save();
    expect(s.api.mutate.mock.calls[0][0]).toMatchObject({fields:{name:'Agua',valueType:'decimal',unit:'L',icon:'book',quickValue:0.25}});
  });
  it('drop keeps the optimistic order while saving; a conflict restores the server order and never resubmits',async()=>{
    const s=setup();await s.controller.initialize();
    const expected=s.controller.getSnapshot().read.definitions!.filter(d=>d.isActive).map(d=>d.id),ids=[...expected].reverse();
    let release!:(r:Awaited<ReturnType<DefinitionsApi['reorder']>>)=>void;
    s.api.reorder.mockImplementationOnce(()=>new Promise(r=>{release=r;}));
    const pending=s.controller.reorder(ids,expected);
    for(let i=0;i<30&&!release;i++)await Promise.resolve();
    expect(s.controller.getSnapshot().read.definitions!.filter(d=>d.isActive).map(d=>d.id)).toEqual(ids);
    expect(s.controller.getSnapshot().phase).toBe('pending');
    release({status:'conflict',code:'METRIC_ORDER_CHANGED',message:'El orden cambió en otro lado.',meta});await pending;
    expect(s.controller.getSnapshot().read.definitions!.filter(d=>d.isActive).map(d=>d.id)).toEqual(expected);
    expect(s.api.reorder).toHaveBeenCalledTimes(1);expect(s.controller.getSnapshot().message).toBe('El orden cambió en otro lado.');
  });
  it('parses the server list (active first) and separates archived definitions', async () => {
    expect(parseMetricDefinitions({ definitions: fixtureDefinitions() })).toBeDefined();
    expect(parseMetricDefinitions({ definitions: [...fixtureDefinitions()].reverse() })).toBeUndefined();
    const s = setup(); await s.controller.initialize();
    const defs = s.controller.getSnapshot().read.definitions!;
    expect(defs.filter(d => d.isActive).map(d => d.name)).toEqual(['Pasos', 'Agua', 'Sueño', 'Lectura', 'Correr']);
    expect(defs.filter(d => !d.isActive).map(d => d.name)).toEqual(['Mate']);
  });
  it('create persists the intent BEFORE sending, confirms, re-reads and notifies the shared surfaces', async () => {
    const s = setup(); await s.controller.initialize();
    s.controller.openCreate();
    s.controller.change('name', '  Meditación '); s.controller.change('valueType', 'duration'); s.controller.change('hours', '0'); s.controller.change('minutes', '20');
    let persisted: string | undefined;
    s.api.mutate.mockImplementationOnce(async intent => {
      persisted = s.map.get('ownlevel.metrics.definitions.intent.v1.owner');
      return { status: 'ok', data: { status: 'confirmed', operation: 'create', metricId: defId(99), definition: definition({ id: defId(99), name: 'Meditación', valueType: 'duration', unit: 'min', target: intent.fields!.target }) }, meta };
    });
    await s.controller.save();
    expect(JSON.parse(persisted!).intent).toEqual({ operation: 'create', metricId: null, expectedUpdatedAt: null,
      fields: { name: 'Meditación', valueType: 'duration', unit: 'min', target: 20,icon:null,quickValue:null }, idempotencyKey: 'metric:1' });
    expect(s.controller.getSnapshot()).toMatchObject({ phase: 'idle', editor: null, intent: null, notice: 'Métrica creada.' });
    expect(s.api.read).toHaveBeenCalledTimes(2); expect(s.changed).toHaveBeenCalledTimes(1); expect(s.map.size).toBe(0);
  });
  it('a lost response is uncertain; recovery replays the SAME intent once and never auto-retries', async () => {
    const s = setup(); await s.controller.initialize();
    s.api.mutate.mockResolvedValueOnce(lost);
    s.controller.openCreate(); s.controller.change('name', 'Agua con gas'); s.controller.change('valueType', 'decimal');
    await s.controller.save(); await s.controller.save();
    expect(s.api.mutate).toHaveBeenCalledTimes(1);
    expect(s.controller.getSnapshot().phase).toBe('uncertain');
    // A new controller (app restart) adopts the persisted intent before anything else.
    const again = new DefinitionsController(s.api, new DefinitionIntentRepository(s.port, 'owner'), jest.fn(), () => 'metric:other');
    await again.initialize();
    expect(again.getSnapshot()).toMatchObject({ phase: 'uncertain', editor: { draft: { name: 'Agua con gas' } } });
    again.openCreate(); expect(again.getSnapshot().editor?.mode).toBe('create');
    await again.recover();
    expect(s.api.mutate).toHaveBeenCalledTimes(2); expect(s.api.mutate.mock.calls[1][0]).toEqual(s.api.mutate.mock.calls[0][0]);
    expect(again.getSnapshot()).toMatchObject({ phase: 'idle', intent: null });
  });
  it('system definitions: only the target is editable; identity changes are ignored and never sent', async () => {
    const s = setup(); await s.controller.initialize();
    s.controller.openEdit(find(s.controller, defId(1)));
    s.controller.change('name', 'Caminata'); s.controller.change('valueType', 'decimal'); s.controller.change('unit', 'km'); s.controller.change('target', '12.000');
    expect(s.controller.getSnapshot().errors.target).toBeUndefined();
    await s.controller.save();
    expect(s.controller.getSnapshot().errors.target).toBe('El objetivo debe ser un número entero.');
    s.controller.change('target', '12000');
    await s.controller.save();
    expect(s.api.mutate.mock.calls[0][0]).toMatchObject({ operation: 'update', metricId: defId(1), expectedUpdatedAt: DEF_TS,
      fields: { name: 'Pasos', valueType: 'integer', unit: 'pasos', target: 12000 } });
    s.controller.openEdit(find(s.controller, defId(1)));
    void s.controller.remove();
    expect(s.api.mutate).toHaveBeenCalledTimes(1);
  });
  it('custom with history keeps type/unit but name and target change; without history everything changes; empty target is "no target"', async () => {
    const s = setup(); await s.controller.initialize();
    s.controller.openEdit(find(s.controller, defId(11)));
    s.controller.change('valueType', 'integer'); s.controller.change('unit', 'm');
    s.controller.change('name', 'Trote'); s.controller.change('target', '5,5');
    await s.controller.save();
    expect(s.api.mutate.mock.calls[0][0].fields).toEqual({ name: 'Trote', valueType: 'decimal', unit: 'km', target: 5.5,icon:null,quickValue:null });
    s.controller.openEdit(find(s.controller, defId(10)));
    s.controller.change('valueType', 'decimal'); s.controller.change('unit', ' '); s.controller.change('target', '');
    await s.controller.save();
    expect(s.api.mutate.mock.calls[1][0].fields).toEqual({ name: 'Lectura', valueType: 'decimal', unit: null, target: null,icon:null,quickValue:null });
    expect(validateDefinitionDraft({ ...definitionDraft(null), name: ' ' }, null)).toEqual({ errors: { name: 'El nombre es obligatorio.' } });
  });
  it('archive / restore / delete only when the domain allows it; archive keeps history', async () => {
    const s = setup(); await s.controller.initialize();
    s.controller.openEdit(find(s.controller, defId(11)));
    await s.controller.remove();
    expect(s.api.mutate).not.toHaveBeenCalled();
    await s.controller.archive();
    expect(s.api.mutate.mock.calls[0][0]).toEqual({ operation: 'archive', metricId: defId(11), expectedUpdatedAt: DEF_TS, fields: null, idempotencyKey: 'metric:1' });
    expect(s.controller.getSnapshot().notice).toBe('Métrica archivada. Su historial se conserva.');
    s.controller.openEdit(find(s.controller, defId(12)));
    await s.controller.archive(); expect(s.api.mutate).toHaveBeenCalledTimes(1);
    await s.controller.restore();
    expect(s.api.mutate.mock.calls[1][0]).toMatchObject({ operation: 'restore', metricId: defId(12) });
    s.controller.openEdit(find(s.controller, defId(10)));
    await s.controller.remove();
    expect(s.api.mutate.mock.calls[2][0]).toMatchObject({ operation: 'delete', metricId: defId(10), fields: null });
    expect(s.controller.getSnapshot().notice).toBe('Métrica eliminada.');
  });
  it('a conflict keeps the draft, reads server truth and rebases explicitly; a raced history blocks delete with the right message', async () => {
    const s = setup(); await s.controller.initialize();
    s.controller.openEdit(find(s.controller, defId(10)));
    s.controller.change('target', '30');
    const webChanged = fixtureDefinitions().map(d => d.id === defId(10) ? definition({ id: defId(10), sortOrder: 3, target: 25, updatedAt: '2026-10-04T13:00:00.5+00:00' }) : d);
    s.api.read.mockResolvedValue({ status: 'ok', data: { definitions: webChanged }, meta });
    s.api.mutate.mockResolvedValueOnce({ status: 'conflict', code: 'METRIC_CHANGED', message: 'La métrica cambió desde que la abriste. Conservamos tu borrador para revisar.', meta });
    await s.controller.save();
    expect(s.controller.getSnapshot()).toMatchObject({ phase: 'conflict', intent: null, editor: { draft: { target: '30' } } });
    expect(find(s.controller, defId(10)).target).toBe(25);
    s.controller.reviewTruth();
    expect(s.controller.getSnapshot()).toMatchObject({ phase: 'idle', editor: { baseline: { target: 25, updatedAt: '2026-10-04T13:00:00.5+00:00' }, draft: { target: '30' } } });
    await s.controller.save();
    expect(s.api.mutate.mock.calls[1][0]).toMatchObject({ expectedUpdatedAt: '2026-10-04T13:00:00.5+00:00', fields: { target: 30 } });
    // Delete raced by a first value from Web: server says archive-only; draft view refreshes with hasHistory.
    const raced = webChanged.map(d => d.id === defId(10) ? definition({ id: defId(10), sortOrder: 3, hasHistory: true }) : d);
    s.api.read.mockResolvedValue({ status: 'ok', data: { definitions: raced }, meta });
    s.controller.openEdit(definition({ id: defId(10), sortOrder: 3 }));
    s.api.mutate.mockResolvedValueOnce({ status: 'conflict', code: 'METRIC_HAS_HISTORY', message: 'Esta métrica tiene historial y sólo puede archivarse.', meta });
    await s.controller.remove();
    expect(s.controller.getSnapshot()).toMatchObject({ phase: 'conflict', message: 'Esta métrica tiene historial y sólo puede archivarse.' });
    s.controller.reviewTruth();
    expect(s.controller.getSnapshot().editor?.baseline?.actions).toMatchObject({ delete: false, archive: true });
  });
  it('reorder sends the full active list with the order the user saw; a changed list is a conflict that re-reads', async () => {
    const s = setup(); await s.controller.initialize();
    await s.controller.move(defId(10), -1);
    expect(s.api.reorder.mock.calls[0][0]).toEqual({ operation: 'reorder', idempotencyKey: 'metric:1',
      expectedMetricIds: [defId(1), defId(2), defId(3), defId(10), defId(11)], metricIds: [defId(1), defId(2), defId(10), defId(3), defId(11)] });
    expect(s.controller.getSnapshot().notice).toBe('Orden actualizado.');
    await s.controller.move(defId(1), -1); expect(s.api.reorder).toHaveBeenCalledTimes(1);
    s.api.reorder.mockResolvedValueOnce({ status: 'conflict', code: 'METRIC_ORDER_CHANGED', message: 'Las métricas activas cambiaron desde que abriste la lista. No aplicamos el orden.', meta });
    await s.controller.move(defId(11), -1);
    expect(s.controller.getSnapshot()).toMatchObject({ phase: 'idle', intent: null, message: 'Las métricas activas cambiaron desde que abriste la lista. No aplicamos el orden.' });
    expect(s.api.read).toHaveBeenCalledTimes(3);
  });
  it('stale reads never overwrite a newer one, and an unavailable refresh keeps the last confirmed list (no false empty)', async () => {
    const s = setup(); await s.controller.initialize();
    let release!: (v: Awaited<ReturnType<DefinitionsApi['read']>>) => void;
    s.api.read.mockImplementationOnce(() => new Promise(r => { release = r; }));
    const slow = s.controller.load();
    s.api.read.mockResolvedValueOnce({ status: 'ok', data: { definitions: fixtureDefinitions().slice(0, 2) }, meta });
    await s.controller.load();
    release({ status: 'ok', data: { definitions: [] }, meta }); await slow;
    expect(s.controller.getSnapshot().read.definitions).toHaveLength(2);
    s.api.read.mockResolvedValueOnce(lost);
    await s.controller.load();
    expect(s.controller.getSnapshot().read).toMatchObject({ status: 'ready', stale: true });
    expect(s.controller.getSnapshot().read.definitions).toHaveLength(2);
  });
  it('blocked storage sends nothing', async () => {
    const s = setup(); await s.controller.initialize();
    jest.spyOn(s.repository, 'write').mockRejectedValueOnce(new Error('disk'));
    s.controller.openCreate(); s.controller.change('name', 'X');
    await s.controller.save();
    expect(s.api.mutate).not.toHaveBeenCalled();
    expect(s.controller.getSnapshot().phase).toBe('blocked');
  });
});
