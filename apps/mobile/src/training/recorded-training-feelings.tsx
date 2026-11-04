import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, brandTokens } from '@/design-system';
import { FEELING_LABELS } from '@/api/training-feelings';
import type { FeelingsResponse } from '../../../../src/lib/mobile-api/training-feelings-contract';
import type { FeelingsPort } from '../../../../src/lib/mobile-api/training-feelings-journal';

/** Read-only facts stay separate from the historical metadata receipt. */
export function RecordedTrainingFeelings({ values, read }: { values?: FeelingsResponse['values']; read?: FeelingsPort['read'] }) {
  const [state, setState] = useState<{ read: typeof read; values?: FeelingsResponse['values']; error: boolean }>({ read, values, error: false });
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
  return <View style={{ gap: brandTokens.space.xs }} testID="recorded-training-feelings">
    <AppText variant="headline">Sensaciones pre y post</AppText>
    {facts ? Object.entries(facts).map(([key, fact]) => fact ? <AppText key={key} variant="subheadline">
      {key.startsWith('energy') ? 'Energía' : 'Fatiga'} {key.endsWith('Pre') ? 'al registrar antes/durante' : 'al terminar'}: {FEELING_LABELS[key.startsWith('energy') ? 'energy' : 'fatigue'][fact.value - 1]}
    </AppText> : null) : <AppText muted variant="footnote">{error ? 'No pudimos leer las sensaciones.' : 'Comprobando sensaciones…'}</AppText>}
    {facts && Object.keys(facts).length === 0 ? <AppText muted variant="footnote">Sin respuestas registradas.</AppText> : null}
    {error ? <><AppText muted variant="footnote">{facts ? 'No pudimos actualizar. Mostramos la última lectura confirmada.' : 'La lectura no está confirmada.'}</AppText><Button label="Reintentar lectura" variant="quiet" onPress={() => retry(value => value + 1)} /></> : null}
  </View>;
}
