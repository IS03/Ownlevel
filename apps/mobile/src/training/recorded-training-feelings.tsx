import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, brandTokens } from '@/design-system';
import type { FeelingsResponse } from '../../../../src/lib/mobile-api/training-feelings-contract';
import type { FeelingsPort } from '../../../../src/lib/mobile-api/training-feelings-journal';
import { feelingTransition, type FeelingSide } from './feeling-transition';

type Facts = FeelingsResponse['values'];
type SessionTimes = { startedAt: string | null; endedAt: string | null };
const instant = (iso: string | null | undefined) => { const value = iso ? Date.parse(iso) : NaN; return Number.isFinite(value) ? value : null; };
/**
 * When a "before" answer was given, said only as far as it can be known here: the session's start and end are known, the time of
 * its first set is not, so an answer after the start is said as that and never judged as before or after the first set.
 */
function beforeTiming(fact: Facts['energyPre'], session: SessionTimes | undefined) {
  if (!fact) return null;
  const captured = instant(fact.capturedAt);
  if (captured === null) return 'sin hora de respuesta';
  const end = instant(session?.endedAt), start = instant(session?.startedAt);
  if (end !== null && captured > end) return 'respondida al terminar';
  if (start !== null && captured > start) return 'respondida después de iniciar la sesión';
  return null;
}
/** "Energía: baja → alta" and "Fatiga: poca → mucha": the ordinal answers, before and after, and nothing computed from them. */
export function feelingLines(facts: Facts, session?: SessionTimes) {
  const side = (fact: Facts['energyPre']): FeelingSide => fact ? { value: fact.value } : 'missing';
  return (['energy', 'fatigue'] as const).map(kind => {
    const pre = facts[`${kind}Pre`], post = facts[`${kind}Post`];
    const line = feelingTransition(kind, side(pre), side(post)), late = beforeTiming(pre, session);
    return { key: kind, text: `${line.label}: ${line.value}`, spoken: `${line.spoken}${late ? `. Antes: ${late}` : ''}`, late };
  });
}

/** Read-only facts stay separate from the historical metadata receipt. */
export function RecordedTrainingFeelings({ values, read, session }: { values?: Facts; read?: FeelingsPort['read']; session?: SessionTimes }) {
  const [state, setState] = useState<{ read: typeof read; values?: Facts; error: boolean }>({ read, values, error: false });
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!read) return;
    let active = true;
    void Promise.resolve().then(read).then(result => {
      if (!active) return;
      if (result.status === 'ok' && 'data' in result) setState({ read, values: result.data.values, error: false });
      else setState(previous => ({ read, values: previous.read === read ? previous.values : undefined, error: true }));
    }).catch(() => { if (active) setState(previous => ({ read, values: previous.read === read ? previous.values : undefined, error: true })); });
    return () => { active = false; };
  }, [read, attempt]);
  const facts = values ?? (state.read === read ? state.values : undefined), error = state.read === read && state.error;
  const answered = facts ? Object.values(facts).some(Boolean) : false;
  return <View style={{ gap: brandTokens.space.xs }} testID="recorded-training-feelings">
    <AppText variant="headline">Sensaciones pre y post</AppText>
    {facts && answered ? feelingLines(facts, session).map(line => <View key={line.key} accessible accessibilityLabel={line.spoken}>
      <AppText variant="subheadline">{line.text}</AppText>
      {line.late ? <AppText muted variant="footnote">Antes: {line.late}</AppText> : null}
    </View>) : null}
    {!facts ? <AppText muted variant="footnote">{error ? 'No pudimos leer las sensaciones.' : 'Comprobando sensaciones…'}</AppText> : null}
    {facts && !answered ? <AppText muted variant="footnote">Sin respuestas registradas.</AppText> : null}
    {error ? <><AppText muted variant="footnote">{facts ? 'No pudimos actualizar. Mostramos la última lectura confirmada.' : 'La lectura no está confirmada.'}</AppText><Button label="Reintentar lectura" variant="quiet" onPress={() => retry(value => value + 1)} /></> : null}
  </View>;
}
