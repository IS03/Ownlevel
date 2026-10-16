import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import type { MobileHomeResponse, MobileHomeTodaySession } from '@/api/home';
import type { HistoryDay } from '@/api/history';
import type { NutritionReport } from '@/api/nutrition-report';
import type { ProgressHabitWeek, ProgressBody, ProgressTraining } from '@/api/progress';
import {
  AppIcon,
  AppText,
  Button,
  SkeletonBlock,
  brandTokens,
  pressedStyle,
  radius,
  spacing,
  useOwnlevelTheme,
  useReduceMotion,
} from '@/design-system';

import { formatInteger, profileInitial } from './format';
import type { HomeTrainingWeek } from './home-data';
import { elapsedMinutes, headerDate, readAge } from './home-day';
import { HomeNutrition, type HomeMealEntry } from './home-nutrition';
import { HomeProgress, type HomeProgressTarget } from './home-progress';
import { HomeRegister, type HomeRegisterTarget } from './home-register';
import type { HomeResource } from './home-resource';
import { HEADER_SLACK, homeLayout } from './home-layout';
import { HomeButton, HomeGutter, HomeRow, HomeRowSeparator } from './home-ui';
import { HomeWeek } from './home-week';

export type HomeNavigationTarget = 'nutrition' | 'progress' | 'settings';

export type HomeDashboardProps = {
  avatarUrl: string | null;
  calories: HomeResource<NutritionReport>;
  habits: HomeResource<ProgressHabitWeek>;
  onOpenHabit: (metricId: string) => void;
  day: { today: string; weekStart: string };
  home: HomeResource<MobileHomeResponse>;
  now?: () => number;
  onConfigureNutrition: () => void;
  /** Opens an existing Nutrition loading flow: manual meal, food search or the quick list. */
  onMealEntry: (entry: HomeMealEntry) => void;
  onNavigate: (target: HomeNavigationTarget) => void;
  /** Completed session detail (`/(tabs)/train/history/{id}`). */
  onOpenCompletedSession: (sessionId: string) => void;
  /** This week's Nutrition report (same range as "Calorías por día"). */
  onOpenCalories: () => void;
  onOpenDay: (date: string) => void;
  onOpenProgress: (target: HomeProgressTarget) => void;
  /** Active session (`/(tabs)/train/session/{id}`), never the Training hub first. */
  onOpenSession: (sessionId: string) => void;
  onRefresh: () => void;
  onRegister: (target: HomeRegisterTarget) => void;
  /** Opens the start sheet ("¿Qué entrenás hoy?"); the session starts through the shared start flow. */
  onStartWorkout: () => void;
  progressBody: HomeResource<ProgressBody>;
  progressRecords: HomeResource<ProgressTraining>;
  today: HomeResource<HistoryDay>;
  training: HomeResource<HomeTrainingWeek>;
};

function heroGradient(scheme: { heroFrom: string; heroTo: string }) {
  return `linear-gradient(150deg, ${scheme.heroFrom} 0%, ${scheme.heroTo} 100%)`;
}

/** Google account photo from the session, with the name initial on a neutral circle as fallback. */
function Avatar({ initial, url }: { initial: string | null; url: string | null }) {
  const { colors } = useOwnlevelTheme();
  const [failed, setFailed] = useState(false);
  const photo = url && !failed;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, { backgroundColor: colors.brandSubtle }]} testID="home-avatar">
      {photo ? (
        <Image accessibilityIgnoresInvertColors onError={() => setFailed(true)} source={{ uri: url }} style={styles.avatarPhoto} testID="home-avatar-photo" />
      ) : initial ? (
        <AppText style={styles.avatarInitial}>{initial}</AppText>
      ) : (
        <AppIcon color={colors.textMuted} name="profile" size={17} />
      )}
    </View>
  );
}

/** Large-title header (iOS): the date, "Hoy", and the profile photo (Perfil y Ajustes). */
function HomeHeader({ avatarUrl, date, onSettings, profile }: {
  avatarUrl: string | null; date: string; onSettings: () => void; profile: MobileHomeResponse['profile'] | undefined;
}) {
  const displayName = profile?.status === 'ok' ? profile.data.displayName : null;
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <AppText muted numberOfLines={1} variant="subheadline">{headerDate(date)}</AppText>
        <AppText accessibilityRole="header" style={styles.title}>Hoy</AppText>
      </View>
      <Pressable accessibilityLabel="Abrir perfil y ajustes" accessibilityRole="button" hitSlop={8} onPress={onSettings}
        style={({ pressed }) => [styles.avatarButton, { opacity: pressed ? 0.6 : 1 }]}>
        <Avatar initial={profileInitial(displayName)} url={avatarUrl} />
      </Pressable>
    </View>
  );
}

/** Small capsule action (Reintentar; the Training hub's Volver / Elegir rutina), never full width. */
export function Capsule({ accessibilityHint, accessibilityLabel, label, onPress, tone = 'hero' }: {
  accessibilityHint?: string; accessibilityLabel?: string; label: string; onPress: () => void; tone?: 'hero' | 'heroSoft' | 'neutral';
}) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  const palette = {
    hero: { background: colors.onBrand, text: colors.brandSurface },
    heroSoft: { background: 'rgba(18,18,20,0.12)', text: colors.onBrand },
    neutral: { background: colors.surfaceRaised, text: colors.text },
  }[tone];
  return (
    <Pressable accessibilityHint={accessibilityHint} accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="button" hitSlop={4} onPress={onPress}
      style={({ pressed }) => [styles.capsule, { backgroundColor: palette.background }, pressedStyle(pressed, reduceMotion)]}>
      <AppText style={[styles.capsuleLabel, { color: palette.text }]}>{label}</AppText>
    </Pressable>
  );
}

/** Champagne hero (brand gradient, core RN style with a solid fallback). Used by the Training hub, not by Home V3. */
export function Hero({ actions, label, subtitle, testID, title }: {
  actions: React.ReactNode; label: string; subtitle: string; testID: string; title: string;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  const scheme = brandTokens.palette[isDark ? 'dark' : 'light'];
  return (
    <View accessibilityLabel="Entrenamiento" style={[styles.hero,
      { backgroundColor: colors.brandSurface, experimental_backgroundImage: heroGradient(scheme) }]} testID={testID}>
      <View style={styles.flex}>
        <AppText style={[styles.heroLabel, { color: colors.onBrand }]}>{label}</AppText>
        <AppText accessibilityRole="header" numberOfLines={2} style={[styles.heroTitle, { color: colors.onBrand }]}>{title}</AppText>
        <AppText numeric style={[styles.heroSubtitle, { color: colors.onBrand }]}>{subtitle}</AppText>
      </View>
      <View style={styles.heroActions}>{actions}</View>
    </View>
  );
}

function durationLabel(ms: number | null): string | null {
  return ms === null ? null : `${formatInteger(Math.max(1, Math.round(ms / 60_000)))} min`;
}

function TodayHeading({ children }: { children: string }) {
  return <AppText accessibilityRole="header" variant="headline">{children}</AppText>;
}

/** Every finished routine of the day (oldest first), each row opening its real detail. */
function TrainedToday({ onOpenCompletedSession, onStartWorkout, sessions }: {
  onOpenCompletedSession: (id: string) => void; onStartWorkout: () => void; sessions: MobileHomeTodaySession[];
}) {
  return (
    <View style={styles.today} testID="home-trained-today">
      <TodayHeading>Entrenaste hoy</TodayHeading>
      <View>
        {sessions.map((session, index) => {
          const duration = durationLabel(session.durationMilliseconds);
          const detail = [duration, `${formatInteger(session.completedSets)} ${session.completedSets === 1 ? 'serie' : 'series'}`].filter(Boolean).join(' · ');
          return (
            <View key={session.id}>
              {index > 0 ? <HomeRowSeparator /> : null}
              <HomeRow accessibilityHint="Abre el detalle de la sesión" accessibilityLabel={`${session.name}. ${detail}`} chevron
                onPress={() => onOpenCompletedSession(session.id)} subtitle={detail} testID={`home-trained-${session.id}`} title={session.name} />
            </View>
          );
        })}
      </View>
      <HomeButton accessibilityHint="Elegí qué entrenar" label="+ Nueva sesión" onPress={onStartWorkout} testID="home-new-session" tone="soft" />
    </View>
  );
}

/**
 * Today's training, by priority: active session → trained today → "Arrancar rutina"
 * (opens the start sheet; with no routines the sheet offers creating one or training free).
 */
function TodayTraining({ home, now, onOpenCompletedSession, onOpenSession, onRefresh, onStartWorkout }: {
  home: MobileHomeResponse | undefined; now: () => number; onOpenCompletedSession: (id: string) => void;
  onOpenSession: (id: string) => void; onRefresh: () => void; onStartWorkout: () => void;
}) {
  if (!home) return <SkeletonBlock height={50} style={styles.skeleton} />;
  const { activeSession, week } = home.training;

  if (activeSession.status === 'unavailable') {
    return (
      <View accessibilityLabel="Entrenamiento" style={styles.today} testID="home-training-unavailable">
        <View>
          <TodayHeading>Estado no disponible</TodayHeading>
          <AppText muted variant="subheadline">No pudimos verificar si tenés una sesión en curso.</AppText>
        </View>
        <Button label="Reintentar" onPress={onRefresh} variant="secondary" />
      </View>
    );
  }

  const active = activeSession.data;
  if (active) {
    const detail = `${elapsedMinutes(active.startedAt, now())} min · ${active.exercisesCompleted} de ${active.totalExercises} ejercicios`;
    return (
      <View style={styles.today} testID="home-active-session">
        <TodayHeading>Sesión en curso</TodayHeading>
        <HomeRow accessibilityHint="Vuelve a la sesión" accessibilityLabel={`${active.name}. ${detail}`} chevron onPress={() => onOpenSession(active.id)}
          subtitle={detail} testID="home-active-row" title={active.name} />
        <HomeButton label="Volver a la sesión" onPress={() => onOpenSession(active.id)} testID="home-active-resume" tone="solid" />
      </View>
    );
  }

  const doneToday = week.status === 'ok' ? [...week.data.todaySessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) : [];
  if (doneToday.length) {
    return <TrainedToday onOpenCompletedSession={onOpenCompletedSession} onStartWorkout={onStartWorkout} sessions={doneToday} />;
  }
  return <HomeButton accessibilityHint="Elegí qué entrenar hoy" label="Arrancar rutina" onPress={onStartWorkout} testID="home-start-routine" tone="solid" />;
}

function OfflineNotice({ confirmedAt, now, onRetry }: { confirmedAt: number; now: () => number; onRetry: () => void }) {
  const { colors } = useOwnlevelTheme();
  return (
    <View accessibilityRole="alert" style={styles.notice} testID="home-offline">
      <AppIcon color={colors.textMuted} name="warning" size={20} />
      <View style={styles.flex}>
        <AppText variant="headline">Uy, no pudimos actualizar</AppText>
        <AppText muted variant="footnote">
          Te mostramos lo último que cargó, de {readAge(confirmedAt, now())}. Tus datos están guardados.
        </AppText>
      </View>
      <Capsule label="Reintentar" onPress={onRetry} tone="neutral" />
    </View>
  );
}

export function HomeDashboard(props: HomeDashboardProps) {
  const { avatarUrl, calories, day, home, onNavigate, onRefresh, today, training } = props;
  const now = props.now ?? Date.now;
  const data = home.data;
  const stale = home.status === 'unavailable' && !!data;
  const date = data?.date ?? day.today;
  const weekStart = data?.training.week.status === 'ok' ? data.training.week.data.summary.weekStart : day.weekStart;
  return (
    <View style={styles.dashboard} testID="real-home-dashboard">
      <HomeGutter style={styles.top}>
        <HomeHeader avatarUrl={avatarUrl} date={date} onSettings={() => onNavigate('settings')} profile={data?.profile} />
        {stale && home.confirmedAt !== null ? <OfflineNotice confirmedAt={home.confirmedAt} now={now} onRetry={onRefresh} /> : null}
      </HomeGutter>
      {/* sectionGap is the visible gap: blocks that open with a 44 pt section header take its slack off. */}
      <View style={stale && styles.stale}>
        <HomeGutter>
          <TodayTraining home={data} now={now} onOpenCompletedSession={props.onOpenCompletedSession}
            onOpenSession={props.onOpenSession} onRefresh={onRefresh} onStartWorkout={props.onStartWorkout} />
        </HomeGutter>
        <View style={styles.beforeBand}>
          <HomeNutrition home={home} onConfigure={props.onConfigureNutrition} onMealEntry={props.onMealEntry} today={today} />
        </View>
        <View style={styles.afterBand}>
          <HomeWeek calories={calories} habits={props.habits} onOpenHabit={props.onOpenHabit} onMetrics={() => props.onRegister({ kind: 'more' })} onOpenCalories={props.onOpenCalories} onOpenDay={props.onOpenDay} onProgress={() => onNavigate('progress')} today={date}
            training={training} week={data?.training.week} weekStart={weekStart} />
        </View>
        <View style={styles.headedBlock}><HomeRegister date={day.today} onRegister={props.onRegister} today={today} /></View>
        <View style={styles.headedBlock}>
          <HomeProgress body={props.progressBody} date={day.today} onAll={() => onNavigate('progress')}
            onOpen={props.onOpenProgress} onRetry={onRefresh} records={props.progressRecords} />
        </View>
      </View>
    </View>
  );
}

const AVATAR = 44;

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', borderRadius: radius.full, height: AVATAR, justifyContent: 'center', overflow: 'hidden', width: AVATAR },
  avatarButton: { marginBottom: 2 },
  avatarInitial: { fontSize: 17, fontWeight: '600' },
  avatarPhoto: { height: AVATAR, width: AVATAR },
  afterBand: { marginTop: homeLayout.band.gapAfter - HEADER_SLACK },
  beforeBand: { marginTop: homeLayout.band.gapBefore },
  capsule: { alignItems: 'center', borderRadius: radius.full, justifyContent: 'center', minHeight: 34, paddingHorizontal: 14 },
  capsuleLabel: { fontSize: 14, fontWeight: '600' },
  dashboard: { gap: homeLayout.headerToToday },
  flex: { flex: 1, minWidth: 0 },
  headedBlock: { marginTop: homeLayout.sectionGap - HEADER_SLACK },
  header: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  hero: { alignItems: 'center', borderRadius: radius.card, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, overflow: 'hidden', paddingHorizontal: spacing.lg, paddingVertical: 14 },
  heroActions: { flexDirection: 'row', gap: spacing.sm },
  heroLabel: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  heroSubtitle: { fontSize: 13, opacity: 0.75 },
  heroTitle: { fontSize: 20, fontWeight: '700', lineHeight: 25, marginTop: 1 },
  notice: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  skeleton: { borderRadius: radius.button },
  stale: { opacity: 0.6 },
  top: { gap: spacing.md },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.4, lineHeight: 41 },
  today: { gap: spacing.sm },
});
