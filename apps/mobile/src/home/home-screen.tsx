import { useCallback, useEffect, useMemo } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useMobileApi } from '@/api';
import type { QuickOption } from '@/api/nutrition-quick';
import { useMobileAuth } from '@/auth';
import { useHomeMetricEntry } from './use-home-metric-entry';
import {
  AppText,
  Button,
  Heading,
  ScrollScreen,
  UnavailableState,
  useOwnlevelTheme,
} from '@/design-system';
import { useNutritionConfiguration } from '@/nutrition/config-provider';
import { haptics } from '@/platform/haptics';
import { useNewSession } from '@/training/use-new-session';
import { useSessionStarter } from '@/training/use-session-starter';

import { HomeDashboard, type HomeNavigationTarget } from './home-dashboard';
import { useHomeResources } from './home-data';
import { homeDay } from './home-day';
import { homeLayout } from './home-layout';
import type { HomeMealEntry } from './home-nutrition';
import type { HomeProgressTarget } from './home-progress';
import type { HomeRegisterTarget } from './home-register';
import { homeResource } from './home-resource';

const HOME_ROUTES = {
  nutrition: '/(tabs)/nutrition',
  progress: '/(tabs)/progress',
  settings: '/settings',
} as const;

function HomeUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <ScrollScreen safeAreaEdges={['top', 'left', 'right', 'bottom']} testID="home-unavailable">
      <View style={styles.unavailableHeader}>
        <View>
          <AppText muted variant="footnote">OWNLEVEL</AppText>
          <Heading>Inicio</Heading>
        </View>
      </View>
      <UnavailableState
        action={<Button accessibilityHint="Vuelve a consultar el resumen de Inicio" label="Reintentar" onPress={onRetry} />}
        description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
        title="No pudimos cargar Inicio"
      />
    </ScrollScreen>
  );
}

/** Google account photo carried by the Supabase session (no upload/storage in M9). */
function sessionAvatarUrl(metadata: Record<string, unknown> | undefined): string | null {
  const url = metadata?.avatar_url ?? metadata?.picture;
  return typeof url === 'string' && /^https:\/\//u.test(url) ? url : null;
}

export function HomeScreen({ now = () => new Date() }: { now?: () => Date }) {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  const resources = useHomeResources(client, now);
  const { refresh } = resources;
  const configuration = useNutritionConfiguration(refresh);
  // Quick load of a daily metric right here (same sheet as Nutrición › Tu día).
  const metricEntry = useHomeMetricEntry(refresh);
  const openMetric = metricEntry.open;
  const { error: metricError, clearError: clearMetricError } = metricEntry;
  useEffect(() => { if (metricError) { Alert.alert('Métricas', metricError); clearMetricError(); } }, [metricError, clearMetricError]);

  const home = homeResource(resources.home.state);
  const day = homeDay(now());

  const navigate = useCallback((target: HomeNavigationTarget) => {
    haptics.selection();
    if (target === 'settings') router.push(HOME_ROUTES.settings);
    else router.navigate(HOME_ROUTES[target]);
  }, [router]);

  // "Arrancar rutina" / "+ Nueva sesión": the shared native sheet (same as Training). The start
  // flow owns verification, idempotency and conflicts; Home only follows the session it reports.
  const starter = useSessionStarter({ onSession: id => { refresh(); router.push(`/(tabs)/train/session/${id}`); } });
  const newSession = useNewSession({ client, home, onCreateRoutine: () => router.push('/(tabs)/train/routines'), start: starter.start, today: day.today });

  const actions = useMemo(() => ({
    onConfigureNutrition: () => { if (configuration) configuration.controller.open(); },
    // Existing Nutrition flows: manual meal, food search, or the quick list ("Ver todas").
    onMealEntry: (entry: HomeMealEntry) => {
      haptics.selection();
      router.navigate({ pathname: '/(tabs)/nutrition', params: entry === 'quick' ? { quick: 'all' } : { add: entry } });
    },
    onOpenHabit: (metricId: string) => {
      haptics.selection();
      router.push({ pathname: '/(tabs)/progress/trends/metrics', params: { metric: metricId } });
    },
    onOpenCalories: () => {
      haptics.selection();
      router.push({ pathname: '/(tabs)/progress/trends/nutrition', params: { from: day.weekStart, to: day.today } });
    },
    onOpenCompletedSession: (id: string) => { haptics.selection(); router.push({ pathname: '/(tabs)/train/history/[id]', params: { id } }); },
    onOpenDay: (date: string) => { haptics.selection(); router.push({ pathname: '/(tabs)/train/history', params: { date } }); },
    onOpenProgress: (target: HomeProgressTarget) => {
      haptics.selection();
      if (target.kind === 'body') router.push({ pathname: '/(tabs)/progress/trends/body', params: { period: target.period } });
      else if (target.kind === 'training') router.push({ pathname: '/(tabs)/progress/trends/training', params: { period: target.period } });
      else router.push({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: target.exerciseId, period: target.period } });
    },
    onOpenSession: (id: string) => { haptics.selection(); router.push(`/(tabs)/train/session/${id}`); },
    // A2: opens the existing quick registration with this meal; the user confirms there.
    onQuickMeal: (option: QuickOption) => {
      haptics.selection();
      router.navigate({ pathname: '/(tabs)/nutrition', params: { quick: `${option.source.kind}:${option.source.id}` } });
    },
    onRegister: (target: HomeRegisterTarget) => {
      haptics.selection();
      if (target.kind === 'metric') void openMetric(target.metricId);
      else router.push('/settings/metrics');
    },
  }), [configuration, day.today, day.weekStart, router, openMetric]);

  if (!home.data && home.status === 'unavailable') {
    return <HomeUnavailable onRetry={refresh} />;
  }

  return (
    <>
      <ScrollScreen
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={refresh}
            progressBackgroundColor={colors.surface}
            refreshing={resources.home.state.status === 'ready' && resources.home.state.refreshing}
            testID="home-refresh-control"
            tintColor={colors.primary}
          />
        }
        // Blocks apply their own gutter (with the side insets) so the Nutrition band is full-bleed;
        // the bottom keeps the tab bar inset plus homeLayout.bottomExtra.
        contentContainerStyle={styles.content}
        safeAreaEdges={['top', 'bottom']}
        testID={home.data ? 'home-screen' : 'home-loading'}
      >
        <HomeDashboard
          {...actions}
          avatarUrl={sessionAvatarUrl(session?.user.user_metadata)}
          calories={homeResource(resources.calories.state)}
          habits={homeResource(resources.habits.state)}
          day={day}
          home={home}
          now={() => now().getTime()}
          onNavigate={navigate}
          onRefresh={refresh}
          onStartWorkout={newSession.open}
          progressBody={homeResource(resources.progressBody.state)}
          progressRecords={homeResource(resources.progressRecords.state)}
          quick={homeResource(resources.quick.state)}
          today={homeResource(resources.today.state)}
          training={homeResource(resources.training.state)}
        />
      </ScrollScreen>
      {newSession.element}
      {starter.element}
      {metricEntry.element}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: homeLayout.bottomExtra, paddingHorizontal: 0 },
  unavailableHeader: { justifyContent: 'center', minHeight: 64 },
});
