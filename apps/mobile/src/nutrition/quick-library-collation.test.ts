import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { QuickOption } from '@/api/nutrition-quick';

/**
 * #479 D1 · found on the iOS simulator, invisible to Node: Hermes' Intl.Collator('es', { sensitivity: 'base' }) compares
 * 'N' and 'Ñ' as EQUAL (compare('N','Ñ') === 0, measured on the device runtime), unlike Node's full ICU. Sorting by the
 * collator alone then interleaves Ñ words with N words → sections «Ñ N Ñ», duplicate React keys and a broken letter index.
 * Here the model is loaded with a collator that folds ñ into n, exactly as the simulator does.
 */
const meal = (n: number, name: string): QuickOption => ({ source: { kind: 'saved', id: `42100000-0000-4000-8000-${String(n).padStart(12, '0')}`, version: 'a'.repeat(64) }, name,
  description: null, templateType: 'manual', calories: 100, proteinG: 1, carbsG: 1, fatG: 1, items: [], useCount: null, lastUsedDate: null });
const NAMES = ['Ácido láctico', 'acelga salteada', 'Zapallo', 'Ñoquis caseros', 'ñandú asado', 'Nueces', 'Nuez moscada', 'Óleo de oliva', 'Éclair', '3 huevos duros', 'Ají molido',
  'Mate cocido', 'Ñ', 'Oreo', 'ñame', 'Nachos', 'nata', 'Ñoño', '¡Hola!', 'Ñu'];
const meals = NAMES.map((name, n) => meal(n + 1, name));

function loadWithCollator(fold: boolean) {
  const real = Intl.Collator;
  const base = new real('es', { sensitivity: 'base', numeric: true });
  // What the simulator does: ñ is n at base sensitivity.
  if (fold) jest.spyOn(Intl, 'Collator').mockImplementation((() => ({ compare: (a: string, b: string) => base.compare(a.replace(/ñ/gi, 'n'), b.replace(/ñ/gi, 'n')) })) as never);
  let model!: typeof import('./quick-library-model');
  jest.isolateModules(() => { model = jest.requireActual<typeof import('./quick-library-model')>('./quick-library-model'); });
  return model;
}
afterEach(() => { jest.restoreAllMocks(); });

describe('#479 D1 · A–Z order does not depend on how the platform collator treats Ñ', () => {
  it.each([['full ICU (Node)', false], ['a collator that folds ñ into n (Hermes on iOS)', true]])('%s: Ñ after N and before O, one section per initial, unique keys', (_label, fold) => {
    const { librarySections, sortAZ, searchLibrary } = loadWithCollator(fold);
    const sections = librarySections(meals);
    expect(sections.map(s => s.key)).toEqual(['#', 'A', 'E', 'M', 'N', 'Ñ', 'O', 'Z']);
    expect(new Set(sections.map(s => s.key)).size).toBe(sections.length);
    expect(sections.find(s => s.key === 'N')!.data.map(o => o.name)).toEqual(['Nachos', 'nata', 'Nueces', 'Nuez moscada']);
    expect(sections.find(s => s.key === 'Ñ')!.data.map(o => o.name)).toEqual(expect.arrayContaining(['Ñ', 'ñame', 'ñandú asado', 'Ñoño', 'Ñoquis caseros', 'Ñu']));
    expect(sections.find(s => s.key === 'Ñ')!.data).toHaveLength(6);
    // Every meal exactly once, and the flat order is the sections' order (what search and the list show).
    expect(sections.flatMap(s => s.data).map(o => o.source.id).sort()).toEqual(meals.map(o => o.source.id).sort());
    expect(sortAZ(meals).map(o => o.source.id)).toEqual(sections.flatMap(s => s.data).map(o => o.source.id));
    expect(searchLibrary(meals, 'ñ').map(o => o.name)).toEqual(sortAZ(meals).filter(o => /n/i.test(o.name.normalize('NFD').replace(/\p{Diacritic}/gu, ''))).map(o => o.name));
  });
  it('the order is stable whatever order the meals arrive in', () => {
    const { sortAZ } = loadWithCollator(true);
    const expected = sortAZ(meals).map(o => o.source.id);
    for (let seed = 1; seed <= 20; seed++) {
      const shuffled = [...meals].sort((a, b) => ((a.source.id.charCodeAt(30) * seed) % 7) - ((b.source.id.charCodeAt(30) * seed) % 7) || (a.name < b.name ? -1 : 1));
      expect(sortAZ(shuffled).map(o => o.source.id)).toEqual(expected);
    }
  });
});
