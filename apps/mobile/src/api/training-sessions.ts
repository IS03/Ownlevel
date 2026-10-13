import type { MobileApiClient } from './client';
import type { MobileApiMutationResult } from './results';

export const MOBILE_TRAINING_SESSIONS_API_PATH = '/api/mobile/v1/training/sessions' as const;

export type MobileStartedTrainingSession = {
  id: string;
  routineId: string | null;
  name: string;
  logDate: string;
  startedAt: string;
};

export type MobileTrainingSessionStartResponse =
  | { status: 'started'; session: MobileStartedTrainingSession }
  | { status: 'active'; code: 'ACTIVE_SESSION_EXISTS'; session: MobileStartedTrainingSession };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = TIMESTAMP.exec(value);
  return Boolean(match && validDate(match[1]) && Number(match[2]) <= 23 &&
    Number(match[3]) <= 59 && Number(match[4]) <= 59 &&
    (match[5] === undefined || (Number(match[5]) <= 23 && Number(match[6]) <= 59)) &&
    !Number.isNaN(Date.parse(value)));
}

function parseSession(value: unknown): MobileStartedTrainingSession | undefined {
  if (!record(value) || !onlyKeys(value, ['id', 'routineId', 'name', 'logDate', 'startedAt']) ||
    typeof value.id !== 'string' || !UUID.test(value.id) ||
    (value.routineId !== null && (typeof value.routineId !== 'string' || !UUID.test(value.routineId))) ||
    typeof value.name !== 'string' || !value.name.trim() ||
    !validDate(value.logDate) ||
    !validTimestamp(value.startedAt)) return undefined;
  return {
    id: value.id, routineId: value.routineId, name: value.name,
    logDate: value.logDate, startedAt: value.startedAt,
  } as MobileStartedTrainingSession;
}

export function parseMobileTrainingSessionStartResponse(value: unknown): MobileTrainingSessionStartResponse | undefined {
  if (!record(value)) return undefined;
  if (value.status === 'started' && onlyKeys(value, ['status', 'session'])) {
    const session = parseSession(value.session);
    return session ? { status: 'started', session } : undefined;
  }
  if (value.status === 'active' && value.code === 'ACTIVE_SESSION_EXISTS' &&
    onlyKeys(value, ['status', 'code', 'session'])) {
    const session = parseSession(value.session);
    return session ? { status: 'active', code: 'ACTIVE_SESSION_EXISTS', session } : undefined;
  }
  return undefined;
}

export function startMobileTrainingSession(
  client: MobileApiClient,
  input: { routineId: string | null; idempotencyKey: string },
): Promise<MobileApiMutationResult<MobileTrainingSessionStartResponse>> {
  return client.request({
    body: { ...input, templateTargetsOnly: true },
    method: 'POST',
    parse: parseMobileTrainingSessionStartResponse,
    path: MOBILE_TRAINING_SESSIONS_API_PATH,
  });
}
