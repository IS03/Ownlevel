import { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { historyReturnParams } from '@/history/navigation';
import { ReturnToHistoryDay } from '@/history/return-to-day';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchSessionDetail, type SessionDetailDto, type SessionFinishedDto } from '@/api/active-session';
import { discardSession, type SessionDiscardedDto } from '@/api/training-history';
import type { MobileApiRequestResult } from '@/api/results';
import { AppText, Button, ScrollScreen, Surface, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { compactHistoryDate } from './active-session-model';
import { completedSessionModel } from './completed-session-model';
import { CompletedSessionView } from './completed-session-view';
import { ReadStateScreen } from './history-components';
import { useRead } from './use-read';

export type CompletedSessionApi = {
  detail: (signal?: AbortSignal) => Promise<MobileApiRequestResult<SessionDetailDto>>;
  discard: (idempotencyKey: string) => Promise<MobileApiRequestResult<SessionDiscardedDto>>;
};
export function completedSessionApi(client: MobileApiClient, sessionId: string): CompletedSessionApi {
  return { detail: signal => fetchSessionDetail(client, sessionId, signal), discard: key => discardSession(client, sessionId, key) };
}
const newKey = () => typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID()
  : `discard-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * A closed session from server truth, with the Web historical actions:
 * correct (completed only) and discard (confirmed, idempotent, never a hard delete).
 */
export function CompletedSessionScreen({ api, sessionId, initialDetail, finished = null, onHome, onTraining }: {
  api: CompletedSessionApi; sessionId: string; initialDetail?: SessionDetailDto; finished?: SessionFinishedDto | null;
  onHome: () => void; onTraining?: () => void;
}) {
  const router = useRouter();
  const origin = historyReturnParams(useLocalSearchParams());
  const navigation = useNavigation();
  const { colors } = useOwnlevelTheme();
  const load = useCallback((signal: AbortSignal) => api.detail(signal), [api]);
  const { state, reload } = useRead(load, initialDetail);
  // Re-read on focus so a correction made on the next screen shows confirmed server truth.
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const [discarding, setDiscarding] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'danger' | 'warning' } | null>(null);
  // An unconfirmed discard is retried with the same key (exact replay, no second effect).
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const status = state.status === 'ready' ? state.data.session.status : null;
  useLayoutEffect(() => {
    if (status && status !== 'in_progress') navigation.setOptions({ title: status === 'discarded' ? 'Sesión eliminada' : 'Sesión finalizada' });
  }, [navigation, status]);
  if (state.status !== 'ready') return <ReadStateScreen header={<ReturnToHistoryDay />} state={state} onRetry={() => void reload()} testID="history-session" notFoundTitle="Sesión no disponible" />;
  const detail = state.data;
  if (detail.session.status === 'in_progress') {
    return <ScrollScreen testID="history-session-in-progress"><ReturnToHistoryDay /><UnavailableState title="La sesión está en curso" description="Abrila para seguir entrenando o finalizarla."
      action={<Button label="Abrir sesión" onPress={() => router.replace(`/(tabs)/train/session/${sessionId}`)} />} /></ScrollScreen>;
  }
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/train/history'); };
  const runDiscard = async () => {
    const idempotencyKey = pendingKey ?? newKey();
    setPendingKey(idempotencyKey);
    setDiscarding(true); setNotice(null);
    const result = await api.discard(idempotencyKey);
    setDiscarding(false);
    if (result.status === 'ok') { setPendingKey(null); leave(); return; }
    if (result.status === 'unavailable') {
      setNotice({ tone: 'warning', text: 'No pudimos confirmar si la sesión se eliminó. Volvé a intentarlo: no se elimina dos veces.' });
      void reload();
      return;
    }
    setPendingKey(null);
    if (result.status === 'conflict' && result.code === 'SESSION_DISCARDED') { leave(); return; }
    setNotice({ tone: 'danger', text: result.status === 'conflict' || result.status === 'validation' || result.status === 'not_found'
      ? result.message : 'Tu sesión expiró. Volvé a iniciar sesión.' });
    void reload();
  };
  const confirmDiscard = () => {
    const model = completedSessionModel(detail);
    Alert.alert('¿Eliminar esta sesión?', `${model.name}\n${[compactHistoryDate(model.logDate), model.duration].filter(Boolean).join(' · ')}\n` +
      `${model.completedSetCount} ${model.completedSetCount === 1 ? 'serie' : 'series'}. La sesión dejará de aparecer en historial, progreso, volumen, ` +
      'calendario y reportes. Tu rutina actual no se modificará.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar sesión', style: 'destructive', onPress: () => void runDiscard() },
    ]);
  };
  const actions = detail.session.status === 'completed' ? <View style={styles.actions}>
    {notice ? <Surface accessibilityRole="alert"><AppText style={{ color: notice.tone === 'danger' ? colors.danger : colors.text }} variant="caption">{notice.text}</AppText></Surface> : null}
    <Button label="Corregir sesión" variant="secondary" disabled={discarding} onPress={() => router.push(origin ? { pathname: '/(tabs)/train/correct/[id]', params: { id: sessionId, ...origin } } : `/(tabs)/train/correct/${sessionId}`)} />
    <Button label={discarding ? 'Eliminando…' : pendingKey ? 'Reintentar eliminación' : 'Eliminar sesión'} variant="quiet" disabled={discarding}
      onPress={pendingKey ? () => void runDiscard() : confirmDiscard} />
  </View> : null;
  return <CompletedSessionView detail={detail} finished={finished} onHome={onHome} onTraining={onTraining} actions={actions}
    banner={<><ReturnToHistoryDay />{state.stale ? <Surface><AppText muted variant="caption">No se pudo actualizar. Mostramos la última lectura confirmada.</AppText></Surface> : null}</>}
    onOpenExercise={exerciseId => router.push(`/(tabs)/train/history/exercise/${exerciseId}${detail.session.routineId ? `?routineId=${encodeURIComponent(detail.session.routineId)}` : ''}`)} />;
}

/** Route entry: /train/history/[id]. */
export function HistorySessionRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const { client } = useMobileApi();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  if (!client || !id) return <ReadStateScreen state={{ status: 'unavailable' }} onRetry={() => router.back()} testID="history-session" />;
  return <HistorySessionContent client={client} sessionId={id} onHome={() => router.replace('/(tabs)/home')} />;
}
function HistorySessionContent({ client, sessionId, onHome }: { client: MobileApiClient; sessionId: string; onHome: () => void }) {
  const [api] = useState(() => completedSessionApi(client, sessionId));
  return <CompletedSessionScreen api={api} sessionId={sessionId} onHome={onHome} />;
}
const styles = StyleSheet.create({ actions: { gap: spacing.sm } });
