import { parseRoutineColor } from './routine-color';
import type { MobileApiClient } from './client';
import type { MobileReadResult, MobileRoutineColorKey } from './home';
import type { MobileApiReadResult } from './results';

export const MOBILE_TRAINING_API_PATH = '/api/mobile/v1/training' as const;

export type MobileTrainingActiveSession = {
  id: string;
  name: string;
  logDate: string;
};

export type MobileTrainingCalendarDay = {
  date: string;
  colors: (MobileRoutineColorKey | null)[];
};

export type MobileTrainingCalendar = {
  month: string;
  days: MobileTrainingCalendarDay[];
};

export type MobileTrainingResponse = {
  activeSession: MobileReadResult<MobileTrainingActiveSession | null>;
  calendar: MobileReadResult<MobileTrainingCalendar>;
};


const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseReadResult<T>(
  value: unknown,
  parse: (data: unknown) => T | undefined,
): MobileReadResult<T> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.status === 'unavailable') {
    return { status: 'unavailable' };
  }
  if (value.status !== 'ok' || !('data' in value)) {
    return undefined;
  }
  const data = parse(value.data);
  return data === undefined ? undefined : { status: 'ok', data };
}

function parseActiveSession(value: unknown): MobileTrainingActiveSession | null | undefined {
  if (value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !isIsoDate(value.logDate)
  ) {
    return undefined;
  }
  return { id: value.id, name: value.name, logDate: value.logDate };
}

function parseCalendarDay(value: unknown): MobileTrainingCalendarDay | undefined {
  if (
    !isRecord(value) ||
    !isIsoDate(value.date) ||
    !Array.isArray(value.colors) ||
    !value.colors.every((color) => typeof color === 'string')
  ) {
    return undefined;
  }
  return {
    date: value.date,
    colors: value.colors.map(color => parseRoutineColor(color)!),
  };
}

function parseCalendar(value: unknown): MobileTrainingCalendar | undefined {
  if (!isRecord(value) || !isMonth(value.month) || !Array.isArray(value.days)) {
    return undefined;
  }
  const days = value.days.map(parseCalendarDay);
  if (
    days.some((day) => day === undefined) ||
    days.some((day) => day?.date.slice(0, 7) !== value.month)
  ) {
    return undefined;
  }
  const parsedDays = days.filter((day): day is MobileTrainingCalendarDay => day !== undefined);
  if (new Set(parsedDays.map((day) => day.date)).size !== parsedDays.length) {
    return undefined;
  }
  return { month: value.month, days: parsedDays };
}

export function parseMobileTrainingResponse(value: unknown): MobileTrainingResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const activeSession = parseReadResult(value.activeSession, parseActiveSession);
  const calendar = parseReadResult(value.calendar, parseCalendar);
  if (!activeSession || !calendar) {
    return undefined;
  }
  return { activeSession, calendar };
}

export function fetchMobileTraining(
  client: MobileApiClient,
  month: string,
  signal?: AbortSignal,
): Promise<MobileApiReadResult<MobileTrainingResponse>> {
  return client.read({
    parse: parseMobileTrainingResponse,
    path: `${MOBILE_TRAINING_API_PATH}?month=${encodeURIComponent(month)}`,
    signal,
  });
}
