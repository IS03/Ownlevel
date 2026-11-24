import { useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { AppText, Button } from '@/design-system';
import { restAlertStatus } from './session-rest-alert';

export function RestAlertOption() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof restAlertStatus>> | 'unavailable'>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void restAlertStatus().then(next => { if (mounted) setStatus(next); }).catch(() => { if (mounted) setStatus('unavailable'); });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  if (!status) return null;
  if (status === 'enabled') return <AppText muted variant="footnote">Este dispositivo permite los avisos de descanso.</AppText>;
  if (status === 'unavailable') return <AppText muted variant="footnote">El aviso no está disponible en este dispositivo.</AppText>;
  return <Button label={status === 'settings' ? 'Configurar avisos' : 'Avisarme con la pantalla bloqueada'} variant="quiet" loading={loading} onPress={() => {
    if (status === 'settings') {
      void Linking.openSettings().catch(() => setStatus('unavailable'));
      return;
    }
    setLoading(true);
    void restAlertStatus(true).then(setStatus).catch(() => setStatus('unavailable')).finally(() => setLoading(false));
  }} />;
}
