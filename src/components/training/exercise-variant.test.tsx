import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExerciseConfigurationJournal } from '../../lib/mobile-api/training-exercise-configuration-journal';
import type { ConfigurationsResponse } from '../../lib/mobile-api/training-exercise-configuration-contract';
import { webExerciseConfigurationApi } from '../../lib/phase2/training-exercise-configuration-web';
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
import { WebExerciseVariant } from './exercise-variant';

const SESSION = '93671000-0000-4000-8000-000000000021', PRESS = '93671000-0000-4000-8000-000000000031', SECOND = '93671000-0000-4000-8000-000000000032';
const EXERCISE = '93671000-0000-4000-8000-000000000010';
const state = (items: ConfigurationsResponse['items'], sessionStatus: ConfigurationsResponse['sessionStatus'] = 'completed'): ConfigurationsResponse => ({ contractVersion: 'training-exercise-configuration/1', sessionId: SESSION, sessionStatus, items });
const item = (id: string, value: ConfigurationsResponse['items'][number]['value']) => ({ sessionExerciseId: id, exerciseId: EXERCISE, revision: value ? 1 : 0, value, previous: null });
async function journal(data: ConfigurationsResponse) {
  const j = new ExerciseConfigurationJournal({ getItem: async () => null, setItem: async () => undefined }, { read: async () => ({ status: 'ok', data }), write: async () => ({ status: 'unavailable' }) }, 'owner', SESSION, () => 'k');
  await j.refresh(); return j;
}
const html = (j: ExerciseConfigurationJournal, id = PRESS, completed = true) => renderToStaticMarkup(createElement(WebExerciseVariant, { journal: j, sessionExerciseId: id, name: 'Press', editable: true, completed }));

describe('Web exercise variant', () => {
  it('starts unknown and only offers to register it', async () => {
    const markup = html(await journal(state([item(PRESS, null)], 'in_progress')), PRESS, false);
    expect(markup).toContain('Variante · Sin registrar'); expect(markup).toContain('Registrar'); expect(markup).not.toContain('Guardar');
  });
  it('says a variant was recorded after the session, and warns about two different ones in one session', async () => {
    const j = await journal(state([item(PRESS, { kind: 'recorded', label: 'Agarre neutro', source: 'entered', repeatedFrom: null, recordedPhase: 'after_session' }), item(SECOND, null)]));
    const markup = html(j);
    expect(markup).toContain('Variante · Agarre neutro · registrada después');
    expect(markup).toContain('registrada después de la sesión');
    expect(markup).toContain('así no se compara');
    expect(html(j, SECOND)).toContain('así no se compara');
  });
  it('shows a failed read as unavailable, never as an empty answer', async () => {
    const j = new ExerciseConfigurationJournal({ getItem: async () => null, setItem: async () => undefined }, { read: async () => ({ status: 'unavailable' }), write: async () => ({ status: 'unavailable' }) }, 'owner', SESSION, () => 'k');
    await j.refresh();
    expect(html(j)).toContain('Variante no disponible por ahora'); expect(html(j)).not.toContain('Sin registrar');
  });
});

describe('Web exercise configuration port', () => {
  const access = async () => ({ userId: 'owner', accessToken: 'synthetic' });
  const body = { contractVersion: 'training-exercise-configuration/1' as const, sessionExerciseId: PRESS, expectedRevision: 0, value: null, idempotencyKey: 'k' };
  it.each([[409, 'conflict'], [400, 'validation'], [404, 'not_found'], [500, 'unavailable'], [401, 'unavailable']])('maps %i to %s', async (status, expected) => {
    const fetcher = vi.fn(async () => new Response('{}', { status }));
    expect((await webExerciseConfigurationApi('owner', SESSION, access, fetcher as never).write(body)).status).toBe(expected);
  });
  it('sends the Bearer of the signed-in user to the shared route, and refuses another user', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(state([])), { status: 200 }));
    expect((await webExerciseConfigurationApi('owner', SESSION, access, fetcher as never).read()).status).toBe('ok');
    expect(fetcher).toHaveBeenCalledWith(`/api/mobile/v1/training/sessions/${SESSION}/exercise-configurations`, expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer synthetic' }) }));
    expect((await webExerciseConfigurationApi('someone', SESSION, access, fetcher as never).read()).status).toBe('auth_required');
  });
});
