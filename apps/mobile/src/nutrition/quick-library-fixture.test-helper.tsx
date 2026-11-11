import { act, render, waitFor } from '@testing-library/react-native';
import { expect, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import type { QuickOption, QuickOptions, QuickPins, QuickPinsSnapshot } from '@/api/nutrition-quick';
import { QuickEditor } from './quick-editor';
import { QuickController, type QuickApi } from './quick-controller';
import { QuickIntentRepository } from './quick-storage';
import { QuickPinsController, type QuickPinsApi } from './quick-pins-controller';
import { QuickPinsIntentRepository, quickPinsStorageKey } from './quick-pins-storage';
import { quickDate, quickPreview, quickReceipt } from './quick-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';

/** #479 D1 · real QuickEditor + QuickController + QuickPinsController over in-memory APIs and storage (no network, no Supabase). */
export const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
export const ID = (n: number) => `42100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const meal = (n: number, name: string, description: string | null = null): QuickOption => ({ source: { kind: 'saved', id: ID(n), version: 'a'.repeat(64) }, name, description,
  templateType: 'manual', calories: 100 + n, proteinG: 10, carbsG: 20, fatG: 5, items: [], useCount: null, lastUsedDate: null });
export const snap = (revision: number, ids: string[], states: Record<string, 'archived' | 'deleted'> = {}): QuickPinsSnapshot => ({ revision, items: ids.map(id => ({ id, state: states[id] ?? 'active' })) });
export const ok = (s: QuickPinsSnapshot): QuickPins => ({ status: 'ok', ...s });
export const BASE = [meal(1, 'Tostadas con palta'), meal(2, 'Avena con banana', 'Desayuno de entreno'), meal(3, 'Ñoquis caseros'), meal(4, 'Ensalada de atún'), meal(5, 'Pollo al horno'), meal(6, 'Café con leche')];
const WORDS = ['Arroz', 'Batido', 'Calabaza', 'Dulce', 'Ensalada', 'Fideos', 'Guiso', 'Hamburguesa', 'Licuado', 'Milanesa', 'Ñoquis', 'Omelette', 'Pollo', 'Queso', 'Ravioles', 'Sopa', 'Tarta', 'Yogur', 'Zapallo'];
/** `count` synthetic saved meals, deterministic, spread over the alphabet (ids 1…count). */
export const synthetic = (count: number) => Array.from({ length: count }, (_, n) => meal(n + 1, `${WORDS[n % WORDS.length]} ${String(n + 1).padStart(3, '0')}`));

export function storage() {
  const map = new Map<string, string>();
  return { map, port: { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); }, removeItem: async (k: string) => { map.delete(k); } } };
}
export type Setup = Awaited<ReturnType<typeof setup>>;
export async function setup({ meals = BASE, pins = ok(snap(0, [])) as QuickPins, intent, user = 'owner', shared = storage(), suggested = [] as QuickOption[] }:
  { meals?: QuickOption[]; pins?: QuickPins; intent?: unknown; user?: string; shared?: ReturnType<typeof storage>; suggested?: QuickOption[] } = {}) {
  if (intent) shared.map.set(quickPinsStorageKey(user), JSON.stringify(intent));
  const options: QuickOptions = { today: quickDate, saved: { status: 'ok', items: meals }, suggested: { status: 'ok', items: suggested }, pins };
  const quickApi = { options: jest.fn<QuickApi['options']>().mockResolvedValue({ status: 'ok', data: options, meta }),
    preview: jest.fn<QuickApi['preview']>().mockImplementation(async s => ({ status: 'ok', data: quickPreview(s), meta })),
    confirm: jest.fn<QuickApi['confirm']>().mockResolvedValue({ status: 'ok', data: quickReceipt, meta }),
    // The re-read day carries the meal this write created: that is what marks a row as added.
    read: jest.fn<QuickApi['read']>().mockImplementation(async d => {
      const day = nutritionFixture(d);
      if (day.nutrition.status === 'ok') day.nutrition.data.meals[0] = { ...day.nutrition.data.meals[0]!, id: quickReceipt.resourceId };
      return { status: 'ok', data: day, meta };
    }) };
  const pinsApi = { write: jest.fn<QuickPinsApi['write']>().mockImplementation(async w => ({ status: 'ok', data: snap(w.expectedRevision + 1, w.savedMealIds), meta })),
    read: jest.fn<QuickPinsApi['read']>().mockResolvedValue({ status: 'ok', data: options, meta }) };
  const quick = new QuickController(quickApi, new QuickIntentRepository(shared.port, user), () => {});
  let keys = 0;
  const pinsController = new QuickPinsController(pinsApi, new QuickPinsIntentRepository(shared.port, user), () => `pins-${user}-${++keys}`);
  const ui = () => <OwnlevelThemeProvider initialMode="light"><QuickEditor controller={quick} state={quick.getSnapshot()} pins={{ controller: pinsController, state: pinsController.getSnapshot() }} /></OwnlevelThemeProvider>;
  const view = render(ui());
  quick.subscribe(() => view.rerender(ui())); pinsController.subscribe(() => view.rerender(ui()));
  await act(async () => { await quick.initialize(); await pinsController.initialize(); quick.open(quickDate); });
  await waitFor(() => expect(quick.getSnapshot().options).not.toBeNull());
  // What useQuickPinsController does with the same answer.
  act(() => { pinsController.adopt(quick.getSnapshot().options!.pins); });
  return { view, quick, quickApi, pins: pinsController, pinsApi, shared, options };
}
export const names = (view: ReturnType<typeof render>) => view.queryAllByLabelText(/^Revisar /).map(node => node.props.accessibilityLabel.replace('Revisar ', ''));
type Json = { type?: string; props?: Record<string, unknown>; children?: (Json | string)[] | null };
/** The rendered tree in document order as plain text: labels, test ids and strings (the raw JSON has circular props). */
function flatten(node: Json | string | null | (Json | string)[], out: string[]) {
  if (node === null) return;
  if (Array.isArray(node)) { for (const child of node) flatten(child, out); return; }
  if (typeof node === 'string') { out.push(node); return; }
  const { accessibilityLabel, testID } = node.props ?? {};
  if (typeof accessibilityLabel === 'string') out.push(accessibilityLabel);
  if (typeof testID === 'string') out.push(testID);
  for (const child of node.children ?? []) flatten(child, out);
}
/** Position of a marker in the rendered tree (document order), to compare where two things sit on screen. */
export const at = (view: ReturnType<typeof render>, marker: string) => { const out: string[] = []; flatten(view.toJSON() as Json | Json[] | null, out); return out.join('\u0001').indexOf(marker); };
