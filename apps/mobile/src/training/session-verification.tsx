import { useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { AppIcon, brandTokens, useOwnlevelTheme } from '@/design-system';
import type { ActiveSessionController, SessionSnapshot } from './active-session-controller';

// The controller's existing notice identifies a failed read, not an uncertain write.
// Other notices (auth, terminal state, validation, recovery) keep their actionable presentation.
export const isLocalSessionRead = (state: SessionSnapshot) => !state.fenced && !state.storageError && !state.intent
  && state.notice === 'No pudimos comprobar la sesión. Los borradores se conservan.';

export function SessionVerification({ controller }: { controller: ActiveSessionController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const progress = useSyncExternalStore(controller.subscribeProgress, controller.getProgress, controller.getProgress);
  const { colors } = useOwnlevelTheme();
  const checking = state.refreshing || state.intent?.phase === 'running';
  const label = state.refreshing ? 'Comprobando sesión' : state.intent ? 'Operación pendiente de confirmación'
    : isLocalSessionRead(state) ? 'Copia local de la sesión. Revisar estado' : 'Estado de la sesión';
  const inspect = () => {
    const message = state.storageError ? 'Hay un problema con el borrador del dispositivo. Revisá el aviso de recuperación.'
      : state.intent ? 'Hay una operación sin resolver. Usá su aviso de recuperación antes de repetirla.'
      : state.refreshing ? 'Estamos comprobando la sesión. La vista todavía puede mostrar la última copia disponible.'
      : state.notice ?? 'Mostramos la última lectura confirmada de la sesión.';
    const drafts = progress.pending || progress.drafts || progress.errors
      ? 'Hay cambios que todavía requieren confirmación. Los avisos de cada ejercicio permiten revisarlos.' : 'No hay cambios de series pendientes conocidos.';
    Alert.alert('Estado de la sesión', `${message}\n\n${drafts}`, [
      { text: 'Entendido', style: 'cancel' },
      ...(!checking && !state.intent && !state.finishing ? [{ text: 'Reintentar lectura', onPress: () => void controller.refresh() }] : []),
    ]);
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Muestra qué se pudo comprobar y cómo recuperarlo."
    accessibilityState={{ busy: checking }} onPress={inspect}
    style={{ minWidth: brandTokens.layout.minTouch, minHeight: brandTokens.layout.minTouch, alignItems: 'center', justifyContent: 'center' }}>
    {checking ? <ActivityIndicator testID="session-background-sync" size="small" color={colors.textMuted} /> : <AppIcon name="info" size={20} color={colors.textMuted} />}
  </Pressable>;
}
