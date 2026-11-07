import { describe, expect, it, jest } from '@jest/globals';
import type { BodyWeightReceipt } from '@/api/body';
import { BodyController } from './body-controller';
import { MID, TODAY, conflict, fakeApi, lost, measurement, memoryStorage, meta, ok, overview, repository } from './body-fixture.test-helper';

const receipt = (patch: Partial<BodyWeightReceipt> = {}): BodyWeightReceipt => ({ status: 'confirmed', operation: 'set', date: TODAY, weightKg: 79.5,
  current: { date: TODAY, weightKg: 79.5 }, profileWeightKg: 79.5, currentWeightChanged: true, ...patch });
async function setup(api = fakeApi(), storage = memoryStorage()) {
  let n = 0;
  const controller = new BodyController(api, repository(storage.port), () => `body:${++n}`);
  await controller.initialize();
  return { controller, api, storage };
}

describe('Body controller — weight', () => {
  it.each(['receipt', 'cleanup'])('keeps a confirmed write recoverable when local %s fails', async stage => {
    const { controller, api, storage } = await setup(fakeApi(overview({}, [])));
    const write = storage.port.setItem;
    if (stage === 'receipt') jest.spyOn(storage.port, 'setItem').mockImplementationOnce(write).mockRejectedValueOnce(new Error('disk')).mockImplementation(write);
    else jest.spyOn(storage.port, 'removeItem').mockRejectedValueOnce(new Error('disk'));
    api.weight.mockResolvedValue(ok(receipt()));
    controller.openWeight(); controller.change('weight', '79,5');
    await controller.saveWeight();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'blocked', intent: { receipt: receipt() } });
    expect(controller.getSnapshot().message).toContain('confirmado');
    await controller.recover();
    expect(api.weight).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', intent: null });
  });
  it('records a new weight with "expected none", persisting the intent before sending', async () => {
    const { controller, api, storage } = await setup(fakeApi(overview({}, [{ date: '2026-10-02', weightKg: 81 }])));
    api.weight.mockImplementation(async () => { expect([...storage.store.values()][0]).toContain('"expectedWeightKg":null'); return ok(receipt()); });
    controller.openWeight(); controller.change('weight', '79,5');
    await controller.saveWeight();
    expect(api.weight).toHaveBeenCalledWith({ operation: 'set', date: TODAY, expectedWeightKg: null, weightKg: 79.5, idempotencyKey: 'body:1' });
    expect(api.overview).toHaveBeenCalledTimes(2); expect(storage.store.size).toBe(0);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', editor: null, intent: null, notice: 'Peso guardado. Tu peso actual ahora es 79,5 kg.' });
  });
  it('replacing an existing weight on that date is explicit, then sent with that value as CAS', async () => {
    const { controller, api } = await setup();
    api.weight.mockResolvedValue(ok(receipt()));
    controller.openWeight(); controller.change('weight', '79,5');
    await controller.saveWeight();
    expect(api.weight).not.toHaveBeenCalled(); expect(controller.getSnapshot().message).toBe('Ese día ya tiene 80,5 kg. Guardá de nuevo para reemplazarlo.');
    await controller.saveWeight();
    expect(api.weight).toHaveBeenCalledWith(expect.objectContaining({ expectedWeightKg: 80.5, weightKg: 79.5 }));
  });
  it('looks up an older date outside the loaded pages instead of guessing', async () => {
    const data = overview({ weights: { items: [{ date: TODAY, weightKg: 80 }], nextBefore: TODAY } });
    const { controller, api } = await setup(fakeApi(data));
    api.weights.mockResolvedValue(ok({ today: TODAY, items: [{ date: '2026-08-01', weightKg: 77 }], nextBefore: null }));
    api.weight.mockResolvedValue(ok(receipt({ date: '2026-08-01', currentWeightChanged: false })));
    controller.openWeight(); controller.change('date', '01/08/2026'); controller.change('weight', '76');
    await controller.saveWeight();
    expect(api.weights).toHaveBeenCalledWith('2026-08-02'); expect(api.weight).not.toHaveBeenCalled();
    await controller.saveWeight();
    expect(api.weight).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-08-01', expectedWeightKg: 77 }));
    expect(controller.getSnapshot().notice).toBe('Peso guardado.');
  });
  it('CAS conflict keeps the draft, clears the intent, refreshes truth and requires review', async () => {
    const { controller, api, storage } = await setup();
    api.weight.mockResolvedValue(conflict('WEIGHT_CHANGED', 'El peso de esa fecha cambió'));
    controller.openWeight({ date: TODAY, weightKg: 80.5 }); controller.change('weight', '79');
    api.overview.mockResolvedValue(ok(overview({}, [{ date: TODAY, weightKg: 82 }])));
    await controller.saveWeight();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'conflict', intent: null, message: 'El peso de esa fecha cambió', editor: { draft: { weight: '79' }, baseline: 80.5 } });
    expect(storage.store.size).toBe(0);
    controller.change('weight', '1'); expect(controller.getSnapshot().editor).toMatchObject({ draft: { weight: '79' } });
    controller.reviewTruth();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', editor: { baseline: 82, draft: { weight: '79' } } });
    api.weight.mockResolvedValue(ok(receipt()));
    await controller.saveWeight();
    expect(api.weight).toHaveBeenLastCalledWith(expect.objectContaining({ expectedWeightKg: 82, weightKg: 79 }));
  });
  it('a lost response is uncertain: no auto retry; explicit recovery replays the same key once', async () => {
    const { controller, api, storage } = await setup();
    api.weight.mockResolvedValueOnce(lost).mockResolvedValueOnce(ok(receipt({ operation: 'delete', weightKg: null, current: { date: '2026-10-02', weightKg: 81 }, profileWeightKg: 81 })));
    controller.openWeight({ date: TODAY, weightKg: 80.5 });
    await controller.deleteWeight();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'uncertain', editor: { kind: 'weight' } }); expect(api.weight).toHaveBeenCalledTimes(1);
    expect(storage.store.size).toBe(1);
    await controller.recover();
    expect(api.weight).toHaveBeenCalledTimes(2); expect(api.weight.mock.calls[1][0]).toEqual(api.weight.mock.calls[0][0]);
    expect(api.weight.mock.calls[0][0]).toEqual({ operation: 'delete', date: TODAY, expectedWeightKg: 80.5, weightKg: null, idempotencyKey: 'body:1' });
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', notice: 'Peso eliminado. Tu peso actual ahora es 81 kg.' });
  });
  it('double tap sends one request', async () => {
    const { controller, api } = await setup(fakeApi(overview({}, [])));
    let release: (v: ReturnType<typeof ok<BodyWeightReceipt>>) => void = () => undefined;
    api.weight.mockReturnValue(new Promise(r => { release = r; }));
    controller.openWeight(); controller.change('weight', '70');
    const first = controller.saveWeight(); const second = controller.saveWeight();
    await Promise.resolve(); await Promise.resolve();
    release(ok(receipt())); await Promise.all([first, second]);
    expect(api.weight).toHaveBeenCalledTimes(1);
  });
  it('a stored intent survives a restart and is recovered explicitly; a confirmed receipt is never re-sent', async () => {
    const storage = memoryStorage();
    const first = await setup(fakeApi(), storage);
    first.api.weight.mockResolvedValue(ok(receipt()));
    first.controller.openWeight({ date: TODAY, weightKg: 80.5 }); first.controller.change('weight', '79,5');
    first.api.overview.mockResolvedValue(lost);
    await first.controller.saveWeight();
    expect(first.controller.getSnapshot()).toMatchObject({ phase: 'confirmed' }); first.controller.dispose();
    const second = await setup(fakeApi(), storage);
    expect(second.controller.getSnapshot()).toMatchObject({ phase: 'confirmed', editor: { kind: 'weight', draft: { weight: '79,5' } } });
    await second.controller.recover();
    expect(second.api.weight).not.toHaveBeenCalled(); expect(second.controller.getSnapshot()).toMatchObject({ phase: 'idle', intent: null });
  });
  it('validation errors stay local; foreground reloads never destroy an open draft', async () => {
    const { controller, api } = await setup();
    controller.openWeight(); controller.change('date', '05/10/2026'); controller.change('weight', '80');
    await controller.saveWeight();
    expect(controller.getSnapshot().errors).toEqual({ date: 'No se puede registrar en una fecha futura.' }); expect(api.weight).not.toHaveBeenCalled();
    await controller.load();
    expect(controller.getSnapshot().editor).toMatchObject({ draft: { date: '05/10/2026', weight: '80' } });
  });
});

describe('Body controller — measurements and reads', () => {
  it('blocks a known date collision locally and sends update with CAS; a suspect correction verifies it', async () => {
    const suspect = measurement({ id: MID, qualityStatus: 'suspect', qualityNote: 'Revisar', imported: true, importSource: 'sheet', armCm: 33 });
    const other = measurement({ id: '51000000-0000-4000-8000-000000000002', measuredOn: '2026-09-01' });
    const { controller, api } = await setup(fakeApi(overview({ measurements: { items: [suspect, other], nextBefore: null } })));
    controller.openMeasurement(); controller.change('date', '01/09/2026'); controller.change('chestCm', '100');
    await controller.saveMeasurement();
    expect(controller.getSnapshot().errors.date).toMatch(/Ya existe una medición/); expect(api.measurement).not.toHaveBeenCalled();
    controller.close();
    api.measurement.mockResolvedValue(ok({ status: 'confirmed', operation: 'update', measurementId: MID, measurement: { ...suspect, qualityStatus: 'verified', qualityNote: null } }));
    controller.openMeasurement(suspect); controller.change('waistCm', '');
    await controller.saveMeasurement();
    expect(api.measurement).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update', measurementId: MID, expectedUpdatedAt: suspect.updatedAt,
      fields: expect.objectContaining({ waistCm: null }) }));
    expect(controller.getSnapshot().notice).toBe('Medición corregida y verificada.');
  });
  it('a deleted-elsewhere measurement is a definitive outcome; review turns the draft into a new record', async () => {
    const { controller, api } = await setup();
    api.measurement.mockResolvedValue({ status: 'not_found', message: 'La medición ya no está disponible.', meta });
    api.overview.mockResolvedValue(ok(overview({ measurements: { items: [], nextBefore: null } })));
    controller.openMeasurement(measurement()); controller.change('waistCm', '79');
    await controller.saveMeasurement();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'conflict', intent: null });
    controller.reviewTruth();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', editor: { mode: 'create', baseline: null, draft: { waistCm: '79' } } });
  });
  it('an unreadable refresh keeps the last confirmed read as stale, never empty', async () => {
    const { controller, api } = await setup();
    api.overview.mockResolvedValue(lost);
    await controller.load();
    expect(controller.getSnapshot().read).toMatchObject({ status: 'ready', stale: true });
    expect(controller.getSnapshot().read.weights).toHaveLength(2);
  });
  it('pages append without duplicates and a page from an older read generation is discarded', async () => {
    const data = overview({ weights: { items: [{ date: TODAY, weightKg: 80 }], nextBefore: TODAY } });
    const { controller, api } = await setup(fakeApi(data));
    let release: (v: unknown) => void = () => undefined;
    api.weights.mockReturnValueOnce(new Promise(r => { release = r as never; }));
    const more = controller.loadMore('weights');
    await controller.load();
    release(ok({ today: TODAY, items: [{ date: '2026-09-01', weightKg: 70 }], nextBefore: null })); await more;
    expect(controller.getSnapshot().read.weights).toEqual([{ date: TODAY, weightKg: 80 }]);
    api.weights.mockResolvedValue(ok({ today: TODAY, items: [{ date: TODAY, weightKg: 80 }, { date: '2026-09-01', weightKg: 70 }], nextBefore: null }));
    await controller.loadMore('weights');
    expect(controller.getSnapshot().read).toMatchObject({ weights: [{ date: TODAY, weightKg: 80 }, { date: '2026-09-01', weightKg: 70 }], weightsCursor: null });
  });
  it('storage failure blocks before anything is sent', async () => {
    const storage = memoryStorage();
    const { controller, api } = await setup(fakeApi(overview({}, [])), storage);
    jest.spyOn(storage.port, 'setItem').mockRejectedValue(new Error('disk'));
    controller.openWeight(); controller.change('weight', '70');
    await controller.saveWeight();
    expect(api.weight).not.toHaveBeenCalled(); expect(controller.getSnapshot().phase).toBe('blocked');
  });
});
