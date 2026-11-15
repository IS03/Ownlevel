import { describe, expect, it } from '@jest/globals';
import { JUMP_MAX_PASSES, LetterJump, sectionStarts, type LetterJumpList } from './quick-letter-jump';
import { librarySections } from './quick-library-model';
import { meal } from './quick-library-fixture.test-helper';

/**
 * #525 · where «Ir a letra» actually lands, on a simulated virtualized list (no React Native layout runs in jest).
 * The simulation does what VirtualizedList does: only rows near the screen are measured; an unmeasured row is placed at
 * `average × index`; a row beyond the highest measured one fails (the component then scrolls to that same estimate).
 * Rows have their own heights (long names wrap; large text grows everything), so the estimate is wrong, as on the device.
 */
const NAMES = ['Arroz con pollo', 'Atún con ensalada', 'Avena con banana', 'Batido de proteína', 'Bife con papas', 'Café con leche', 'Canelones de verdura', 'Crema de maní con tostadas', 'Durazno', 'Empanadas de carne', 'Ensalada César', 'Fideos con tuco', 'Flan casero', 'Galletas de arroz', 'Garbanzos guisados', 'Hamburguesa casera', 'Huevos revueltos', 'Jugo de naranja', 'Lentejas guisadas', 'Licuado de banana', 'Manzana', 'Milanesa con puré', 'Naranja', 'Nuggets de pollo', 'Ñoquis con tuco', 'Ñoquis de ricota', 'Omelette de queso', 'Pan integral con queso', 'Pasta con pesto', 'Pollo al horno', 'Queso cremoso', 'Quinoa con verduras', 'Ravioles de verdura', 'Ricota con miel', 'Salmón con arroz', 'Sándwich de jamón y queso', 'Sopa de verduras', 'Tarta de verdura', 'Tostadas con palta', 'Tortilla de papas', 'Uvas', 'Verduras salteadas', 'Wrap de pollo', 'Yogur con granola', 'Yogur natural', 'Zapallo al horno', '7 semillas con avena'];
const VARIANTS = ['', ' · porción chica', ' · porción grande', ' (casera)', ' · sin sal'];
const library = (count: number) => Array.from({ length: count }, (_, n) => meal(n + 1, NAMES[n % NAMES.length]! + VARIANTS[Math.floor(n / NAMES.length) % VARIANTS.length]!));

/** The flat list Rápido renders: «Fijadas» (pinned rows), «Todas las comidas» (heading with the alphabet, no rows), the letters. */
function screen(count: number, scale: number, pinned = 6) {
  const sections = librarySections(library(count));
  const wraps = (name: string) => name.length * scale > 30;
  const lengths = [pinned, 0, ...sections.map(s => s.data.length)];
  const heights: number[] = [];
  heights.push(44 * scale, ...Array.from({ length: pinned }, () => 64 * scale), 0); // «Fijadas»
  heights.push(140 * scale, 0); // «Todas las comidas» + the alphabet
  for (const section of sections) heights.push(32 * scale, ...section.data.map(m => (wraps(m.name) ? 86 : 64) * scale), 0);
  return { keys: ['pinned', 'library', ...sections.map(s => s.key)], lengths, heights };
}
class SimList implements LetterJumpList {
  measured = new Set<number>(); offset = 0; calls = 0; queue: { run: () => void; handle: number }[] = []; next = 0;
  private tops: number[] = [];
  constructor(private heights: number[], private viewport = 700) {
    let at = 0; for (const h of heights) { this.tops.push(at); at += h; }
    this.render();
  }
  get total() { return this.tops.at(-1)! + this.heights.at(-1)!; }
  private average() { let sum = 0; for (const i of this.measured) sum += this.heights[i]!; return sum / this.measured.size; }
  private clamp(y: number) { return Math.max(0, Math.min(y, this.total - this.viewport)); }
  /** The window VirtualizedList keeps rendered (and so measured) around the screen. */
  private render() { this.heights.forEach((_, i) => { if (this.tops[i]! >= this.offset - this.viewport && this.tops[i]! <= this.offset + 2 * this.viewport) this.measured.add(i); }); }
  toSection = (section: number) => {
    this.calls += 1;
    const flat = this.flatOf(section);
    const highest = Math.max(...this.measured);
    // Beyond what is measured: onScrollToIndexFailed, and the component goes to the same estimate.
    const y = flat > highest || !this.measured.has(flat) ? this.average() * flat : this.tops[flat]!;
    this.offset = this.clamp(y); this.render();
  };
  toOffset = (y: number) => { this.calls += 1; this.offset = this.clamp(y); this.render(); };
  flatOf: (section: number) => number = () => 0;
  view = () => {
    const on = this.heights.map((h, i) => ({ i, h })).filter(({ i, h }) => {
      if (h === 0) return false; // A zero-height footer is never «viewable».
      const visible = Math.min(this.tops[i]! + h, this.offset + this.viewport) - Math.max(this.tops[i]!, this.offset);
      return visible >= h / 2;
    }).map(({ i }) => i);
    return { first: on.length ? on[0]! : null, last: on.length ? on.at(-1)! : null, offset: this.offset, viewport: this.viewport, atEnd: this.offset >= this.total - this.viewport - 2 };
  };
  schedule = (run: () => void) => { const handle = ++this.next; this.queue.push({ run, handle }); return handle; };
  cancel = (handle: unknown) => { this.queue = this.queue.filter(job => job.handle !== handle); };
  drain() { while (this.queue.length) this.queue.shift()!.run(); }
}
function setup(count: number, scale: number) {
  const { keys, lengths, heights } = screen(count, scale);
  const starts = sectionStarts(lengths), list = new SimList(heights);
  list.flatOf = section => starts[section]!;
  const jump = new LetterJump(list);
  const go = (key: string) => { const section = keys.indexOf(key); jump.start(section, starts[section]!, starts[section]! + lengths[section]! + 2); };
  return { keys, starts, lengths, list, jump, go };
}

describe('#525 · «Ir a letra» lands on the chosen letter at the first tap', () => {
  it('like the device: the list\'s own estimate alone does not land on «Ñ» (200 meals)', () => {
    const { keys, starts, list } = setup(200, 1);
    const section = keys.indexOf('Ñ');
    list.toSection(section);
    // The first tap lands somewhere else (on the device, in «M/N»). The device also stayed there on retries; this model does
    // not reproduce that part, so it is not asserted: the destination check below is what makes the first tap land.
    expect(list.view().first).not.toBe(starts[section]);
  });
  it.each([[50, 1], [200, 1], [50, 1.6], [200, 1.6]])('%i meals at text scale %s: every letter\'s heading is first on screen (or shown at the end)', (count, scale) => {
    const { keys, starts, lengths } = setup(count, scale);
    for (const key of keys.slice(2)) {
      const fresh = setup(count, scale); // From the top each time, nothing below measured: the first tap.
      fresh.go(key); fresh.list.drain();
      const section = keys.indexOf(key), { first, last, atEnd } = fresh.list.view();
      const start = starts[section]!, end = start + lengths[section]! + 2;
      const arrived = first === start || (atEnd && last !== null && first !== null && last >= start && first < end);
      if (!arrived) throw new Error(`${count} meals ×${scale}: «${key}» landed at ${first}, its heading is ${start}`);
      expect(fresh.list.calls).toBeLessThanOrEqual(JUMP_MAX_PASSES);
      expect(fresh.jump.active).toBe(false);
    }
  });
  it('a drag (stop), a search (stop) or another letter (start) ends the jump in progress; nothing runs after it', () => {
    const { list, jump, go } = setup(200, 1);
    go('Ñ'); const calls = list.calls; jump.stop();
    list.drain(); expect(list.calls).toBe(calls); expect(jump.active).toBe(false);
    const other = setup(200, 1);
    other.go('Ñ'); other.go('B'); other.list.drain();
    expect(other.list.view().first).toBe(other.starts[other.keys.indexOf('B')]);
  });
  it('never loops: a list that never reports what is on screen gets at most JUMP_MAX_PASSES placements', () => {
    let calls = 0; const queue: (() => void)[] = [];
    const jump = new LetterJump({ toSection: () => { calls++; }, toOffset: () => { calls++; }, view: () => ({ first: null, last: null, offset: 0, viewport: 700, atEnd: false }),
      schedule: run => { queue.push(run); return queue.length; }, cancel: () => {} });
    jump.start(5, 100, 140);
    while (queue.length) queue.shift()!();
    expect(calls).toBe(JUMP_MAX_PASSES); expect(jump.active).toBe(false);
  });
});
