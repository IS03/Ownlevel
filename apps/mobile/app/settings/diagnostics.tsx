import { useCallback } from 'react';

import { fetchMobileHome, useApiResource, useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import {
  AppText,
  Button,
  Heading,
  brandTokens,
  SkeletonBlock,
  UnavailableState,
} from '@/design-system';
import { EditorialRow, EditorialScreen, useEditorialLayout } from '@/settings/editorial';

function displayTimestamp(value: number | undefined): string {
  return value
    ? new Date(value).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';
}

function ApiDiagnosticsContent() {
  const { largeText } = useEditorialLayout();
  const { client, config, configurationError, runtime } = useMobileApi();
  const { session } = useMobileAuth();
  const load = useCallback(
    (signal: AbortSignal) => {
      if (!client) {
        return Promise.resolve({
          status: 'unavailable' as const,
          reason: 'invalid_response' as const,
          meta: {
            durationMs: 0,
            httpStatus: null,
            outcome: 'unavailable' as const,
          },
        });
      }
      return fetchMobileHome(client, signal);
    },
    [client],
  );
  const { refresh, state } = useApiResource(load);
  const current =
    state.status === 'ready'
      ? state.current
      : state.status === 'loading'
        ? undefined
        : state.previous;
  const result = state.status === 'loading' ? null : state.result;
  const isRefreshing =
    state.status === 'loading' || (state.status === 'ready' && state.refreshing);

  return (
    <EditorialScreen>
      <Heading style={largeText ? brandTokens.typeScale.title1 : undefined}>Diagnóstico</Heading>
      <AppText muted>Comprobá la conexión con OWNLEVEL. No mostramos tus registros ni credenciales.</AppText>
      <EditorialRow title="Servidor">{config?.host ?? 'Sin configurar'}</EditorialRow>
      <EditorialRow title="Entorno">{config?.appEnv ?? 'Sin configurar'}</EditorialRow>
      <EditorialRow title="Dispositivo">{runtime?.platform ?? 'No disponible'}</EditorialRow>
      <EditorialRow title="Sesión">{session ? 'Conectada' : 'Sin sesión'}</EditorialRow>

      {configurationError ? (
        <UnavailableState
          description="Falta configurar la conexión de esta app con OWNLEVEL."
          title="Configuración incompleta"
        />
      ) : null}

      {state.status === 'loading' ? (
        <SkeletonBlock height={96} />
      ) : null}

      <>
        <Heading level={2}>Conexión con Inicio</Heading>
        <EditorialRow title="Estado">{isRefreshing ? 'Comprobando conexión' : state.status === 'ready' ? 'Conectado' : 'No disponible ahora'}</EditorialRow>
        <EditorialRow title="Respuesta del servidor">{result?.meta.httpStatus?.toString() ?? 'Sin respuesta'}</EditorialRow>
        <EditorialRow title="Tiempo de respuesta">{result ? `${result.meta.durationMs.toLocaleString('es-AR')} ms` : 'Sin dato'}</EditorialRow>
        <EditorialRow title="Fecha en Inicio">{current?.data.date ?? 'Sin dato'}</EditorialRow>
        <EditorialRow title="Última comprobación">{displayTimestamp(current?.confirmedAt)}</EditorialRow>
        {state.status === 'unavailable' && state.previous ? (
          <AppText muted>
            Mostramos el último dato disponible. No pudimos actualizarlo.
          </AppText>
        ) : null}
        {state.status === 'unavailable' ? (
          <AppText accessibilityRole="alert" muted>
            No pudimos comprobar la conexión. Podés volver a probar.
          </AppText>
        ) : null}
        <Button
          disabled={!!configurationError}
          loading={isRefreshing}
          label="Comprobar conexión"
          onPress={() => void refresh()}
        />
      </>
    </EditorialScreen>
  );
}

export default function ApiDiagnosticsScreen() {
  if (!__DEV__) {
    return (
      <EditorialScreen>
        <UnavailableState
          description="Esta herramienta solo está habilitada en la app de desarrollo."
          title="Diagnóstico no disponible"
        />
      </EditorialScreen>
    );
  }

  return <ApiDiagnosticsContent />;
}
