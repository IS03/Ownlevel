import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { fetchMobileTraining, fetchMobileTrainingRoutines, startMobileTrainingSession, useApiResource, useMobileApi } from '@/api';
import type { MobileTrainingActiveSession } from '@/api/training';

import { monthForDate } from './calendar';
import { activeStartRoutines, initialStartSelection, sameStartSelection, StartIntent, validStartSelection, type StartSelection } from './start-workout-model';

const unavailableResult = { status: 'unavailable' as const, reason: 'invalid_response' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } };

/** Shared start flow (active-session check, idempotency, conflicts); driven by the session starter. */
export function useWorkoutStart({ initialFree = false, initialRoutineId, onClose, onStarted }: {
  initialFree?: boolean; initialRoutineId?: string; onClose: () => void; onStarted: (id: string) => void;
}) {
  const { client } = useMobileApi();
  const loadActive = useCallback((signal: AbortSignal) => client
    ? fetchMobileTraining(client, monthForDate(new Date()), signal)
    : Promise.resolve(unavailableResult), [client]);
  const loadRoutines = useCallback((signal: AbortSignal) => client
    ? fetchMobileTrainingRoutines(client, signal)
    : Promise.resolve(unavailableResult), [client]);
  const active = useApiResource(loadActive);
  const routineRead = useApiResource(loadRoutines);
  const [chosen, setChosen] = useState<StartSelection | null | undefined>(undefined);
  const [conflictActive, setConflictActive] = useState<MobileTrainingActiveSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyConflict, setKeyConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const intent = useRef(new StartIntent());

  const activeResource = active.state.status === 'ready' && !active.state.refreshing
    ? active.state.current.data.activeSession : null;
  const activeSession = conflictActive ?? (activeResource?.status === 'ok' ? activeResource.data : null);
  const verifiedNoActive = !conflictActive && activeResource?.status === 'ok' && activeResource.data === null;
  const routineResource = routineRead.state.status === 'ready'
    ? routineRead.state.current.data.routines : null;
  const routineConfirmed = routineRead.state.status === 'ready' && !routineRead.state.refreshing && routineResource?.status === 'ok';
  const routines = routineResource?.status === 'ok' ? activeStartRoutines(routineResource.data) : [];
  const selected = validStartSelection(chosen === undefined
    ? initialFree ? { kind: 'free' } : initialStartSelection(routines, initialRoutineId) : chosen, routines);

  const close = () => {
    if (pendingRef.current) return;
    intent.current.reset();
    onClose();
  };
  const select = (next: StartSelection) => {
    if (pendingRef.current) return;
    if (!sameStartSelection(selected, next) || keyConflict) intent.current.reset();
    setChosen(next);
    setKeyConflict(false);
    setError(null);
  };
  const submit = async () => {
    if (pendingRef.current || !verifiedNoActive || !selected || !client || keyConflict ||
      (selected.kind === 'routine' && !routineConfirmed)) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const result = await startMobileTrainingSession(client, {
      routineId: selected.kind === 'free' ? null : selected.routineId,
      idempotencyKey: intent.current.keyFor(selected),
    });
    pendingRef.current = false;
    setPending(false);
    if (result.status === 'ok' && result.data.status === 'started') {
      onStarted(result.data.session.id);
      return;
    }
    if (result.status === 'conflict' && result.code === 'ACTIVE_SESSION_EXISTS' && result.data?.status === 'active') {
      setConflictActive(result.data.session);
      void AccessibilityInfo.announceForAccessibility('Ya tenés una sesión en curso.');
      return;
    }
    if (result.status === 'conflict' && result.code === 'IDEMPOTENCY_KEY_REUSED') {
      setKeyConflict(true);
      setError('Este intento ya se usó con otra selección. Elegí de nuevo una opción para continuar.');
    } else if (result.status === 'validation') {
      setError(result.message);
    } else if (result.status === 'not_found') {
      setError('La rutina ya no está disponible.');
      setChosen(null);
      intent.current.reset();
      void routineRead.refresh();
    } else if (result.status === 'auth_required' || result.status === 'unauthorized') {
      setError('Tu sesión necesita volver a validarse.');
    } else {
      // An ambiguous failure retains this intent's key for an explicit manual retry.
      setError('No pudimos iniciar el entrenamiento. Revisá la conexión e intentá nuevamente.');
    }
  };
  return { active, activeSession, close, error, keyConflict, pending, routineRead, routineResource, routineConfirmed, routines, selected, select, submit, verifiedNoActive };
}
