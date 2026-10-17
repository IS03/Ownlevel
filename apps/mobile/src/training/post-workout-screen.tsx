import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SessionDetailDto, SessionFinishedDto } from '@/api/active-session';
import type { SessionSummaryDto, SessionSummaryLoader } from '@/api/session-summary';
import { AppIcon, AppText, brandTokens, Button, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { FeelingDots } from './feeling-dots';
import type { FinishWeek } from './finish-week';
import { FinishWeekIntro } from './finish-week-intro';
import { postWorkoutModel } from './post-workout-model';

export type FinishWeekLoader = () => Promise<FinishWeek | null>;
/** How long the receipt waits for the prefetched week before skipping the intro (never a fake week). */
const WEEK_WAIT_MS = 900;
const { fast, base } = brandTokens.motion.duration;

type PostWorkoutProps = {
  finished: SessionFinishedDto; detail?: SessionDetailDto; readSummary?: SessionSummaryLoader; readWeek?: FinishWeekLoader;
  onHome: () => void; onViewSession: () => void;
};
/** Standalone presentation, for a finish confirmed outside the finish sheet (e.g. a recovered intent). */
export function PostWorkoutScreen(props: PostWorkoutProps) {
  return <Modal visible presentationStyle="fullScreen" animationType="fade" onRequestClose={props.onViewSession}><PostWorkoutContent {...props} /></Modal>;
}

/**
 * SF2/SF3 · the confirmed receipt. The week intro plays first (when its read is ready), then the page:
 * "{rutina} guardado", the record or improvement block (only when true), what improved and what was added, and the feelings.
 * Auxiliary reads never gate success or manufacture empty or zero values.
 */
export function PostWorkoutContent({ finished, detail, readSummary, readWeek, onHome, onViewSession }: PostWorkoutProps) {
  const insets = useSafeAreaInsets(), reduced = useReduceMotion(), { colors } = useOwnlevelTheme();
  const [summary, setSummary] = useState<SessionSummaryDto>();
  const [phase, setPhase] = useState<'waiting' | 'week' | 'page'>(readWeek ? 'waiting' : 'page');
  const [week, setWeek] = useState<FinishWeek | null>(null);
  const model = postWorkoutModel(finished, summary, detail);
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
    const skip = () => { if (live) setPhase(current => current === 'waiting' ? 'page' : current); };
    const timer = setTimeout(skip, WEEK_WAIT_MS);
    void readWeek().then(value => {
      if (!live || !value) { skip(); return; }
      setWeek(value); setPhase(current => current === 'waiting' ? 'week' : current);
    }, skip);
    return () => { live = false; clearTimeout(timer); };
  }, [readWeek]);
  const showPage = useCallback(() => setPhase('page'), []);
  const fade = FadeIn.duration(reduced ? fast : base);
  const hero = model.hero;
  return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="post-workout-screen">
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <AppText accessibilityRole="header" variant="largeTitle">{model.title}</AppText>
        <AppText muted numeric variant="subheadline" testID="post-workout-line">{model.line}</AppText>
      </View>
      {hero ? <Animated.View entering={fade} style={[styles.hero, { backgroundColor: colors.brandSurface }]} testID={`post-workout-hero-${hero.kind}`}>
        <View style={styles.heroTitle}>
          <AppIcon name={hero.kind === 'record' ? 'trophy' : 'progress'} color={colors.onBrand} size={20} />
          <AppText variant="headline" style={{ color: colors.onBrand }}>{hero.title}</AppText>
        </View>
        {hero.kind === 'record' ? <>
          <AppText variant="headline" style={[styles.soft, { color: colors.onBrand }]}>{hero.name}</AppText>
          <AppText numeric variant="largeTitle" style={{ color: colors.onBrand }}>{hero.mark}</AppText>
          <AppText numeric variant="footnote" style={{ color: colors.onBrand }}>{[hero.before, hero.more].filter(Boolean).join(' ')}</AppText>
        </> : <>
          <AppText variant="headline" style={[styles.soft, { color: colors.onBrand }]}>{hero.count}</AppText>
          <AppText variant="title2" style={{ color: colors.onBrand }}>{hero.names}</AppText>
          {hero.rest ? <AppText variant="footnote" style={{ color: colors.onBrand }}>{hero.rest}</AppText> : null}
        </>}
      </Animated.View> : null}
      {model.rows.length ? <Animated.View entering={fade} testID="post-workout-rows">
        {model.rows.map((row, index) => <View key={row.id} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
          testID={`post-workout-row-${row.kind}`}>
          <View style={styles.lead}>{row.kind === 'improvement' ? <AppText muted variant="title2" accessibilityLabel="Mejoró">↗</AppText>
            : <AppIcon name="plus" color={colors.textMuted} size={20} />}</View>
          <View style={styles.flex}><AppText variant="headline">{row.title}</AppText><AppText muted numeric variant="footnote">{row.detail}</AppText></View>
        </View>)}
      </Animated.View> : null}
      {model.feelings.length || model.note ? <View style={[styles.feelings, { backgroundColor: colors.surfaceRaised }]} testID="post-workout-feelings">
        {model.feelings.length ? <View style={styles.feelingRow}>{model.feelings.map(feeling => <FeelingDots key={feeling.key} feeling={feeling} />)}</View> : null}
        {model.note ? <AppText style={styles.italic}>“{model.note}”</AppText> : null}
      </View> : null}
    </ScrollView>
    <View style={styles.footer}>
      <Button label="Listo" onPress={onHome} />
      <Button label="Ver sesión" variant="quiet" onPress={onViewSession} />
    </View>
    {phase === 'waiting' ? <View style={[StyleSheet.absoluteFill, styles.waiting]} testID="finish-week-waiting" /> : null}
    {phase === 'week' && week ? <FinishWeekIntro week={week} onDone={showPage} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, flex: { flex: 1 }, italic: { fontStyle: 'italic' }, soft: { fontWeight: '500' },
  content: { paddingHorizontal: brandTokens.space.md, paddingTop: brandTokens.space.xxl, paddingBottom: brandTokens.space.xl, gap: brandTokens.space.xl },
  header: { gap: brandTokens.space.xxs },
  hero: { borderRadius: brandTokens.radius.card, padding: brandTokens.layout.cardPadding, gap: brandTokens.space.xxs,
    experimental_backgroundImage: `linear-gradient(160deg, ${brandTokens.palette.light.heroFrom} 0%, ${brandTokens.palette.light.heroTo} 100%)` },
  heroTitle: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.xs, marginBottom: brandTokens.space.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm, paddingVertical: brandTokens.space.sm, minHeight: 56 },
  lead: { width: 24, alignItems: 'center' },
  feelings: { borderRadius: brandTokens.radius.inner, padding: brandTokens.space.md, gap: brandTokens.space.sm },
  feelingRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: brandTokens.space.xl, rowGap: brandTokens.space.sm },
  waiting: { backgroundColor: brandTokens.palette.light.heroFrom },
  footer: { padding: brandTokens.space.md, gap: brandTokens.space.xxs },
});
