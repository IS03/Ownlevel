import { describe, expect, it } from '@jest/globals';
import { filterCatalog } from './catalog-filter';

/** Synthetic catalog only. */
const items = [{ name: 'CAFÉ CON LECHE', isActive: true }, { name: 'Té verde', isActive: false }, { name: 'PAN LACTAL', isActive: true }];
describe('Local catalog search (same rule as the server catalogs)', () => {
  it('filters by state, then by name without accents or case, keeping the order', () => {
    expect(filterCatalog(items, 'active', '').map(i => i.name)).toEqual(['CAFÉ CON LECHE', 'PAN LACTAL']);
    expect(filterCatalog(items, 'archived', '').map(i => i.name)).toEqual(['Té verde']);
    expect(filterCatalog(items, 'all', 'TE V').map(i => i.name)).toEqual(['Té verde']);
    expect(filterCatalog(items, 'all', '  cafe ').map(i => i.name)).toEqual(['CAFÉ CON LECHE']);
    expect(filterCatalog(items, 'active', 'verde')).toEqual([]);
  });
});
