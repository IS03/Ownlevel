import { describe, expect, it } from '@jest/globals';
import type { SharedValue } from 'react-native-reanimated';
import { DRAG_DELAY, dragOrder, isHoldActivation, itemTop, recordItemHeight, slotMotion } from './session-native-interactions';

// Reanimated JS-thread semantics: `.value` reads the UI runtime synchronously,
// while `.set()`/`.modify()` are only scheduled there (flushed later, in order).
function jsThreadSharedValue<T>(initial: T) {
  let ui = initial; const scheduled: (() => void)[] = [];
  const value = { get value() { return ui; }, set: (next: T) => { scheduled.push(() => { ui = next; }); },
    modify: (modifier: (current: T) => T) => { scheduled.push(() => { ui = modifier(ui); }); } };
  return { value: value as unknown as SharedValue<T>, flush: () => scheduled.splice(0).forEach(run => run()) };
}
describe('native drag measurements and activation', () => {
  it('keeps every height from one batch of layout events (mount, expand/collapse)', () => {
    const heights = jsThreadSharedValue<Record<string, number>>({});
    for (const [id, height] of [['a', 520], ['b', 96], ['c', 96]] as const) recordItemHeight(heights.value, id, height);
    heights.flush();
    expect(heights.value.value).toEqual({ a: 520, b: 96, c: 96 });
  });
  it('documents the dropped-height failure of a JS read-modify-write', () => {
    const heights = jsThreadSharedValue<Record<string, number>>({});
    for (const [id, height] of [['a', 520], ['b', 96], ['c', 96]] as const) heights.value.set({ ...heights.value.value, [id]: height });
    heights.flush();
    // Two of three items stay unmeasured, so a lift guard requiring heights never passes.
    expect(heights.value.value).toEqual({ c: 96 });
  });
  it('lifts only from the real hold, never from an early movement activation', () => {
    expect(isHoldActivation(1000, 1041)).toBe(false);
    expect(isHoldActivation(1000, 1000 + DRAG_DELAY - 41)).toBe(false);
    expect(isHoldActivation(1000, 1000 + DRAG_DELAY - 40)).toBe(true);
    expect(isHoldActivation(1000, 1412)).toBe(true);
  });
});
describe('native drag slot geometry', () => {
  it('supports variable-height expanded cards, crossing multiple slots and moving back', () => {
    const heights = { a: 500, b: 100, c: 160 }, initial = ['a', 'b', 'c'];
    expect(itemTop(initial, heights, 'c')).toBe(600);
    expect(dragOrder(initial, heights, 'a', 60)).toEqual(['b', 'a', 'c']);
    expect(dragOrder(['b', 'a', 'c'], heights, 'a', 0)).toEqual(initial);
    expect(dragOrder(initial, heights, 'a', 200)).toEqual(['b', 'c', 'a']);
    expect(dragOrder(initial, heights, 'c', 200)).toEqual(['c', 'a', 'b']);
  });
  it('keeps untouched slots stable and clamps insertion to the bounds', () => {
    const heights = { a: 80, b: 80, c: 80 }, initial = ['a', 'b', 'c'];
    expect(dragOrder(initial, heights, 'b', 80)).toEqual(initial);
    expect(dragOrder(initial, heights, 'b', -500)).toEqual(['b', 'a', 'c']);
    expect(dragOrder(initial, heights, 'b', 500)).toEqual(['a', 'c', 'b']);
  });
});
describe('native drag slot motion', () => {
  // Mounted as [declive, inclinado], reordered to [inclinado, declive]: inclinado
  // stays compensated by the declive card height above it in native flow.
  const slots = 'inclinado|declive/declive|inclinado';
  it('opening a card after a reorder moves the others with the native layout, without sliding through the old slot', () => {
    const heights = { declive: 96, inclinado: 96 };
    const before = { lifted: false, translation: itemTop(['inclinado', 'declive'], heights, 'inclinado') - itemTop(['declive', 'inclinado'], heights, 'inclinado'), slots };
    const opened = { ...heights, declive: 640 };
    const after = { lifted: false, translation: itemTop(['inclinado', 'declive'], opened, 'inclinado') - itemTop(['declive', 'inclinado'], opened, 'inclinado'), slots };
    expect([before.translation, after.translation]).toEqual([-96, -640]);
    expect(slotMotion(before, after)).toBe('snap');
  });
  it('animates only a change of slots: drag, drop, revert or a new order', () => {
    const resting = { lifted: false, translation: 0, slots: 'a|b/a|b' };
    expect(slotMotion(resting, { lifted: false, translation: 96, slots: 'b|a/a|b' })).toBe('spring');
    expect(slotMotion({ lifted: true, translation: 40, slots: 'b|a/a|b' }, { lifted: false, translation: 96, slots: 'b|a/a|b' })).toBe('spring');
    expect(slotMotion(resting, { lifted: true, translation: 12, slots: 'a|b/a|b' })).toBe('follow');
    expect(slotMotion(null, resting)).toBe('snap');
  });
});
