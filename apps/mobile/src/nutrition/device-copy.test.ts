import { describe, expect, it } from '@jest/globals';
import { personalFood } from './food-fixture.test-helper';
import { quickOptions } from './quick-fixture.test-helper';
import { PlateFoodsSnapshot, QuickOptionsSnapshot, plateFoodsStorageKey } from './quick-options-storage';

const memory = () => {
  const map = new Map<string, string>();
  return { map, port: { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); }, removeItem: async (k: string) => { map.delete(k); } } };
};
describe('Lists kept on this device', () => {
  it('round-trips per account; another account reads nothing', async () => {
    const { port } = memory();
    await new QuickOptionsSnapshot(port, 'a').write(quickOptions());
    expect(await new QuickOptionsSnapshot(port, 'a').read()).toEqual(quickOptions());
    expect(await new QuickOptionsSnapshot(port, 'b').read()).toBeNull();
  });
  it('a copy that does not parse is ignored whole, never a partial list', async () => {
    const { map, port } = memory();
    map.set(plateFoodsStorageKey('a'), JSON.stringify({ version: 1, value: [personalFood, { id: 'x' }] }));
    expect(await new PlateFoodsSnapshot(port, 'a').read()).toBeNull();
    map.set(plateFoodsStorageKey('a'), '{not json');
    expect(await new PlateFoodsSnapshot(port, 'a').read()).toBeNull();
    map.set(plateFoodsStorageKey('a'), JSON.stringify({ version: 1, value: [personalFood] }));
    expect(await new PlateFoodsSnapshot(port, 'a').read()).toEqual([personalFood]);
  });
});
