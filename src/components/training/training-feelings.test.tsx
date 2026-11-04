import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrainingFeelingsJournal } from '../../lib/mobile-api/training-feelings-journal';
const theme = vi.hoisted(() => ({ current: 'light' }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: theme.current }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
import { TrainingFeelings } from './training-feelings';
const sid = '93670000-0000-4000-8000-000000000010';
async function journal() {
  const values = new Map<string, string>();
  const j = new TrainingFeelingsJournal({ getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v); } },
    { read: async () => ({ status: 'ok', data: { contractVersion: 'training-feelings/1', sessionId: sid, sessionStatus: 'in_progress', sessionUpdatedAt: '2026-11-04T10:00:00Z', endedAt: null, revision: 0, values: {} } }), write: async () => ({ status: 'unavailable' }) }, 'owner', sid, 'web', () => 'synthetic:1');
  await j.refresh(); return j;
}
describe('Web feeling controls', () => {
  it.each(['light', 'dark'])('uses accessible anchored controls without preselection (%s)', async scheme => {
    theme.current = scheme;
    const html = renderToStaticMarkup(createElement(TrainingFeelings, { journal: await journal(), phase: 'post' }));
    expect(html).toContain('Cómo terminaste'); expect(html).toContain('Energía: Muy baja, 1 de 5'); expect(html).toContain('Fatiga: Muchísima, 5 de 5');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(10); expect(html).not.toContain('aria-pressed="true"');
  });
  it('shows independent local answers as pending, with explicit removal and late-capture explanation', async () => {
    const j = await journal(); await j.change('energyPre', 4); await j.change('fatiguePre', 1);
    const html = renderToStaticMarkup(createElement(TrainingFeelings, { journal: j, phase: 'pre' }));
    expect(html).toContain('aunque ya empezaste'); expect(html).toContain('Quitar energía'); expect(html).toContain('Quitar fatiga');
    expect(html).toContain('Respuestas pendientes de confirmación'); expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
  });
});
