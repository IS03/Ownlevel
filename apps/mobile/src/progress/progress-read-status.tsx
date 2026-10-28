import type { ApiResourceState } from '@/api/resource';
import { AppText } from '@/design-system';

export function ProgressReadStatus<T>({ state }: { state: ApiResourceState<T> }) {
  const current = state.status === 'ready' ? state.current : state.status === 'unavailable' ? state.previous : undefined;
  if (!current) return null;
  const time = new Date(current.confirmedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return <AppText numeric muted variant="caption" accessibilityLiveRegion="polite">
    {state.status === 'ready' && state.refreshing ? `Actualizando · lectura de las ${time}` : `Lectura de las ${time}`}
  </AppText>;
}
