import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { SectionList } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { QuickEditor } from './quick-editor';
import { QuickController, type QuickApi } from './quick-controller';
import { QuickIntentRepository } from './quick-storage';
import { QuickPinsController, type QuickPinsApi } from './quick-pins-controller';
import { QuickPinsIntentRepository } from './quick-pins-storage';
import { librarySections, pinnedRows, searchLibrary, sortAZ } from './quick-library-model';
import { ID, meta, names, ok, snap, storage, synthetic } from './quick-library-fixture.test-helper';
import { quickDate } from './quick-fixture.test-helper';
import type { QuickOptions, QuickPins } from '@/api/nutrition-quick';

jest.mock('./day-resource', () => ({ useNutritionDayResource: () => ({ state: { status: 'loading' } }) }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: null }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

/**
 * #479 D1 · automated measurements of the library at 10, 50 and 200 saved meals (1.000 as a stress case).
 * Timings are Node + react-test-renderer: they catch order-of-magnitude regressions and show how cost scales; they are NOT
 * device numbers (Hermes, UIKit, memory and real scroll need an iPhone). Counts (rows, requests) are exact.
 * `OWNLEVEL_PERF_REPORT=1 npx jest src/nutrition/quick-library-perf.test.tsx` prints the table.
 */
const SIZES = [10, 50, 200] as const;
const report = (line: string) => { if (process.env.OWNLEVEL_PERF_REPORT) process.stdout.write(`${line}\n`); };
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const ms = (n: number) => n.toFixed(3);
/** High resolution (the jest environment rounds performance.now() to whole milliseconds). */
function time(run: () => unknown, runs = 40) {
  for (let i = 0; i < 5; i++) run();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) { const start = process.hrtime.bigint(); run(); samples.push(Number(process.hrtime.bigint() - start) / 1e6); }
  return median(samples);
}

describe('#479 D1 · derivation time (pure functions, median of 40 runs)', () => {
  const table: string[] = [];
  it.each([10, 50, 200, 1000])('%i meals: A–Z, sections, search and pinned rows', count => {
    const meals = synthetic(count), pinnedIds = meals.slice(0, 6).map(m => m.source.id);
    const confirmed = snap(3, pinnedIds);
    const t = {
      sort: time(() => sortAZ(meals)), sections: time(() => librarySections(meals)),
      searchOne: time(() => searchLibrary(meals, 'a')), searchThree: time(() => searchLibrary(meals, 'pol')), searchNone: time(() => searchLibrary(meals, 'zzzz')),
      pinned: time(() => pinnedRows(pinnedIds, meals, confirmed)),
    };
    table.push(`derivation  n=${String(count).padStart(4)}  sort ${ms(t.sort)}  sections ${ms(t.sections)}  search(1 char) ${ms(t.searchOne)}  search(3) ${ms(t.searchThree)}  search(no match) ${ms(t.searchNone)}  pinned ${ms(t.pinned)}  [ms, Node]`);
    report(table.at(-1)!);
    // Generous budgets: an accidental O(n²) or per-render recomputation at this size would blow through them.
    const budget = count <= 200 ? 25 : 150;
    for (const [name, value] of Object.entries(t)) expect({ name, ok: value < budget }).toEqual({ name, ok: true });
  });
  it('scales about n log n: 20× the meals (50 → 1.000) cost well under 60× as much', () => {
    const fifty = synthetic(50), thousand = synthetic(1000);
    const small = time(() => searchLibrary(fifty, 'a')), large = time(() => searchLibrary(thousand, 'a'));
    report(`scaling     search(1 char) 50 → 1000 meals: ${ms(small)} → ${ms(large)} ms (×${(large / small).toFixed(1)})`);
    expect(large / small).toBeLessThan(60);
  });
});

describe('#479 D1 · rows rendered, requests and render cost of a scripted session', () => {
  async function session(count: number, pins: QuickPins) {
    const scroll = jest.spyOn(SectionList.prototype, 'scrollToLocation').mockImplementation(() => {});
    const commits: number[] = [];
    const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => { commits.push(actualDuration); };
    const shared = storage(), meals = synthetic(count);
    const options: QuickOptions = { today: quickDate, saved: { status: 'ok', items: meals }, suggested: { status: 'ok', items: [] }, pins };
    const quickApi = { options: jest.fn<QuickApi['options']>().mockResolvedValue({ status: 'ok', data: options, meta }), preview: jest.fn<QuickApi['preview']>(),
      confirm: jest.fn<QuickApi['confirm']>(), read: jest.fn<QuickApi['read']>() };
    const pinsApi = { write: jest.fn<QuickPinsApi['write']>(), read: jest.fn<QuickPinsApi['read']>() };
    const quick = new QuickController(quickApi, new QuickIntentRepository(shared.port, 'owner'), () => {});
    const pinsController = new QuickPinsController(pinsApi, new QuickPinsIntentRepository(shared.port, 'owner'));
    const ui = () => <OwnlevelThemeProvider initialMode="light"><Profiler id="quick" onRender={onRender}>
      <QuickEditor controller={quick} state={quick.getSnapshot()} pins={{ controller: pinsController, state: pinsController.getSnapshot() }} /></Profiler></OwnlevelThemeProvider>;
    const view = render(ui());
    quick.subscribe(() => view.rerender(ui())); pinsController.subscribe(() => view.rerender(ui()));
    await act(async () => { await quick.initialize(); await pinsController.initialize(); quick.open(quickDate); });
    act(() => { pinsController.adopt(quick.getSnapshot().options!.pins); });
    return { view, quickApi, pinsApi, commits, scroll, meals };
  }
  const writable: QuickPins = ok(snap(1, [ID(1)])), readOnly: QuickPins = { status: 'unavailable' };

  it.each(SIZES)('%i meals: a bounded window of rows, and one GET for the whole session', async count => {
    const { view, quickApi, pinsApi, scroll, meals } = await session(count, writable);
    const open = names(view).length;
    // The pinned entry shows one meal; the library is one tap away.
    act(() => { fireEvent.press(view.getByTestId('quick-all-meals')); });
    const library = names(view).length;
    const search = view.getByLabelText('Buscar en tus comidas');
    const typed: number[] = [];
    for (const query of ['p', 'po', 'pol']) { act(() => { fireEvent.changeText(search, query); }); typed.push(names(view).length); }
    act(() => { fireEvent.changeText(search, ''); });
    const letters = view.queryAllByTestId(/^quick-letter-/).length;
    for (const letter of view.queryAllByTestId(/^quick-letter-/).slice(0, 5)) act(() => { fireEvent.press(letter); });
    act(() => { fireEvent.press(view.getByTestId('quick-pins-manage')); });
    act(() => { fireEvent.press(view.getByTestId('quick-pins-manage')); });
    const matches = (q: string) => meals.filter(m => m.name.toLowerCase().includes(q)).length;
    report(`session     n=${String(count).padStart(4)}  rows@entry ${open}  rows@library ${library}  rows typing p/po/pol ${typed.join('/')} (matches ${matches('p')}/${matches('po')}/${matches('pol')})  letters ${letters}  scrollToLocation ${scroll.mock.calls.length}  GET ${quickApi.options.mock.calls.length}  pins GET ${pinsApi.read.mock.calls.length}  pins PUT ${pinsApi.write.mock.calls.length}`);
    expect(open).toBe(1);
    // Section headers count as list items: the window holds about one screen of rows, whatever the library size.
    expect(library).toBeLessThanOrEqual(Math.min(count, 30)); if (count >= 50) expect(library).toBeGreaterThanOrEqual(15);
    for (const rows of typed) expect(rows).toBeLessThanOrEqual(30);
    expect(typed.at(-1)).toBe(Math.min(matches('pol'), 30));
    expect(scroll).toHaveBeenCalledTimes(Math.min(letters, 5));
    // Opening the library, typing, clearing, letters and manage mode read and write nothing.
    expect(quickApi.options).toHaveBeenCalledTimes(1); expect(pinsApi.read).not.toHaveBeenCalled(); expect(pinsApi.write).not.toHaveBeenCalled();
    expect(quickApi.preview).not.toHaveBeenCalled(); expect(quickApi.confirm).not.toHaveBeenCalled(); expect(quickApi.read).not.toHaveBeenCalled();
    scroll.mockRestore();
  });

  it.each<[string, QuickPins]>([['editable pins', writable], ['pins unavailable', readOnly]])('render cost per keystroke, %s (react-test-renderer commit time, ms)', async (label, pins) => {
    const rows = new Map<number, { median: number; max: number }>();
    for (const count of SIZES) {
      const { view, commits, scroll } = await session(count, pins);
      if (pins.status === 'ok') act(() => { fireEvent.press(view.getByTestId('quick-all-meals')); });
      const search = view.getByLabelText('Buscar en tus comidas');
      commits.length = 0;
      for (const query of ['p', 'po', 'pol', 'po', 'p', '']) act(() => { fireEvent.changeText(search, query); });
      rows.set(count, { median: median(commits), max: Math.max(...commits) });
      report(`keystroke   n=${String(count).padStart(4)}  ${label.padEnd(17)}  commits ${commits.length}  median ${ms(median(commits))}  max ${ms(Math.max(...commits))} [ms, react-test-renderer]`);
      scroll.mockRestore();
    }
    // Typing must not cost more because the library is larger than one window: 200 meals ≈ 50 meals (same window), well under a frame budget ×10.
    expect(rows.get(200)!.median).toBeLessThan(Math.max(rows.get(50)!.median * 4, 20));
    for (const { max } of rows.values()) expect(max).toBeLessThan(250);
  });
});
