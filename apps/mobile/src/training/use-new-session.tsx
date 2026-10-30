import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { MobileApiClient } from '@/api/client';
import { settledWrites } from '@/api/confirmed-read-cache';
import type { MobileHomeResponse } from '@/api/home';
import type { HomeResource } from '@/home/home-resource';
import { haptics } from '@/platform/haptics';

import { loadRecommendationData, recommendRoutine, weekdayName, type RecommendationData } from './new-session-model';
import { NewSessionSheet } from './new-session-sheet';
import type { NewSessionPage, NewSessionRecommendation, NewSessionRoutine, NewSessionRoutines } from './new-session-sheet.types';
import { routineLastDone } from './training-hub-model';
import type { SessionStartRequest } from './use-session-starter';

/** Opening the sheet refreshes the recommendation in the background when it is older than this. */
const DATA_TTL = 5 * 60_000;
const PREFETCH_DELAY_MS = 1_000;

/** `writes`: the account's settled writes when the read started, so a later write (finish, edit, discard) makes it stale. */
type Loaded = { at: number; writes: number; data: RecommendationData };

/**
 * "Nueva sesión" for Home and Training: the native sheet (recommended / choose / free).
 * Picking closes the sheet; once it is gone, `start` (the screen's session starter) starts
 * that choice right away, with no chooser in between.
 */
export function useNewSession({ client, home, onCreateRoutine, start, today }: {
  client: MobileApiClient | null; home: HomeResource<MobileHomeResponse>; today: string;
  onCreateRoutine: () => void; start: (request: SessionStartRequest) => void;
}): { open: () => void; element: ReactNode } {
  const [isOpen, setOpen] = useState(false);
  const [page, setPage] = useState<NewSessionPage>('start');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const pending = useRef<SessionStartRequest | 'create' | null>(null);
  const inflight = useRef<{ controller: AbortController; today: string } | null>(null);

  // Read in the background so the sheet opens ready (no slot appearing and disappearing).
  const load = () => {
    if (!client || inflight.current?.today === today) return;
    inflight.current?.controller.abort();
    const controller = new AbortController();
    inflight.current = { controller, today };
    const writes = settledWrites(client);
    void loadRecommendationData(client, today, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      inflight.current = null;
      setLoaded({ at: Date.now(), writes, data });
    }).catch(() => { if (!controller.signal.aborted) inflight.current = null; });
  };
  const current = loaded?.data.today === today ? loaded : null;
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  // Shortly after the screen's own reads (and again when the day changes), so it never competes with them.
  useEffect(() => {
    const timer = setTimeout(() => loadRef.current(), PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [client, today]);
  useEffect(() => () => inflight.current?.controller.abort(), []);

  const read = home.data?.training.workoutStartRoutines;
  const recent = current?.data.recent ?? [];
  const toRoutine = (routine: NonNullable<Extract<typeof read, { status: 'ok' }>>['data'][number]): NewSessionRoutine => ({
    color: routine.color, exerciseCount: routine.exerciseCount, id: routine.id, lastDone: routineLastDone(routine.id, recent, today), name: routine.name, setCount: routine.setCount,
  });
  const routines: NewSessionRoutines = !read ? { status: 'loading' } : read.status === 'ok' ? { items: read.data.map(toRoutine), status: 'ok' } : { status: 'unavailable' };
  let recommendation: NewSessionRecommendation = { status: 'none' };
  if (routines.status === 'loading' || !current) recommendation = { status: 'loading' };
  else if (routines.status === 'ok' && current.data.sameWeekday) {
    const pick = recommendRoutine(current.data.sameWeekday, routines.items.map(routine => routine.id), today);
    const routine = pick && routines.items.find(item => item.id === pick.routineId);
    if (pick && routine) recommendation = { doneToday: pick.doneToday, routine, status: 'ok', weekday: weekdayName(today) };
  }

  const choose = (request: SessionStartRequest | 'create') => { haptics.selection(); pending.current = request; setOpen(false); };
  const onDismissed = () => {
    setPage('start');
    const request = pending.current;
    pending.current = null;
    if (request === 'create') onCreateRoutine();
    else if (request) start(request);
  };

  const element = (
    <NewSessionSheet onClose={() => setOpen(false)} onCreateRoutine={() => choose('create')} onDismissed={onDismissed} onFree={() => choose({ free: true })}
      onPage={setPage} onPickRoutine={routineId => choose({ routineId })} open={isOpen} page={page} recommendation={recommendation} routines={routines} />
  );
  const open = () => {
    haptics.selection(); setPage('start'); setOpen(true);
    // Refresh quietly, keeping what is shown: when old, after any settled write, or when the last read failed.
    if (!current || Date.now() - current.at > DATA_TTL || current.writes !== settledWrites(client) || !current.data.sameWeekday) load();
  };
  return { element, open };
}
