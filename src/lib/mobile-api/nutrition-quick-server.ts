import 'server-only';
import { NextResponse } from 'next/server';
import { buildQuickMealCandidates, type QuickMealFact } from '@/lib/nutrition/quick-meals-core';
import { MobileApiUnauthorizedError, MobileApiValidationError, mobileBearerToken } from './auth';
import { authenticateMobileMutationAccessToken } from './supabase';
import { mobileApiResponseHeaders, readMobileJson } from './http';
import { mealUuid, mealVersion } from './nutrition-meal-contract';
import { isNutritionDate } from './nutrition-day-contract';
import { parseQuickOptions, parseQuickSelection, parseQuickIntent, parseQuickPreview, parseQuickResponse, parseQuickConflict,
  sameQuickSelection, type QuickOption, type QuickSection } from './nutrition-quick-contract';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function buildQuickOptions(raw: unknown) {
  if (!record(raw)) return undefined;
  const today = raw.today;
  function section(value: unknown, kind: 'saved' | 'suggestion'): QuickSection {
    if (!record(value) || value.status !== 'ok' || !Array.isArray(value.rows)) return { status: 'unavailable' };
    if (kind === 'saved') {
      const items = value.rows.map(r => {
        if (!record(r) || !Array.isArray(r.items)) return null;
        return { source: { kind, id: r.id, version: r.version }, name: r.name, description: r.description,
          templateType: r.template_type, calories: r.calories, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g,
          items: r.items.map(i => record(i) ? { id: i.id, label: i.label, quantity: i.quantity, unit: i.unit } : null), useCount: null, lastUsedDate: null };
      });
      const parsed = parseQuickOptions({ today, saved: { status: 'ok', items }, suggested: { status: 'unavailable' } });
      return parsed?.saved ?? { status: 'unavailable' };
    }
    if (value.rows.some(r => !record(r) || !mealUuid(r.id) || typeof r.version !== 'string' || !/^[a-f0-9]{64}$/.test(r.version)
      || !isNutritionDate(r.log_date) || !mealVersion(r.created_at) || ![r.title,r.description].every(t => t === null || typeof t === 'string')
      || ![r.final_calories,r.final_protein_g,r.final_carbs_g,r.final_fat_g].every(n => n === null || typeof n === 'number' && Number.isFinite(n) && n >= 0))) return { status: 'unavailable' };
    const facts: QuickMealFact[] = value.rows.map(r => ({ id: r.id, logDate: r.log_date, title: r.title, description: r.description,
      finalCalories: r.final_calories, finalProteinG: r.final_protein_g, finalCarbsG: r.final_carbs_g, finalFatG: r.final_fat_g,
      createdAt: r.created_at, deletedAt: r.deleted_at, entryKind: r.entry_kind, sourceType: r.source_type }));
    const versions = new Map(value.rows.map(r => [r.id, r.version]));
    const items: QuickOption[] = buildQuickMealCandidates(facts).map(c => ({ source: { kind, id: c.sourceMealId, version: versions.get(c.sourceMealId) },
      name: c.label, description: c.description, templateType: null, items: [], calories: c.finalCalories,
      proteinG: c.finalProteinG, carbsG: c.finalCarbsG, fatG: c.finalFatG, useCount: c.useCount, lastUsedDate: c.lastUsedDate }));
    const parsed = parseQuickOptions({ today, saved: { status: 'unavailable' }, suggested: { status: 'ok', items } });
    return parsed?.suggested ?? { status: 'unavailable' };
  }
  // #479: pins pass through the contract parser, which turns an absent (database not yet expanded) or invalid section into
  // «unavailable» on its own: saved and suggested never depend on them.
  return parseQuickOptions({ today: raw.today, saved: section(raw.saved, 'saved'), suggested: section(raw.suggested, 'suggestion'), pins: raw.pins });
}
export async function nutritionQuickResponse(request: Request, mode: 'options' | 'preview' | 'confirm', date?: string) {
  let status = 503; let body: unknown = { error: 'DATA_UNAVAILABLE' };
  try {
    const auth = await authenticateMobileMutationAccessToken(mobileBearerToken(request.headers.get('authorization')));
    if (mode === 'options') {
      const { data, error } = await auth.supabase.rpc('mobile_read_quick_options', {}, { get: true });
      const parsed = !error && buildQuickOptions(data); if (!parsed) throw new Error('Quick read unavailable');
      status = 200; body = parsed;
    } else {
      const raw = await readMobileJson(request);
      const selection = mode === 'preview' ? parseQuickSelection(raw) : parseQuickIntent(raw);
      if (!selection || selection.date !== date) throw new MobileApiValidationError('Revisá la opción y sus cantidades.');
      const { data, error } = mode === 'preview'
        ? await auth.supabase.rpc('mobile_preview_quick_meal', { p_selection: selection })
        : await auth.supabase.rpc('mobile_confirm_quick_meal', { p_intent: selection });
      if (error) {
        if (['22023','22007','22008','22P02','22003','23514'].includes(error.code)) throw new MobileApiValidationError('Revisá la opción y sus cantidades.');
        throw new Error('Quick operation unavailable');
      }
      const receipt = Array.isArray(data) && data.length === 1 ? data[0] : null;
      if (receipt?.response_status === 409) {
        const parsed = parseQuickConflict(receipt.response_body); if (!parsed) throw new Error('Invalid quick conflict');
        status = 409; body = parsed;
      } else if (mode === 'preview' && receipt?.response_status === 200) {
        const parsed = parseQuickPreview(receipt.response_body);
        if (!parsed || !sameQuickSelection(parsed.selection, selection)) throw new Error('Invalid preview');
        status = 200; body = parsed;
      } else if (mode === 'confirm' && receipt?.response_status === 201) {
        const parsed = parseQuickResponse(receipt.response_body), intent = parseQuickIntent(raw)!;
        if (!parsed || 'error' in parsed || parsed.date !== date || parsed.operation !== intent.operation) throw new Error('Invalid quick receipt');
        status = 201; body = parsed;
      } else throw new Error('Invalid quick response');
    }
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) { status = 401; body = { error: 'UNAUTHORIZED' }; }
    else if (error instanceof MobileApiValidationError) { status = 400; body = { error: 'VALIDATION_ERROR', message: error.message }; }
    else console.warn('[mobile.nutrition.quick] unavailable');
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}
