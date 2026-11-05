'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { CONFIGURATION_AFTER_NOTE, CONFIGURATION_HINT, CONFIGURATION_LABEL_MAX, CONFIGURATION_MIXED_NOTE, normalizeConfigurationLabel, sameConfiguration,
  type ConfigurationValue } from '@/lib/mobile-api/training-exercise-configuration-contract';
import { ExerciseConfigurationJournal, type ConfigurationStorage } from '@/lib/mobile-api/training-exercise-configuration-journal';
import { webExerciseConfigurationApi } from '@/lib/phase2/training-exercise-configuration-web';

const storage: ConfigurationStorage = {
  getItem: async key => window.localStorage.getItem(key),
  setItem: async (key, value) => window.localStorage.setItem(key, value),
};

/** #367: the same journal as Mobile. Optional: a failure here never blocks training or finishing. */
export function useWebExerciseConfigurations(userId: string, sessionId: string, exerciseIds: readonly string[]) {
  const journal = useMemo(() => new ExerciseConfigurationJournal(storage, webExerciseConfigurationApi(userId, sessionId, async () => {
    const { data } = await createClient().auth.getSession();
    return data.session ? { userId: data.session.user.id, accessToken: data.session.access_token } : null;
  }), userId, sessionId, () => crypto.randomUUID()), [userId, sessionId]);
  // An added or removed exercise needs its own row in the read; going back online replays what is pending, with its key.
  const ids = exerciseIds.join(',');
  useEffect(() => { void journal.refresh(); }, [journal, ids]);
  useEffect(() => {
    const refresh = () => { void journal.refresh(); };
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [journal]);
  return journal;
}

const text = (value: { kind: string; label: string | null } | null) => value === null ? 'Sin registrar' : value.kind === 'not_applicable' ? 'No aplica' : value.label!;

/** One exercise of the Web session editor, in progress or completed. Reuses the notes block's layout and controls. */
export function WebExerciseVariant({ journal, sessionExerciseId, name, editable, completed }: {
  journal: ExerciseConfigurationJournal; sessionExerciseId: string; name: string; editable: boolean; completed: boolean;
}) {
  const snapshot = useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const view = journal.view(sessionExerciseId);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const id = `exercise-variant-${sessionExerciseId}`;
  if (!view.item) return snapshot.ready && snapshot.error && !snapshot.busy ? <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-2.5 py-1.5" data-testid={id}>
    <p className="text-sm text-muted-foreground">Variante no disponible por ahora</p>
    <Button type="button" size="sm" variant="ghost" onClick={() => void journal.refresh()}>Reintentar</Button>
  </div> : null;
  const current = view.value, unconfirmed = view.state === 'unconfirmed';
  const after = view.state === 'saved' && view.item.value?.recordedPhase === 'after_session';
  // "Same as last time" is the person's choice, kept with where it came from: never filled in for them.
  const previous = view.item.previous && !sameConfiguration(current, view.item.previous.value) ? view.item.previous : null;
  const label = normalizeConfigurationLabel(draft);
  const typed: ConfigurationValue | null = label ? { kind: 'recorded', label, source: 'entered', repeatedFrom: null } : null;
  const unchanged = !typed || (sameConfiguration(current, typed) && current?.label === typed.label);
  const save = async (value: ConfigurationValue | null) => {
    setSaving(true); setError(null);
    try { if (await journal.choose(sessionExerciseId, value)) setOpen(false); else setError('No pudimos confirmar la variante. Entrenar no depende de esto.'); }
    finally { setSaving(false); }
  };
  return <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 px-2.5 py-1.5" data-testid={id}>
    <div className="flex min-h-8 items-center justify-between gap-3">
      <p className="flex min-w-0 items-center gap-2 text-sm font-medium"
        aria-label={`Variante de ${name}: ${text(current)}${after ? ', registrada después de la sesión' : ''}${unconfirmed ? ', sin confirmar' : ''}`}>
        <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className={current === null ? 'text-muted-foreground' : undefined}>Variante · {text(current)}{after ? ' · registrada después' : ''}</span>
      </p>
      {unconfirmed ? <Button type="button" size="sm" variant="ghost" disabled={snapshot.busy} onClick={() => void journal.retry()}>Reintentar</Button>
        : editable ? <Button type="button" size="sm" variant="ghost" disabled={snapshot.busy || !!snapshot.pending} aria-expanded={open} aria-controls={`${id}-editor`}
          onClick={() => { setDraft(current?.kind === 'recorded' ? current.label : ''); setError(null); setOpen(!open); }}>{open ? 'Cancelar' : current === null ? 'Registrar' : 'Cambiar'}</Button> : null}
    </div>
    {journal.mixed(sessionExerciseId) ? <p className="text-xs text-muted-foreground">{CONFIGURATION_MIXED_NOTE}</p> : null}
    {unconfirmed || (snapshot.error && !snapshot.pending && view.state === 'saved') ? <p role="status" className="text-xs text-muted-foreground">{snapshot.error ?? 'Variante sin confirmar.'}</p> : null}
    {open ? <div id={`${id}-editor`} className="space-y-2 pb-1">
      <p className="text-xs text-muted-foreground">{CONFIGURATION_HINT}{completed ? ` ${CONFIGURATION_AFTER_NOTE}` : ''}</p>
      <Input aria-label={`Variante de ${name}`} placeholder="Ej.: agarre neutro, banco a 30°" maxLength={CONFIGURATION_LABEL_MAX} value={draft} disabled={saving}
        onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && typed && !unchanged) void save(typed); }} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving || unchanged} onClick={() => { if (typed) void save(typed); }}>Guardar</Button>
        {previous ? <Button type="button" size="sm" variant="outline" disabled={saving}
          onClick={() => void save({ ...previous.value, source: 'repeated_previous', repeatedFrom: previous.sessionExerciseId } as ConfigurationValue)}>Como la última vez · {text(previous.value)}</Button> : null}
        {current?.kind === 'not_applicable' ? null : <Button type="button" size="sm" variant="outline" disabled={saving}
          onClick={() => void save({ kind: 'not_applicable', label: null, source: 'entered', repeatedFrom: null })}>No aplica</Button>}
        {current ? <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => void save(null)}>Dejar sin registrar</Button> : null}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div> : null}
  </div>;
}
