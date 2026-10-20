import { describe, expect, it, jest } from '@jest/globals';
import { createMobileApiClient } from './client';
import { mutateNutritionStages, parseStageFields, type StagesIntent } from './nutrition-stages';
import { stagesFixture } from '@/stages/stages-fixture.test-helper';
function fixture(status: number, body: unknown) {
  const fetcher = jest.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
      }) as Response,
  );
  const client = createMobileApiClient({
    auth: {
      getAccessToken: async () => ({ status: 'ok', accessToken: 'private-test-token' }),
      revalidateAfterUnauthorized: async () => ({ status: 'invalid' }),
    },
    config: {
      appEnv: 'development',
      baseUrl: 'https://www.ownlevel.fit',
      host: 'www.ownlevel.fit',
      timeoutMs: 1000,
    },
    runtime: { platform: 'ios', appVersion: '1', build: '1' },
    fetchImplementation: fetcher as unknown as typeof fetch,
  });
  return { client, fetcher };
}
const list = stagesFixture();
const current = list.current!;
const fields = parseStageFields({
  name: current.name,
  kind: current.kind,
  weekdays: current.weekdays,
  baseWaterL: current.baseWaterL,
  trainingCalorieDeltaKcal: current.trainingCalorieDeltaKcal,
  trainingWaterDeltaL: current.trainingWaterDeltaL,
  trainingProteinDeltaG: current.trainingProteinDeltaG,
})!;
const intent: StagesIntent = {
  operation: 'replace_from_today',
  date: list.today,
  expectedListVersion: list.listVersion,
  idempotencyKey: 'stages:network',
  stage: fields,
  future_stages: 'keep',
};
describe('Stage POST through the authenticated client', () => {
  it('only POST stages, identity from Bearer, strict receipt correlated to the exact operation/date', async () => {
    const f = fixture(200, {
      status: 'confirmed',
      operation: intent.operation,
      date: intent.date,
      list,
    });
    const result = await mutateNutritionStages(f.client, intent);
    expect(result.status).toBe('ok');
    const [url, init] = f.fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.ownlevel.fit/api/mobile/v1/nutrition/stages?targets=2');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer private-test-token' });
    expect(JSON.parse(init.body as string)).not.toHaveProperty('userId');
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const bad = fixture(200, {
      status: 'confirmed',
      operation: 'delete_future',
      date: intent.date,
      list,
    });
    expect((await mutateNutritionStages(bad.client, intent)).status).toBe('unavailable');
  });
  it.each(['STAGES_CHANGED', 'STAGES_DAY_CHANGED'] as const)(
    '409 %s preserves strictly parsed server truth',
    async (error) => {
      const body = {
        status: 'conflict',
        error,
        message: 'Las etapas cambiaron.',
        list: { ...list, listVersion: 100 },
      };
      const f = fixture(409, body);
      expect(await mutateNutritionStages(f.client, intent)).toMatchObject({
        status: 'conflict',
        code: error,
        message: body.message,
        data: body,
      });
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('400 surfaces the exact service copy; malformed conflict is uncertain rather than a fake empty truth', async () => {
    const f = fixture(400, {
      status: 'validation',
      message: 'Borrá desde la última etapa o cortá la secuencia.',
    });
    expect(await mutateNutritionStages(f.client, intent)).toMatchObject({
      status: 'validation',
      message: 'Borrá desde la última etapa o cortá la secuencia.',
    });
    const bad = fixture(409, {
      status: 'conflict',
      error: 'STAGES_CHANGED',
      message: 'Cambió',
      list: {},
    });
    expect((await mutateNutritionStages(bad.client, intent)).status).toBe('unavailable');
  });
  it('401 never retries a sensitive POST automatically', async () => {
    const f = fixture(401, {});
    expect((await mutateNutritionStages(f.client, intent)).status).toBe('unauthorized');
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
});
