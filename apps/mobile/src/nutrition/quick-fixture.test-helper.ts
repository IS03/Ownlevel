import type { QuickOption, QuickOptions, QuickPreview, QuickReceipt, QuickSelection } from '@/api/nutrition-quick';
export const quickDate = '2026-10-03';
export const quickId = '42100000-0000-4000-8000-000000000001';
export function quickOption(composite = false, suggestion = false): QuickOption {
  return { source: { kind: suggestion ? 'suggestion' : 'saved', id: quickId, version: 'a'.repeat(64) }, name: 'PASTA', description: null,
    templateType: suggestion ? null : composite ? 'composite' : 'manual', calories: 300, proteinG: null, carbsG: 20, fatG: 0,
    items: composite ? [{ id: quickId, label: 'INGREDIENTE', quantity: 100, unit: 'g' }] : [], useCount: suggestion ? 3 : null, lastUsedDate: suggestion ? '2026-10-02' : null };
}
export function quickOptions(): QuickOptions { return { today: quickDate, saved: { status: 'ok', items: [quickOption(true)] }, suggested: { status: 'ok', items: [quickOption(false, true)] }, pins: { status: 'ok', revision: 0, items: [] } }; }
export function quickPreview(selection: QuickSelection): QuickPreview {
  const n = { calories: 300, proteinG: null, carbsG: 20, fatG: 0 };
  return { status: 'preview', selection, snapshot: { ...n, title: 'PASTA', description: null, precision: null, sourceNote: null, contextType: selection.source.kind === 'saved' ? 'saved_meal' : null },
    items: selection.quantities ? selection.quantities.map(q => ({ id: q.itemId, label: 'INGREDIENTE', unit: 'g', quantity: q.quantity, ...n })) : [] };
}
export const quickReceipt: QuickReceipt = { status: 'registered', operation: 'register', date: quickDate, resourceId: quickId, updatedAt: '2026-10-03T12:00:00.123456Z' };
