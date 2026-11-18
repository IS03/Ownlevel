import { beforeEach, expect, it, jest } from '@jest/globals';
import { fetchSessionDetail } from './active-session';
import { fetchSessionSummary, type SessionSummaryDto } from './session-summary';
import { invalidateConfirmedReads } from './confirmed-read-cache';
import type { MobileApiClient } from './client';
import type { FeelingsPort } from '../../../../src/lib/mobile-api/training-feelings-journal';
import { testDetail } from '../training/active-session-test-fixtures';
import { loadSessionPresentation, peekHistorySession, readHistorySession } from './history-session';

const mockFeelings = jest.fn<FeelingsPort['read']>();
jest.mock('./active-session', () => ({ ...jest.requireActual<object>('./active-session'), fetchSessionDetail: jest.fn() }));
jest.mock('./session-summary', () => ({ ...jest.requireActual<object>('./session-summary'), fetchSessionSummary: jest.fn() }));
jest.mock('./training-feelings', () => ({ trainingFeelingsApi: () => ({ read: mockFeelings }) }));
const detailRead = jest.mocked(fetchSessionDetail), summaryRead = jest.mocked(fetchSessionSummary);
const detail = testDetail(), id = detail.session.id;
const summary: SessionSummaryDto = { sessionId: id, volumeKg: null, exercises: [], highlights: [] };
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const client = () => ({}) as MobileApiClient;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { jest.clearAllMocks(); detailRead.mockResolvedValue(ok(detail)); summaryRead.mockResolvedValue(ok(summary)); mockFeelings.mockResolvedValue({ status: 'unavailable' }); });

it('starts all three reads together and waits for optional reads to settle', async () => {
  const wait = deferred<Awaited<ReturnType<typeof summaryRead>>>();
  summaryRead.mockReturnValue(wait.promise);
  const pending = loadSessionPresentation({ detail: () => detailRead(client(), id), summary: () => summaryRead(client(), id), feelings: mockFeelings });
  await Promise.resolve();
  expect(detailRead).toHaveBeenCalledTimes(1); expect(summaryRead).toHaveBeenCalledTimes(1); expect(mockFeelings).toHaveBeenCalledTimes(1);
  let settled = false; void pending.then(() => { settled = true; });
  await Promise.resolve(); expect(settled).toBe(false);
  wait.resolve(ok(summary));
  expect(await pending).toMatchObject({ status: 'ok', data: { detail, summary: { status: 'ok' }, feelings: { status: 'unavailable' } } });
});
it('keeps optional failures explicit and contains a thrown read', async () => {
  const result = await loadSessionPresentation({ detail: async () => ok(detail), summary: async () => { throw Error('offline'); }, feelings: mockFeelings });
  expect(result).toMatchObject({ status: 'ok', data: { summary: { status: 'unavailable' }, feelings: { status: 'unavailable' } } });
});
it('joins tap/navigation reads; reuses a warm complete presentation and isolates accounts', async () => {
  mockFeelings.mockResolvedValue({ status: 'ok', data: { contractVersion: 'training-feelings/1', sessionId: id, sessionStatus: 'completed', sessionUpdatedAt: detail.session.updatedAt, endedAt: detail.session.endedAt, revision: 0, values: {} } });
  const a = client(); await Promise.all([readHistorySession(a, id), readHistorySession(a, id)]);
  expect(detailRead).toHaveBeenCalledTimes(1); expect(summaryRead).toHaveBeenCalledTimes(1); expect(mockFeelings).toHaveBeenCalledTimes(1);
  expect(peekHistorySession(a, id)?.detail).toEqual(detail);
  await readHistorySession(a, id); expect(detailRead).toHaveBeenCalledTimes(1);
  expect(peekHistorySession(client(), id)).toBeUndefined();
  await readHistorySession(client(), id); expect(detailRead).toHaveBeenCalledTimes(2);
  invalidateConfirmedReads(a, `/api/mobile/v1/training/sessions/${id}/correct`);
  expect(peekHistorySession(a, id)).toBeUndefined();
  await readHistorySession(a, id); expect(detailRead).toHaveBeenCalledTimes(3);
});
it('retries incomplete optional reads instead of treating unavailable as empty', async () => {
  const a = client(); await readHistorySession(a, id); await Promise.all([readHistorySession(a, id), readHistorySession(a, id)]);
  expect(detailRead).toHaveBeenCalledTimes(2); expect(mockFeelings).toHaveBeenCalledTimes(2);
});
it('preserves not-found and never falls back to cached protected data on denial', async () => {
  expect(await loadSessionPresentation({ detail: async () => ok(detail), feelings: async () => ({ status: 'auth_required' }) })).toMatchObject({ status: 'auth_required' });
  const a = client(); await readHistorySession(a, id);
  summaryRead.mockResolvedValueOnce({ status: 'unauthorized', meta: { ...meta, httpStatus: 403, outcome: 'unauthorized' } });
  expect(await readHistorySession(a, id)).toMatchObject({ status: 'unauthorized' }); expect(peekHistorySession(a, id)).toBeUndefined();
  detailRead.mockResolvedValueOnce({ status: 'not_found', message: 'gone', meta: { ...meta, httpStatus: 404, outcome: 'not_found' } });
  expect(await readHistorySession(client(), id)).toMatchObject({ status: 'not_found' });
});
it('does not promote a read started before a training write as fresh', async () => {
  const a = client(), wait = deferred<Awaited<ReturnType<typeof detailRead>>>(); detailRead.mockReturnValueOnce(wait.promise);
  const pending = readHistorySession(a, id); await Promise.resolve();
  invalidateConfirmedReads(a, `/api/mobile/v1/training/sessions/${id}/correct`); wait.resolve(ok(detail));
  expect(await pending).toMatchObject({ status: 'unavailable' }); expect(peekHistorySession(a, id)).toBeUndefined();
});
