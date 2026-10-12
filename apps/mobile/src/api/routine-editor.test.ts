import { describe, expect, it, jest } from '@jest/globals';

import type { MobileApiClient } from './client';
import { detailFixture } from './routine-editor.fixture';
import {
  fetchRoutineDetail, parseRoutineDetail, replaceRoutineTemplate, updateRoutineIdentity,
} from './routine-editor';

const ID = '11111111-1111-4111-8111-111111111111';
const EXERCISE = '22222222-2222-4222-8222-222222222222';
const RELATION = '33333333-3333-4333-8333-333333333333';

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };

describe('Mobile routine editor API', () => {
  it('parses exact values including zero, null, archived exercises and legacy notes', () => {
    expect(parseRoutineDetail(detailFixture)).toEqual(detailFixture);
    expect(parseRoutineDetail({ ...detailFixture, items: [{ ...detailFixture.items[0], targets: { ...detailFixture.items[0]!.targets, sets: [] } }] })).toBeUndefined();
    expect(parseRoutineDetail({ ...detailFixture, items: [{ ...detailFixture.items[0], exercise: { ...detailFixture.items[0]!.exercise, isActive: 'yes' } }] })).toBeUndefined();
    expect(parseRoutineDetail({ ...detailFixture, routine: { ...detailFixture.routine, templateVersion: '3' } })).toBeUndefined();
    expect(parseRoutineDetail({ ...detailFixture, items: [{ ...detailFixture.items[0], exerciseOrder: 4 }] })).toBeDefined();
  });

  it('preserves 404 as a distinct screen state and never fabricates empty detail', async () => {
    const request = jest.fn<MobileApiClient['request']>().mockResolvedValue({
      status: 'not_found', message: 'Missing', meta,
    } as never);
    const client = { request } as unknown as MobileApiClient;
    expect(await fetchRoutineDetail(client, ID)).toMatchObject({ status: 'ok', data: { kind: 'not_found' } });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path: `/api/mobile/v1/training/routines/${ID}` }));
  });

  it('uses one canonical PATCH and one full-template PUT', async () => {
    const request = jest.fn<MobileApiClient['request']>().mockResolvedValue({ status: 'ok', data: detailFixture, meta } as never);
    const client = { request } as unknown as MobileApiClient;
    await updateRoutineIdentity(client, ID, {
      name: 'PUSH B', color: 'rose', expectedUpdatedAt: detailFixture.routine.updatedAt,
    });
    await replaceRoutineTemplate(client, ID, {
      expectedTemplateVersion: 3,
      items: [{ routineExerciseId: RELATION, exerciseId: EXERCISE, targets: detailFixture.items[0]!.targets }],
    });
    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: 'PATCH', path: `/api/mobile/v1/training/routines/${ID}/identity`,
      body: { name: 'PUSH B', color: 'rose', expectedUpdatedAt: detailFixture.routine.updatedAt },
    }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'PUT', path: `/api/mobile/v1/training/routines/${ID}/template`,
      body: expect.objectContaining({ expectedTemplateVersion: 3 }),
    }));
    expect(request).toHaveBeenCalledTimes(2);
  });
});

it.each(['sand', 'stone', 'slate', 'graphite', 'future-color'])('keeps the full template and original unknown color %s for safe editing', color => {
  const parsed = parseRoutineDetail({ ...detailFixture, routine: { ...detailFixture.routine, color } });
  expect(parsed).toEqual({ ...detailFixture, routine: { ...detailFixture.routine, color: null, unrecognizedColor: color } });
});
