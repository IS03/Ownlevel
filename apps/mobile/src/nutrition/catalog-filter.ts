import { searchable } from './quick-model';

export type CatalogFilter = 'active' | 'archived' | 'all';
/**
 * The personal catalogs (foods, saved meals) are read whole once and searched here, by the very rule the server applies
 * (filterFoodCatalog / filterSavedMealCatalog: state, then the name without accents or case). Typing never asks the
 * server again, so the list does not blank between letters and the order stays the server's.
 */
export function filterCatalog<T extends { name: string; isActive: boolean }>(items: readonly T[], filter: CatalogFilter, search: string): T[] {
  const term = searchable(search.trim());
  return items.filter(item => (filter === 'all' || (filter === 'active') === item.isActive) && (!term || searchable(item.name).includes(term)));
}
