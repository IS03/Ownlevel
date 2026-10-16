import * as Application from 'expo-application';
import { openLegal } from '@/platform/legal';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useMobileAuth } from '@/auth';
import { AppText, Heading, ProgressBar, SkeletonBlock, useOwnlevelTheme } from '@/design-system';
import { useHapticsPreference } from '@/platform/haptics';
import { AccountAvatar } from './account-avatar';
import { CountingNumber, EditorialRow, EditorialScreen, Reveal } from './editorial';
import { previousDate, shortDate, stageHeadline, stageNames } from './settings-model';
import { useSettingsOverview } from './use-settings-overview';

export function appVersionLabel() {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version;
  const build = Application.nativeBuildVersion;
  return version ? `OWNLEVEL ${version}${build ? ` (${build})` : ''}` : 'OWNLEVEL';
}
export function SettingsScreen() {
  const router = useRouter();
  const { session } = useMobileAuth();
  const { colors, mode } = useOwnlevelTheme();
  const haptics = useHapticsPreference();
  const overview = useSettingsOverview();
  const { configuration, stages, identity, metrics, loading } = overview;
  const config = configuration?.state.config;
  const name = identity?.displayName ?? null;
  const headline = stageHeadline(name, stages);
  const stage = stages?.current;
  const physical = config?.physical.status === 'ok' ? config.physical.data : null;
  const energy = config?.energy.status === 'ok' ? config.energy.data : null;
  const plan = config?.plan.status === 'ok' ? config.plan.data : null;
  const date = stages?.today ?? config?.today;
  const weekday = date ? new Date(`${date}T12:00:00Z`).getUTCDay() || 7 : null;
  const kcal =
    (stage?.weekdays ?? plan?.weekdays)?.find((d) => d.weekday === weekday)?.calorieTargetKcal ??
    null;
  const summary = (children: ReactNode) =>
    !config ? (
      configuration?.state.readError ? (
        <AppText muted>No disponible ahora</AppText>
      ) : (
        <SkeletonBlock height={18} width="65%" />
      )
    ) : (
      children
    );
  return (
    <EditorialScreen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <AppText muted variant="caption" style={{ letterSpacing: 2 }}>
          AJUSTES
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cuenta"
          onPress={() => router.push('/settings/account')}
        >
          <AccountAvatar name={name} size={44} />
        </Pressable>
      </View>
      <Reveal>
        {(overview.identityLoading && !identity) || (overview.stagesLoading && !stages) ? (
          <SkeletonBlock height={123} width="90%" />
        ) : (
          <Heading numeric>{headline.text}</Heading>
        )}
        {headline.progress !== null && stage ? (
          <View style={{ gap: 12, marginTop: 24 }}>
            <ProgressBar
              accessibilityLabel="Avance de tu etapa"
              value={headline.progress}
              maximumValue={1}
            />
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <AppText muted variant="footnote">
                Desde {shortDate(stage.startsOn)}
                {kcal === null ? '' : ` · ${kcal.toLocaleString('es-AR')} kcal`}
              </AppText>
              <AppText muted variant="footnote">
                Termina {shortDate(previousDate(stage.endsOn!))}
              </AppText>
            </View>
          </View>
        ) : null}
        {(overview.refreshing || configuration?.state.loading) && (!loading || !!identity) ? (
          <ActivityIndicator
            color={colors.textMuted}
            size="small"
            accessibilityLabel="Actualizando ajustes"
            style={{ alignSelf: 'flex-start', marginTop: 8 }}
          />
        ) : null}
      </Reveal>
      <View>
        {[
          <EditorialRow
            key="plan"
            large
            title="Plan"
            onPress={() => router.push('/settings/stages')}
          >
            {summary(
              <>
                <AppText style={{ color: colors.primary }}>
                  {stage?.kind ? stageNames[stage.kind] : 'Plan'} ·{' '}
                </AppText>
                <CountingNumber value={kcal} />
                {kcal === null ? null : <AppText style={{ color: colors.primary }}> kcal</AppText>}
              </>,
            )}
          </EditorialRow>,
          <EditorialRow
            key="energy"
            large
            title="Energía"
            onPress={() => router.push('/settings/energy')}
          >
            {summary(
              config?.energy.status === 'unavailable' ? (
                <AppText muted>No disponible ahora</AppText>
              ) : (
                <>
                  <CountingNumber value={energy?.usedBaseKcal ?? null} />
                  {energy?.usedBaseKcal == null ? null : (
                    <AppText style={{ color: colors.primary }}> kcal por día</AppText>
                  )}
                </>
              ),
            )}
          </EditorialRow>,
          <EditorialRow
            key="physical"
            large
            title="Datos físicos"
            onPress={() => router.push('/settings/physical')}
          >
            {summary(
              config?.physical.status === 'unavailable' ? (
                <AppText muted>No disponible ahora</AppText>
              ) : (
                <>
                  <CountingNumber value={physical?.heightCm ?? null} />
                  <AppText style={{ color: colors.primary }}> cm · </AppText>
                  <CountingNumber value={physical?.weightKg ?? null} />
                  <AppText style={{ color: colors.primary }}> kg</AppText>
                </>
              ),
            )}
          </EditorialRow>,
          <EditorialRow
            key="metrics"
            large
            title="Métricas"
            onPress={() => router.push('/settings/metrics')}
          >
            {overview.metricsLoading && !metrics ? (
              <SkeletonBlock height={18} width="65%" />
            ) : metrics ? (
              metrics.definitions
                .filter((d) => d.isActive)
                .map((d) => d.name)
                .join(', ') || 'Ninguna activa'
            ) : (
              'No disponibles ahora'
            )}
          </EditorialRow>,
          <EditorialRow
            key="app"
            large
            title="App"
            onPress={() => router.push('/settings/app')}
          >{`${mode === 'system' ? 'Tema del sistema' : mode === 'dark' ? 'Oscuro' : 'Claro'} · ${haptics.enabled ? 'vibración' : 'sin vibración'}`}</EditorialRow>,
          <EditorialRow
            key="account"
            large
            title="Cuenta"
            onPress={() => router.push('/settings/account')}
          >{`${session?.user.app_metadata.provider === 'google' ? 'Google' : 'Tu cuenta'} · ${session?.user.email ?? 'Sin email'}`}</EditorialRow>,
        ].map((row, i) => (
          <Reveal key={row.key} index={i + 1}>
            {row}
          </Reveal>
        ))}
      </View>
      {configuration?.state.intent || configuration?.state.phase === 'blocked' ? (
        <EditorialRow
          title="Terminá de confirmar tu cambio"
          onPress={() => {
            const op = configuration.state.intent?.intent.operation;
            if (!configuration.state.intent) void configuration.controller.recover();
            else if (op === 'energy' || op === 'physical') router.push(`/settings/${op}`);
            else configuration.controller.showRecovery();
          }}
        >
          {configuration.state.intent
            ? 'Tu cambio sigue guardado en este teléfono.'
            : 'No pudimos guardar el cambio en este teléfono.'}
        </EditorialRow>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${appVersionLabel()}. Abrir diagnóstico`}
            onPress={() => router.push('/settings/diagnostics')}
            style={{ minHeight: 44, justifyContent: 'center', flex: 1 }}
          >
            <AppText muted variant="footnote">
              {appVersionLabel()}
            </AppText>
          </Pressable>
        ) : (
          <AppText muted variant="footnote" style={{ flex: 1 }}>
            {appVersionLabel()}
          </AppText>
        )}
        {(['privacy', 'terms'] as const).map(page => (
          <Pressable
            key={page}
            accessibilityRole="link"
            onPress={() => openLegal(page)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <AppText muted variant="footnote">
              {page === 'privacy' ? 'Privacidad' : 'Términos'}
            </AppText>
          </Pressable>
        ))}
      </View>
    </EditorialScreen>
  );
}
