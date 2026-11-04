"use client";
import { useEffect, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { FEELING_LABELS, feelingKeysFor, TrainingFeelingsJournal, type FeelingsStorage } from '@/lib/mobile-api/training-feelings-journal';
import { webTrainingFeelingsApi } from '@/lib/phase2/training-feelings-web';
import { palette, space, radius, layout, typeScale } from '../../../packages/brand/src/tokens';
import styles from './training-feelings.module.css';

const storage: FeelingsStorage = {
  getItem: async key => window.localStorage.getItem(key),
  setItem: async (key, value) => window.localStorage.setItem(key, value),
  lock: async (key, action) => {
    // A single device may have several session tabs. Hold the journal lock across read/write/receipt.
    if (!navigator.locks) throw new Error('Exclusive local journal unavailable');
    return navigator.locks.request(key, action);
  },
};
export function useWebTrainingFeelings(userId: string, sessionId: string) {
  const journal = useMemo(() => {
    const port = webTrainingFeelingsApi(userId, sessionId, async () => {
      const { data } = await createClient().auth.getSession();
      return data.session ? { userId: data.session.user.id, accessToken: data.session.access_token } : null;
    });
    return new TrainingFeelingsJournal(storage, port, userId, sessionId, 'web', () => crypto.randomUUID());
  }, [userId, sessionId]);
  useEffect(() => {
    journal.activate(); void journal.refresh();
    const refresh = () => { void journal.refresh(); };
    window.addEventListener('online', refresh);
    return () => { window.removeEventListener('online', refresh); journal.dispose(); };
  }, [journal]);
  return journal;
}

export function TrainingFeelings({ journal, phase, disabled = false }: { journal: TrainingFeelingsJournal; phase: 'pre' | 'post'; disabled?: boolean }) {
  const state = useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const colors = palette[resolvedTheme === 'dark' ? 'dark' : 'light'];
  const locked = disabled || !state.ready || state.busy || !!state.pending || state.blocked;
  const style = { '--feeling-bg': colors.bg, '--feeling-surface': colors.surface, '--feeling-text': colors.text, '--feeling-muted': colors.textMuted,
    '--feeling-border': colors.border, '--feeling-accent': colors.accent, '--feeling-gap': `${space.xs}px`, '--feeling-radius': `${radius.chip}px`,
    '--feeling-touch': `${layout.minTouch}px`, fontSize: `${typeScale.body.fontSize / 16}rem` } as CSSProperties;
  const retry = async () => {
    const result = await journal.retry();
    if (result?.sessionStatus === 'completed' && await journal.confirmFinish()) router.refresh();
  };
  return <section className={styles.block} style={style} aria-label={phase === 'pre' ? 'Sensaciones al registrar ahora' : 'Cómo terminaste'}>
    <strong>{phase === 'pre' ? 'Cómo estás ahora' : 'Cómo terminaste'}</strong>
    <p className={styles.muted}>Opcional. {phase === 'pre' ? 'Registramos la hora de tu respuesta, aunque ya empezaste.' : 'Energía y fatiga son independientes.'}</p>
    {state.readError || !state.server ? <p role="status">Sin lectura confirmada. Las respuestas pendientes siguen en este dispositivo.</p> : null}
    {feelingKeysFor(phase).map(key => {
      const label = key.startsWith('energy') ? 'Energía' : 'Fatiga';
      const anchors = FEELING_LABELS[key.startsWith('energy') ? 'energy' : 'fatigue'];
      const value = journal.value(key);
      return <fieldset key={key} disabled={locked} className={styles.scale}>
        <legend>{label}{value !== null ? ` · ${anchors[value - 1]}` : ''}</legend>
        <div className={styles.options}>{anchors.map((anchor, index) => <button key={anchor} type="button" aria-pressed={value === index + 1}
          aria-label={`${label}: ${anchor}, ${index + 1} de 5`} onClick={() => void journal.change(key, value === index + 1 ? null : index + 1)}>{index + 1}</button>)}</div>
        <div className={styles.ends}><span>{anchors[0]}</span><span>{anchors[4]}</span></div>
        {value !== null ? <button type="button" onClick={() => void journal.change(key, null)}>Quitar {label.toLowerCase()}</button> : null}
      </fieldset>;
    })}
    <p role="status">{state.busy ? 'Comprobando sensaciones…' : state.localError ? 'Borrador local sin confirmar' : state.blocked ? 'Necesita revisión' : journal.hasWork() ? 'Respuestas pendientes de confirmación' : state.server ? 'Sin respuestas pendientes' : 'Lectura pendiente'}</p>
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.localError ? <p role="alert">No se confirmó el borrador local. Revisá y volvé a elegir tus respuestas antes de finalizar.</p> : null}
    {state.blocked ? <div className={styles.block}>
      <p>Guardado: {Object.entries(state.server?.values ?? {}).map(([key, fact]) => `${key.startsWith('energy') ? 'Energía' : 'Fatiga'} ${key.endsWith('Pre') ? 'pre' : 'post'}: ${fact?.value}`).join(' · ') || 'Sin respuestas confirmadas'}</p>
      <button type="button" disabled={state.busy} onClick={() => void journal.resolve('server')}>Conservar lo guardado</button>
      <button type="button" disabled={state.busy} onClick={() => void journal.resolve('mine')}>Revisar mis respuestas para reenviar</button>
    </div> : state.pending ? <button type="button" disabled={state.busy} onClick={() => void retry()}>Comprobar operación pendiente</button>
      : phase === 'pre' && journal.hasWork() ? <button type="button" disabled={locked} onClick={() => void journal.save()}>Guardar sensaciones</button> : null}
    {state.readError && !state.pending ? <button type="button" disabled={state.busy} onClick={() => void journal.refresh()}>Volver a leer sensaciones</button> : null}
  </section>;
}
