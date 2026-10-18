import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, ScrollView, StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SessionDetailDto, SessionFinishedDto } from '@/api/active-session';
import type { SessionSummaryDto, SessionSummaryLoader } from '@/api/session-summary';
import { AppIcon, AppText, brandTokens, Button, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { FeelingDots } from './feeling-dots';
import type { FinishWeek } from './finish-week';
import { FinishWeekIntro } from './finish-week-intro';
import { postWorkoutModel, type PostWorkoutHero } from './post-workout-model';
import { revisitModel } from './session-revisit-model';

export type FinishWeekLoader = () => Promise<FinishWeek | null>;
const { fast, base } = brandTokens.motion.duration;
const spring = brandTokens.motion.spring;
const light = brandTokens.palette.light;
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

type PostWorkoutProps = {
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
  useEffect(() => { if (!reduced) progress.set(withDelay(220, withTiming(1, { duration: 700 }))); }, [progress, reduced]);
  const whole = Number.isInteger(from) && Number.isInteger(to);
  const final = `${formatLoad(to)} ${unit} × ${reps}`;
  const props = useAnimatedProps(() => {
    const raw = from + (to - from) * progress.get();
    const shown = progress.get() >= 1 ? to : whole ? Math.round(raw) : Math.round(raw * 2) / 2;
    const text = `${formatLoad(shown)} ${unit} × ${reps}`;
    return { text, defaultValue: text };
  });
  const style = [brandTokens.typeScale.largeTitle, styles.mark, { color }];
  return reduced ? <AppText numeric variant="largeTitle" style={{ color }}>{final}</AppText>
    : <AnimatedInput accessibilityLabel={final} editable={false} defaultValue={final} animatedProps={props} style={style} underlineColorAndroid="transparent" />;
}

/** The champagne block, only when true. A record pops (trophy, haptic, count-up and one sheen); an improvement just arrives. */
function HeroCard({ hero }: { hero: PostWorkoutHero }) {
  const reduced = useReduceMotion();
  const trophy = useSharedValue(reduced ? 1 : 0), sheen = useSharedValue(0);
  const [width, setWidth] = useState(0);
  const record = hero.kind === 'record';
  useEffect(() => {
    if (!record) { trophy.set(1); return; }
    const timer = setTimeout(() => triggerHaptic('personalRecord'), 260);
    if (!reduced) {
      trophy.set(withDelay(200, withSequence(withSpring(1.3, { ...spring, stiffness: 320 }), withSpring(1, spring))));
      sheen.set(withDelay(650, withTiming(1, { duration: 900 })));
    }
    return () => clearTimeout(timer);
  }, [record, reduced, sheen, trophy]);
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: trophy.get() }] }));
  const sweep = useAnimatedStyle(() => ({ opacity: sheen.get() > 0 && sheen.get() < 1 ? 1 : 0, transform: [{ translateX: -width + 2 * width * sheen.get() }, { rotate: '18deg' }] }));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return <Animated.View entering={reduced ? FadeIn.duration(fast) : FadeInDown.delay(60).springify().damping(spring.damping).stiffness(spring.stiffness)}
    style={styles.heroShadow} testID={`post-workout-hero-${hero.kind}`}>
    <View style={styles.hero} onLayout={onLayout}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.heroGlow]} />
      {record && !reduced && width ? <Animated.View pointerEvents="none" style={[styles.sheen, { width: width * 0.45 }, sweep]} /> : null}
      <View style={styles.heroTitle}>
        <Animated.View style={icon}><AppIcon name={record ? 'trophy' : 'progress'} color={light.onHero} size={20} /></Animated.View>
        <AppText variant="headline" style={styles.onHero}>{hero.title}</AppText>
      </View>
      {hero.kind === 'record' ? <>
        <AppText variant="headline" style={[styles.soft, styles.onHero]}>{hero.name}</AppText>
        <CountUp {...hero.count} color={light.onHero} />
        <AppText numeric variant="footnote" style={styles.onHero}>{[hero.before, hero.more].filter(Boolean).join(' ')}</AppText>
      </> : <>
        <AppText variant="headline" style={[styles.soft, styles.onHero]}>{hero.count}</AppText>
        <AppText variant="title2" style={styles.onHero}>{hero.names}</AppText>
        {hero.rest ? <AppText variant="footnote" style={styles.onHero}>{hero.rest}</AppText> : null}
      </>}
    </View>
  </Animated.View>;
}

/**
 * SF2/SF3 · the confirmed receipt. The week intro plays first; as it leaves, the page comes up: "{rutina} guardado", the
 * record or improvement block (only when true), every exercise with how it went against the last time, what was added to
 * the routine and the feelings. Auxiliary reads never gate success or manufacture empty or zero values.
 */
export function PostWorkoutContent({ finished, detail, readSummary, readWeek, onHome, onViewSession }: PostWorkoutProps) {
  const insets = useSafeAreaInsets(), reduced = useReduceMotion(), { colors } = useOwnlevelTheme();
  const [summary, setSummary] = useState<SessionSummaryDto>();
  const [week, setWeek] = useState<FinishWeek | null | undefined>(undefined);
  const [intro, setIntro] = useState(Boolean(readWeek)), [revealed, setRevealed] = useState(!readWeek);
  const model = postWorkoutModel(finished, summary, detail);
  const exercises = detail?.session.id === finished.sessionId ? revisitModel(detail, summary).exercises : null;
  useEffect(() => { AccessibilityInfo.announceForAccessibility(model.title); }, [model.title]);
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
  return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="post-workout-screen">
    {revealed ? <>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={enter(0)} style={styles.header}>
          <AppText accessibilityRole="header" variant="largeTitle">{model.title}</AppText>
          <AppText muted numeric variant="subheadline" testID="post-workout-line">{model.line}</AppText>
        </Animated.View>
        {model.hero ? <HeroCard hero={model.hero} /> : null}
        {exercises?.length ? <View testID="post-workout-exercises">
          <Animated.View entering={enter(2)}><AppText muted variant="footnote" style={styles.section}>Ejercicios</AppText></Animated.View>
          {exercises.map((exercise, index) => {
            const status = exercise.status, record = status?.kind === 'record';
            return <Animated.View key={exercise.id} entering={enter(3 + index)}
              style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`post-workout-exercise-${exercise.id}`}>
              <View style={styles.lead}>{record ? <AppIcon name="trophy" color={colors.primary} size={17} /> : null}</View>
              <View style={styles.flex}>
                <AppText variant="headline" style={exercise.done ? null : { color: colors.textMuted }}>{exercise.name}</AppText>
                <AppText muted numeric variant="footnote">{exercise.line}</AppText>
              </View>
              {status ? <Animated.View entering={FadeIn.duration(base)} style={styles.status}>
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
      </ScrollView>
      <Animated.View entering={enter(1)} style={styles.footer}>
        <Button label="Listo" onPress={onHome} />
        <Button label="Ver sesión" variant="quiet" onPress={onViewSession} />
      </Animated.View>
    </> : null}
    {intro ? <FinishWeekIntro week={week} onLeave={reveal} onDone={endIntro} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, flex: { flex: 1 }, italic: { fontStyle: 'italic' }, soft: { fontWeight: '500' }, strong: { fontWeight: '600' }, right: { textAlign: 'right' },
  content: { paddingHorizontal: brandTokens.space.md, paddingTop: brandTokens.space.xxl, paddingBottom: brandTokens.space.xl, gap: brandTokens.space.xl },
  header: { gap: brandTokens.space.xxs },
  heroShadow: { borderRadius: brandTokens.radius.card, shadowColor: light.heroTo, shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  hero: { borderRadius: brandTokens.radius.card, padding: brandTokens.layout.cardPadding, gap: brandTokens.space.xxs, overflow: 'hidden', backgroundColor: light.heroFrom,
    experimental_backgroundImage: `linear-gradient(150deg, ${light.heroFrom} 0%, ${brandTokens.palette.dark.accent} 40%, ${light.heroTo} 100%)` },
  heroGlow: { experimental_backgroundImage: 'radial-gradient(circle at 8% 0%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 38%)' },
  sheen: { position: 'absolute', top: -40, bottom: -40, experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 100%)' },
  heroTitle: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.xs, marginBottom: brandTokens.space.xxs },
  onHero: { color: light.onHero },
  mark: { padding: 0, fontVariant: ['tabular-nums'] },
  section: { fontWeight: '600', marginBottom: brandTokens.space.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm, paddingVertical: brandTokens.space.sm, minHeight: 56 },
  lead: { width: 20, alignItems: 'center' }, status: { flexShrink: 1, maxWidth: '45%' },
  feelings: { borderRadius: brandTokens.radius.inner, padding: brandTokens.space.md, gap: brandTokens.space.sm },
  feelingRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: brandTokens.space.xl, rowGap: brandTokens.space.sm },
  footer: { padding: brandTokens.space.md, gap: brandTokens.space.xxs },
});
