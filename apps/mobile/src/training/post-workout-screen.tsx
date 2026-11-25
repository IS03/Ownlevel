import { useRouter } from 'expo-router';
import { insightsSessionHref } from '@/insights/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SessionDetailDto, SessionFinishedDto } from '@/api/active-session';
import type { SessionSummaryDto, SessionSummaryLoader } from '@/api/session-summary';
import { LinkRow, AppIcon, AppText, GlassSurface, brandTokens, pressedStyle, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { atmosphere, glowGradient } from '@/design-system/atmosphere';
import { haptics, triggerHaptic } from '@/platform/haptics';
import { FeelingDots } from './feeling-dots';
import { RecordedTrainingFeelings } from './recorded-training-feelings';
import type { FeelingsResponse } from '../../../../src/lib/mobile-api/training-feelings-contract';
import type { FinishWeek } from './finish-week';
import { FinishWeekIntro } from './finish-week-intro';
import { postWorkoutModel, type PostWorkoutHero } from './post-workout-model';
import { revisitModel } from './session-revisit-model';

export type FinishWeekLoader = () => Promise<FinishWeek | null>;
const { fast, base } = brandTokens.motion.duration;
const spring = brandTokens.motion.spring;
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

type PostWorkoutProps = {
  feelings?: FeelingsResponse['values'];
  finished: SessionFinishedDto; detail?: SessionDetailDto; readSummary?: SessionSummaryLoader; readWeek?: FinishWeekLoader;
  onHome: () => void; onViewSession: () => void;
};
/** Standalone presentation, for a finish confirmed outside the finish sheet (e.g. a recovered intent). */
export function PostWorkoutScreen(props: PostWorkoutProps) {
  return <Modal visible presentationStyle="fullScreen" animationType="fade" onRequestClose={props.onViewSession}><PostWorkoutContent {...props} /></Modal>;
}

function formatLoad(value: number) {
  'worklet';
  const [whole, decimal] = String(Math.round(value * 100) / 100).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (decimal ? `,${decimal}` : '');
}
/** The record load counts up from the previous best; whole steps (or half steps for decimal loads) read as real marks. */
function CountUp({ from, to, unit, reps, color }: { from: number; to: number; unit: string; reps: number; color: string }) {
  const reduced = useReduceMotion(), progress = useSharedValue(reduced ? 1 : 0);
  // A text input never wraps: with large text the mark is plain text that wraps instead of being cut.
  const { fontScale } = useWindowDimensions();
  const still = reduced || fontScale > 1.3;
  useEffect(() => { if (!still) progress.set(withDelay(220, withTiming(1, { duration: 700 }))); else progress.set(1); }, [progress, still]);
  const whole = Number.isInteger(from) && Number.isInteger(to);
  const final = `${formatLoad(to)} ${unit} × ${reps}`;
  const props = useAnimatedProps(() => {
    const raw = from + (to - from) * progress.get();
    const shown = progress.get() >= 1 ? to : whole ? Math.round(raw) : Math.round(raw * 2) / 2;
    const text = `${formatLoad(shown)} ${unit} × ${reps}`;
    return { text, defaultValue: text };
  });
  const style = [brandTokens.typeScale.largeTitle, styles.mark, { color }];
  return still ? <AppText numeric variant="largeTitle" style={{ color }}>{final}</AppText>
    : <AnimatedInput accessibilityLabel={final} editable={false} defaultValue={final} animatedProps={props} style={style} underlineColorAndroid="transparent" />;
}

/**
 * The record or improvement, only when true, on Progreso's band: the theme surface with the brand glow and a fine border.
 * The trophy and the mark carry the accent; «Antes» stays secondary. A record pops (trophy, haptic and count-up).
 */
function HeroCard({ hero }: { hero: PostWorkoutHero }) {
  const reduced = useReduceMotion(), { colors, isDark } = useOwnlevelTheme();
  const trophy = useSharedValue(reduced ? 1 : 0);
  const record = hero.kind === 'record';
  useEffect(() => {
    if (!record) { trophy.set(1); return; }
    const timer = setTimeout(() => triggerHaptic('personalRecord'), 260);
    if (!reduced) trophy.set(withDelay(200, withSequence(withSpring(1.3, { ...spring, stiffness: 320 }), withSpring(1, spring))));
    return () => clearTimeout(timer);
  }, [record, reduced, trophy]);
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: trophy.get() }] }));
  return <Animated.View entering={reduced ? FadeIn.duration(fast) : FadeInDown.delay(60).springify().damping(spring.damping).stiffness(spring.stiffness)}
    style={[styles.hero, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, experimental_backgroundImage: glowGradient(atmosphere[isDark ? 'dark' : 'light'].band) }]}
    testID={`post-workout-hero-${hero.kind}`}>
    <View style={styles.heroTitle}>
      <Animated.View style={icon}><AppIcon name={record ? 'trophy' : 'progress'} color={record ? colors.primary : colors.textMuted} size={20} /></Animated.View>
      <AppText variant="headline">{hero.title}</AppText>
    </View>
    {hero.kind === 'record' ? <>
      <AppText variant="headline" style={styles.soft}>{hero.name}</AppText>
      <CountUp {...hero.count} color={colors.primary} />
      <AppText muted numeric variant="footnote">{[hero.before, hero.more].filter(Boolean).join(' ')}</AppText>
    </> : <>
      <AppText muted variant="headline" style={styles.soft}>{hero.count}</AppText>
      <AppText variant="title2">{hero.names}</AppText>
      {hero.rest ? <AppText muted variant="footnote">{hero.rest}</AppText> : null}
    </>}
  </Animated.View>;
}

/** «Listo» in the fixed bar: compact, always reachable while the receipt scrolls (Glass: a control). */
function DoneButton({ onPress }: { onPress: () => void }) {
  const { colors } = useOwnlevelTheme(), reduceMotion = useReduceMotion();
  return <GlassSurface interactive style={styles.done}>
    <Pressable accessibilityRole="button" accessibilityLabel="Listo" onPress={onPress} hitSlop={6} testID="post-workout-done"
      style={({ pressed }) => [styles.done, styles.donePress, pressedStyle(pressed, reduceMotion)]}>
      <AppText variant="headline" style={{ color: colors.primary }}>Listo</AppText>
    </Pressable>
  </GlassSurface>;
}

const RULE = 'Cada ejercicio se compara con la última vez que lo hiciste con el mismo modo de carga. Comparaciones, en Progreso, mira además el implemento y la variante, así que puede leer distinto.';

/**
 * SF2/SF3 · the confirmed receipt. The week intro plays first; as it leaves, the page comes up: the routine's name, the
 * record or improvement block (only when true), every exercise with how it went against the last time, what was added to
 * the routine and the feelings. Auxiliary reads never gate success or manufacture empty or zero values.
 */
export function PostWorkoutContent({ finished, detail, readSummary, readWeek, onHome, onViewSession, feelings }: PostWorkoutProps) {
  const reduced = useReduceMotion(), { colors } = useOwnlevelTheme();
  const [summary, setSummary] = useState<SessionSummaryDto>();
  const router = useRouter();
  const insights = insightsSessionHref(finished.sessionId, finished.logDate);
  const [week, setWeek] = useState<FinishWeek | null | undefined>(undefined);
  const [intro, setIntro] = useState(Boolean(readWeek)), [revealed, setRevealed] = useState(!readWeek);
  const model = postWorkoutModel(finished, summary, detail);
  const exercises = detail?.session.id === finished.sessionId ? revisitModel(detail, summary).exercises : null;
  const [scrolled, setScrolled] = useState(false);
  // The top is owned here, outside the scroll: inside the finish sheet's transparent modal the native measurement can come
  // late, so the device's own inset is the floor (portrait only). Nothing can then sit under the Dynamic Island.
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0);
  useEffect(() => { AccessibilityInfo.announceForAccessibility(model.announcement); }, [model.announcement]);
  useEffect(() => {
    if (!readSummary) return;
    const abort = new AbortController();
    void Promise.resolve().then(() => readSummary(abort.signal)).then(result => {
      if (!abort.signal.aborted && result.status === 'ok' && result.data.sessionId === finished.sessionId) setSummary(result.data);
    }).catch(() => undefined);
    return () => abort.abort();
  }, [finished.sessionId, readSummary]);
  useEffect(() => {
    if (!readWeek) return;
    let live = true;
    void readWeek().then(value => { if (live) setWeek(value); }, () => { if (live) setWeek(null); });
    return () => { live = false; };
  }, [readWeek]);
  const reveal = useCallback(() => setRevealed(true), []), endIntro = useCallback(() => setIntro(false), []);
  const enter = (step: number) => reduced ? FadeIn.duration(fast) : FadeInDown.delay(step * 45).duration(base);
  const rows = exercises ? model.rows.filter(row => row.kind === 'added') : model.rows;
  // The device's own safe area, measured natively: the inherited insets include the tab bar, which this full screen covers.
  return <SafeAreaView edges={['bottom']} style={[styles.screen, { backgroundColor: colors.background, paddingTop: top }]} testID="post-workout-screen">
    {revealed ? <>
      <Animated.View entering={enter(0)} style={[styles.bar, scrolled && { borderBottomColor: colors.border }]} testID="post-workout-bar">
        <DoneButton onPress={onHome} />
      </Animated.View>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false} scrollEventThrottle={32} onScroll={event => setScrolled(event.nativeEvent.contentOffset.y > 0)}
        contentContainerStyle={styles.content} testID="post-workout-scroll">
        <Animated.View entering={enter(0)} style={styles.header}>
          <AppText accessibilityRole="header" variant="largeTitle">{model.title}</AppText>
          <AppText muted numeric variant="subheadline" testID="post-workout-line">{model.line}</AppText>
        </Animated.View>
        {model.hero ? <HeroCard hero={model.hero} /> : null}
        {exercises?.length ? <View testID="post-workout-exercises">
          <Animated.View entering={enter(2)} style={styles.sectionRow}>
            <AppText muted variant="footnote" style={[styles.section, styles.flex]}>Ejercicios</AppText>
            {/* These marks are the receipt's own rule, not Insights' comparison: one tap away, only when there are marks. */}
            {exercises.some(exercise => exercise.status) ? <Pressable accessibilityRole="button" accessibilityLabel="Cómo se comparan los ejercicios" hitSlop={8}
              onPress={() => { haptics.selection(); Alert.alert('Cómo se comparan', RULE, [{ text: 'Listo', style: 'cancel' }]); }}
              style={styles.info} testID="post-workout-rule">
              <AppIcon name="info" color={colors.textMuted} size={17} />
            </Pressable> : null}
          </Animated.View>
          {exercises.map((exercise, index) => {
            const status = exercise.status, record = status?.kind === 'record';
            return <Animated.View key={exercise.id} entering={enter(3 + index)}
              style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`post-workout-exercise-${exercise.id}`}>
              <View style={styles.flex}>
                <AppText variant="headline" style={exercise.done ? null : { color: colors.textMuted }}>{exercise.name}</AppText>
                <AppText muted numeric variant="footnote">{exercise.line}</AppText>
              </View>
              {status ? <Animated.View entering={FadeIn.duration(base)} style={styles.status}>
                {record ? <AppIcon name="trophy" color={colors.primary} size={15} /> : null}
                <AppText numeric variant="subheadline" style={[{ color: record ? colors.primary : status.kind === 'improved' ? colors.text : colors.textMuted }, record && styles.strong, styles.right]}>
                  {status.label}</AppText></Animated.View> : null}
            </Animated.View>;
          })}
        </View> : null}
        {rows.length ? <View testID="post-workout-rows">
          {rows.map((row, index) => <Animated.View key={row.id} entering={enter(4 + (exercises?.length ?? 0) + index)}
            style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`post-workout-row-${row.kind}`}>
            <View style={styles.lead}>{row.kind === 'improvement' ? <AppText muted variant="title2" accessibilityLabel="Mejoró">↗</AppText>
              : <AppIcon name="plus" color={colors.textMuted} size={20} />}</View>
            <View style={styles.flex}><AppText variant="headline">{row.title}</AppText><AppText muted numeric variant="footnote">{row.detail}</AppText></View>
          </Animated.View>)}
        </View> : null}
        {model.feelings.length || model.note ? <Animated.View entering={enter(5 + (exercises?.length ?? 0))} style={[styles.feelings, { backgroundColor: colors.surfaceRaised }]} testID="post-workout-feelings">
          {model.feelings.length ? <View style={styles.feelingRow}>{model.feelings.map(feeling => <FeelingDots key={feeling.key} feeling={feeling} />)}</View> : null}
          {model.note ? <AppText style={styles.italic}>“{model.note}”</AppText> : null}
        </Animated.View> : null}
        {feelings ? <RecordedTrainingFeelings values={feelings} session={{ startedAt: finished.startedAt, endedAt: finished.endedAt }} /> : null}
        {feelings && finished.routineId && finished.routineAdditions === undefined ? <AppText muted variant="footnote">El detalle de lo agregado a la rutina no está disponible en esta confirmación. Podés revisar tu rutina.</AppText> : null}
        <View testID="post-workout-links">
          <LinkRow label="Ver sesión" onPress={onViewSession} />
          {/* Facts of this session only, read when it opens: nothing about all-time relations runs at the end of a workout. */}
          {insights ? <LinkRow label="Ver qué cambió" onPress={() => {
            router.replace({ pathname: '/(tabs)/train/history/[id]', params: { id: finished.sessionId } });
            router.push(insights);
          }} /> : null}
        </View>
      </ScrollView>
    </> : null}
    {intro ? <FinishWeekIntro week={week} onLeave={reveal} onDone={endIntro} /> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, flex: { flex: 1 }, italic: { fontStyle: 'italic' }, soft: { fontWeight: '500' }, strong: { fontWeight: '600' }, right: { textAlign: 'right' },
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: brandTokens.space.md, paddingVertical: brandTokens.space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  done: { borderRadius: brandTokens.radius.full, minHeight: brandTokens.layout.minTouch, justifyContent: 'center' },
  donePress: { paddingHorizontal: brandTokens.space.md },
  content: { paddingHorizontal: brandTokens.space.md, paddingTop: brandTokens.space.xs, paddingBottom: brandTokens.space.xl, gap: brandTokens.space.xl },
  header: { gap: brandTokens.space.xxs },
  hero: { borderRadius: brandTokens.radius.card, padding: brandTokens.layout.cardPadding, gap: brandTokens.space.xxs, borderWidth: StyleSheet.hairlineWidth },
  heroTitle: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.xs, marginBottom: brandTokens.space.xxs },
  mark: { padding: 0, fontVariant: ['tabular-nums'] },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: brandTokens.space.xxs },
  section: { fontWeight: '600' },
  info: { minWidth: brandTokens.layout.minTouch, minHeight: brandTokens.layout.minTouch, alignItems: 'flex-end', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm, paddingVertical: brandTokens.space.sm, minHeight: 56 },
  lead: { width: 20, alignItems: 'center' }, status: { flexShrink: 1, maxWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.xxs },
  feelings: { borderRadius: brandTokens.radius.inner, padding: brandTokens.space.md, gap: brandTokens.space.sm },
  feelingRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: brandTokens.space.xl, rowGap: brandTokens.space.sm },
});
