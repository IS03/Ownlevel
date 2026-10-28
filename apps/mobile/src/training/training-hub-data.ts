import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { fetchMobileHome, type MobileHomeResponse } from '@/api/home';
import type { MobileApiClient } from '@/api/client';
import { ApiResourceController, shouldRefreshOnForeground, type ApiResourceState } from '@/api/resource';
import type { MobileApiReadResult } from '@/api/results';
import { fetchMobileTraining, type MobileTrainingResponse } from '@/api/training';
import { fetchTrainingHistory, type TrainingHistorySession } from '@/api/training-history';
import { homeResource } from '@/home/home-resource';
import { addIsoDays } from '@/home/format';
import { mondayOf } from '@/home/home-day';
import { nutritionToday } from '@/nutrition/day-format';

export type HubWeek = { start: string; end: string; sessions: TrainingHistorySession[] };
export const HUB_CACHE_TTL = 30_000;
// Only requested weeks are scanned. Never expose a partial total if this budget is exceeded.
export const HUB_WEEK_PAGE_BUDGET = 40;
const unavailable = { status: 'unavailable' as const, reason: 'invalid_response' as const,
  meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } };

export function shiftHubMonth(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Uses stored logDate for membership; endedAt only proves pagination has passed the week. */
export async function loadHubWeek(client: MobileApiClient, start: string, signal?: AbortSignal): Promise<MobileApiReadResult<HubWeek>> {
  const end = addIsoDays(start, 6);
  const sessions = new Map<string, TrainingHistorySession>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < HUB_WEEK_PAGE_BUDGET; page++) {
    const result = await fetchTrainingHistory(client, cursor, signal);
    if (result.status !== 'ok') return result;
    for (const session of result.data.sessions) {
      if (session.logDate >= start && session.logDate <= end) sessions.set(session.id, session);
    }
    const last = result.data.sessions.at(-1);
    const next = result.data.nextCursor;
    if (!next || (last && nutritionToday(new Date(last.endedAt)) < start)) {
      return { status: 'ok', data: { start, end, sessions: [...sessions.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) }, meta: result.meta };
    }
    if (cursors.has(next) || signal?.aborted) return unavailable;
    cursors.add(next);
    cursor = next;
  }
  return unavailable;
}

/** Screen-scoped cache: never shared between users, and disposed when its client changes. */
export class TrainingHubCache {
  readonly home: ApiResourceController<MobileHomeResponse>;
  readonly months = new Map<string, ApiResourceController<MobileTrainingResponse>>();
  readonly weeks = new Map<string, ApiResourceController<HubWeek>>();

  constructor(private readonly client: MobileApiClient | null) {
    this.home = new ApiResourceController(signal => client ? fetchMobileHome(client, signal) : Promise.resolve(unavailable));
  }

  month(key: string) {
    let resource = this.months.get(key);
    if (!resource) {
      resource = new ApiResourceController(signal => this.client ? fetchMobileTraining(this.client, key, signal) : Promise.resolve(unavailable));
      this.months.set(key, resource);
    }
    return resource;
  }

  week(date: string) {
    const key = mondayOf(date);
    let resource = this.weeks.get(key);
    if (!resource) {
      resource = new ApiResourceController(signal => this.client ? loadHubWeek(this.client, key, signal) : Promise.resolve(unavailable));
      this.weeks.set(key, resource);
    }
    return resource;
  }

  /** Only observed calendar weeks of the current/previous month; no recency history request. */
  observedSessions(today: string): TrainingHistorySession[] {
    const first = `${shiftHubMonth(today.slice(0, 7), -1)}-01`;
    const sessions = new Map<string, TrainingHistorySession>();
    for (const resource of this.weeks.values()) {
      const data = homeResource(resource.getSnapshot()).data;
      for (const session of data?.sessions ?? []) {
        if (session.logDate >= first && session.logDate <= today) sessions.set(session.id, session);
      }
    }
    return [...sessions.values()];
  }

  dispose() {
    this.home.dispose();
    this.months.forEach(resource => resource.dispose());
    this.weeks.forEach(resource => resource.dispose());
  }
}

/** Not confirmed yet, failed, or confirmed longer than the hub window ago. */
export function hubReadExpired(resource: { getSnapshot(): ApiResourceState<unknown> }, now = Date.now()) {
  const snapshot = resource.getSnapshot();
  return snapshot.status !== 'ready' || now - snapshot.current.confirmedAt >= HUB_CACHE_TTL;
}

export function useHubRead<T>(resource: ApiResourceController<T>) {
  const state = useSyncExternalStore(resource.subscribe.bind(resource), resource.getSnapshot.bind(resource), resource.getSnapshot.bind(resource));
  useEffect(() => {
    if (hubReadExpired(resource)) void resource.refresh('initial');
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      if (shouldRefreshOnForeground(previous, next)) void resource.refresh('foreground');
      previous = next;
    });
    return () => subscription.remove();
  }, [resource]);
  return homeResource(state);
}

export function hubRoutineMetadata(exerciseCount: number, routineId: string, sessions: TrainingHistorySession[], today: string): string {
  const base = `${exerciseCount} ${exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}`;
  const latest = sessions.filter(session => session.routineId === routineId).sort((a, b) => b.logDate.localeCompare(a.logDate))[0];
  if (!latest) return base;
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${latest.logDate}T12:00:00Z`)) / 86_400_000);
  return `${base} · ${days === 0 ? 'hoy' : days === 1 ? 'última ayer' : `última hace ${days} días`}`;
}

export function hubWeekTotals(week: HubWeek): { sessions: number; sets: number } {
  return { sessions: week.sessions.length, sets: week.sessions.reduce((sum, session) => sum + session.completedSets, 0) };
}
