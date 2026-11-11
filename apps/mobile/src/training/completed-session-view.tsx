import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { insightsSessionHref } from '@/insights/navigation';
import Animated, { FadeIn, LinearTransition, useAnimatedRef } from 'react-native-reanimated';
import type { ExerciseConfigurationJournal } from '@/api/training-exercise-configuration';
import type { SessionDetailDto, SessionFinishedDto } from '@/api/active-session';
import type { SessionSummaryDto, SessionSummaryLoader } from '@/api/session-summary';
import { AppIcon, AppText, brandTokens, Button, Heading, ScrollScreen, Surface, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { formatTimeRange } from '@/home/format';
import { compactWeekdayDate } from './history-model';
import { trainingRoutineColor } from './routine-colors';
import { completedSessionModel } from './completed-session-model';
import { revisitModel, type RevisitExercise } from './session-revisit-model';
import { FeelingDots } from './feeling-dots';
import { PostWorkoutScreen } from './post-workout-screen';
import { SessionVariantsNotice, SessionVariantsSection } from './exercise-variant';

const FIRST_EXERCISES = 4;
/** #475: the summary opens with the three groups that took the most completed sets; the rest stay one tap away. */
const FIRST_MUSCLES = 3;

function ExerciseRow({ exercise, open, first, onToggle, onOpenExercise }: {
  exercise: RevisitExercise; open: boolean; first: boolean; onToggle: () => void; onOpenExercise?: (exerciseId: string) => void;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion(), { fontScale } = useWindowDimensions();
  const status = exercise.status, record = status?.kind === 'record';
  const statusColor = record ? colors.primary : status?.kind === 'improved' ? colors.text : colors.textMuted;
  // Large text: the status goes under the name; otherwise it never takes more than its share of the row.
  const large = fontScale > 1.3;
  const statusText = status ? <View style={[styles.statusRow, !large && styles.status]}>
    {record ? <AppIcon name="trophy" color={colors.primary} size={15} /> : null}
    <AppText numeric variant="subheadline" style={[{ color: statusColor }, record && styles.strong, !large && styles.right]} testID={`revisit-status-${exercise.id}`}>{status.label}</AppText>
  </View> : null;
  return <Animated.View layout={reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.base)}
    style={[!first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`completed-exercise-${exercise.id}`}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
      accessibilityLabel={`${exercise.name}. ${exercise.line}${status ? `. ${status.label === '=' ? 'igual que la última vez' : status.label}` : ''}`}
      onPress={onToggle} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} testID={`revisit-toggle-${exercise.id}`}>
      {/* Name and sets share one line ("NOMBRE · 90×10 · 90×9 kg"): opening drops only the sets, the name stays put. */}
      <View style={styles.flex}>
        <AppText variant="headline" style={exercise.done ? null : { color: colors.textMuted }}>{exercise.name}
          {open ? null : <AppText muted numeric variant="footnote" style={styles.inline}>{'  ·  '}{exercise.line}</AppText>}</AppText>
        {status && large ? statusText : null}
      </View>
      {status && !large ? statusText : null}
      <View style={[styles.chevron, open && styles.flipped]}><AppIcon name="chevronDown" color={colors.textMuted} size={17} /></View>
    </Pressable>
    {open ? <Animated.View entering={FadeIn.duration(reduced ? brandTokens.motion.duration.fast : brandTokens.motion.duration.base)} style={styles.expanded} testID={`revisit-detail-${exercise.id}`}>
      {exercise.identity ? <AppText muted variant="footnote">{exercise.identity}</AppText> : null}
      {exercise.sets.map(set => <View key={set.setNumber} style={styles.set} accessible
        accessibilityLabel={`Serie ${set.setNumber}: ${set.completed ? set.label : `${set.label === '—' ? '' : `${set.label}, `}no hecha`}${set.record ? ', récord' : ''}${set.before ? `. Antes ${set.before}` : ''}`}>
        <AppText muted numeric style={styles.setNumber} variant="subheadline">{set.setNumber}</AppText>
        <AppText numeric variant="headline" style={set.completed ? null : { color: colors.textMuted }}>{set.label}</AppText>
        {set.record ? <View style={[styles.tag, { backgroundColor: colors.brandSubtle }]}><AppText variant="caption" style={{ color: colors.primary }}>récord</AppText></View> : null}
        <View style={styles.flex} />
        {set.completed ? null : <AppText muted variant="footnote">no hecha</AppText>}
        {set.before ? <AppText muted numeric variant="footnote">antes {set.before}</AppText> : null}
      </View>)}
      {exercise.note ? <AppText muted style={styles.italic}>“{exercise.note}”</AppText> : null}
      {onOpenExercise ? <Pressable accessibilityRole="button" accessibilityLabel={`Ver historial de ${exercise.name}`} onPress={() => onOpenExercise(exercise.exerciseId)}
        style={styles.link} testID={`completed-exercise-history-${exercise.id}`}>
        <AppText variant="subheadline" style={[styles.strong, { color: colors.primary }]}>Ver historial del ejercicio</AppText>
        <AppIcon name="chevronRight" color={colors.primary} size={17} />
      </Pressable> : null}
    </Animated.View> : null}
  </Animated.View>;
}

/**
 * SF1 · a closed session seen again. Server truth only; Corregir/Eliminar live in the screen's •••.
 * The comparison with the last time arrives with the summary read and never blocks the session itself.
 */
export function CompletedSessionView({ detail, finished, onHome, onTraining, onOpenExercise, actions, banner, readSummary, extraSummary, initialExerciseId, variants }: {
  readSummary?: SessionSummaryLoader;
  /** A chart opens its source exercise, including when the collapsed summary would omit it. */
  initialExerciseId?: string;
  detail: SessionDetailDto; finished: SessionFinishedDto | null; onHome: () => void; onTraining?: () => void;
  onOpenExercise?: (exerciseId: string) => void; actions?: ReactNode; banner?: ReactNode; extraSummary?: ReactNode;
  /** #367 variants, read once by the screen: a folded section after the exercises, with any recovery shown above it. */
  variants?: { journal: ExerciseConfigurationJournal; editable: boolean };
}) {
  const { colors, isDark } = useOwnlevelTheme(), reduced = useReduceMotion(), { fontScale } = useWindowDimensions();
  const [postWorkoutOpen, setPostWorkoutOpen] = useState(Boolean(finished));
  const router = useRouter();
  const insights = detail.session.status === 'completed' ? insightsSessionHref(detail.session.id, detail.session.logDate) : null;
  const [summary, setSummary] = useState<SessionSummaryDto>();
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set(detail.exercises.filter(e => e.exerciseId === initialExerciseId).map(e => e.id)));
  const [showAll, setShowAll] = useState(false);
  const [allMuscles, setAllMuscles] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const variantsY = useRef(0), variantsHeader = useRef<View>(null), reviewPending = useRef(false);
  // A recovery notice opens the section and brings its header (and VoiceOver focus) to it; the rows are already read.
  // Opening grows the content, so the scroll waits for the section's new layout (a shorter page would clamp it).
  const goToVariants = () => {
    reviewPending.current = false;
    scroll.current?.scrollTo({ y: Math.max(0, variantsY.current - spacing.lg), animated: !reduced });
    const node = variantsHeader.current ? findNodeHandle(variantsHeader.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  };
  const reviewVariants = () => { if (variantsOpen) goToVariants(); else { reviewPending.current = true; setVariantsOpen(true); } };
  const sessionId = detail.session.id, version = detail.session.updatedAt;
  useEffect(() => {
    if (!readSummary) return;
    const abort = new AbortController();
    void Promise.resolve().then(() => readSummary(abort.signal)).then(result => {
      if (!abort.signal.aborted && result.status === 'ok' && result.data.sessionId === sessionId) setSummary(result.data);
    }).catch(() => undefined);
    return () => abort.abort();
  }, [readSummary, sessionId, version]);
  const base = completedSessionModel(detail), model = revisitModel(detail, summary);
  const discarded = base.status === 'discarded';
  const when = [compactWeekdayDate(base.logDate), base.endedAt ? formatTimeRange(base.startedAt, base.endedAt) : null].filter(Boolean).join(' · ');
  // Collapsed: the first ones in session order, plus any record (the sentence above names it, so it is never hidden).
  const many = model.exercises.length > FIRST_EXERCISES + 1;
  const shown = many && !showAll ? model.exercises.filter((exercise, index) => index < FIRST_EXERCISES || exercise.status?.kind === 'record' || exercise.exerciseId === initialExerciseId) : model.exercises;
  const top = model.muscles[0]?.sets ?? 0;
  // Already ordered by completed sets: folding only shortens the list, it never recounts or reorders it.
  const extraMuscles = model.muscles.length - FIRST_MUSCLES;
  const muscles = extraMuscles > 0 && !allMuscles ? model.muscles.slice(0, FIRST_MUSCLES) : model.muscles;
  const toggle = (id: string) => setOpenIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const fade = FadeIn.duration(reduced ? brandTokens.motion.duration.fast : brandTokens.motion.duration.base);
  return <ScrollScreen scrollRef={scroll} testID={discarded ? 'discarded-session' : 'completed-session'}>
    {banner}
    <View style={styles.header}>
      <AppText muted numeric variant="subheadline">{when}</AppText>
      <View style={styles.title}>
        {base.color ? <View style={[styles.strip, { backgroundColor: trainingRoutineColor(base.color, isDark) }]} /> : null}
        <Heading level={1} style={styles.flex}>{base.name}</Heading>
      </View>
    </View>
    {discarded ? <Surface><AppText muted>Esta sesión fue eliminada del historial. Se muestra sólo como referencia.</AppText></Surface> : null}
    <View style={styles.hero} testID="revisit-hero">
      <AppText numeric variant="title2">{model.sentence}</AppText>
      {model.achievement && !discarded ? <Animated.View entering={fade}>
        <AppText numeric variant="title2" style={{ color: colors.primary }} testID="revisit-achievement">{model.achievement}</AppText>
      </Animated.View> : null}
      <AppText muted numeric variant="subheadline">{model.line}</AppText>
    </View>
    {model.feelings.length || model.note ? <View style={styles.feelings} testID="completed-summary">
      {model.feelings.length ? <View style={styles.feelingRow}>{model.feelings.map(feeling => <FeelingDots key={feeling.key} feeling={feeling} />)}</View> : null}
      {model.note ? <AppText style={styles.italic}>“{model.note}”</AppText> : null}
    </View> : null}
    {insights ? <View style={styles.section}>
      <Button label="Ver contexto y comparación" variant="secondary" onPress={() => router.push(insights)} />
      <AppText muted variant="footnote">Comparación por ejercicio, sensaciones y comidas registradas.</AppText>
    </View> : null}
    {extraSummary}
    {variants ? <SessionVariantsNotice journal={variants.journal} onReview={reviewVariants} /> : null}
    {model.muscles.length ? <View style={styles.section} testID="revisit-muscles">
      <Heading level={2}>A dónde fue el trabajo</Heading>
      {muscles.map((muscle, index) => {
        const count = `${muscle.sets} ${muscle.sets === 1 ? 'serie' : 'series'}`;
        const bar = <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
          <View style={[styles.fill, { width: `${(muscle.sets / top) * 100}%`, backgroundColor: index === 0 ? colors.primary : colors.brandSubtle }]} />
        </View>;
        // Large text: label and count on a line, the bar under them, so no group name is cut.
        return fontScale > 1.3 ? <View key={muscle.label} style={styles.muscleStack} accessible accessibilityLabel={`${muscle.label}: ${count}`}>
          <View style={styles.muscle}><AppText style={styles.flex} variant="subheadline">{muscle.label}</AppText><AppText muted numeric variant="footnote">{count}</AppText></View>{bar}
        </View> : <View key={muscle.label} style={styles.muscle} accessible accessibilityLabel={`${muscle.label}: ${count}`}>
          <AppText numberOfLines={2} style={styles.muscleLabel} variant="subheadline">{muscle.label}</AppText>{bar}
          <AppText muted numeric style={styles.muscleCount} variant="footnote">{count}</AppText>
        </View>;
      })}
      {extraMuscles > 0 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: allMuscles }}
        accessibilityLabel={allMuscles ? `Mostrar sólo los ${FIRST_MUSCLES} grupos principales` : `Ver ${extraMuscles} ${extraMuscles === 1 ? 'grupo muscular' : 'grupos musculares'} más`}
        onPress={() => setAllMuscles(value => !value)} style={styles.more} testID="revisit-muscles-toggle">
        <AppText muted numeric variant="headline">{allMuscles ? 'Mostrar menos' : `+ ${extraMuscles} ${extraMuscles === 1 ? 'grupo' : 'grupos'} más`}</AppText>
      </Pressable> : null}
    </View> : null}
    {/* The rows animate their own moves; the section moves with them, so opening the muscle list never overlaps its heading. */}
    <Animated.View layout={reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.base)} style={styles.section}>
      <Heading level={2}>Ejercicios</Heading>
      <View>{shown.map((exercise, index) => <ExerciseRow key={exercise.id} exercise={exercise} first={index === 0} open={openIds.has(exercise.id)}
        onToggle={() => toggle(exercise.id)} onOpenExercise={onOpenExercise} />)}</View>
      {shown.length < model.exercises.length ? <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={styles.more} testID="revisit-show-all">
        <AppText muted variant="headline">+ {model.exercises.length - shown.length} {model.exercises.length - shown.length === 1 ? 'ejercicio' : 'ejercicios'} más</AppText>
      </Pressable> : null}
    </Animated.View>
    {variants ? <Animated.View layout={reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.base)} style={styles.variants}
      onLayout={event => { variantsY.current = event.nativeEvent.layout.y; if (reviewPending.current) goToVariants(); }}>
      <SessionVariantsSection journal={variants.journal} exercises={detail.exercises} editable={variants.editable}
        open={variantsOpen} onToggle={() => setVariantsOpen(value => !value)} headerRef={variantsHeader} />
    </Animated.View> : null}
    {actions}
    {onTraining ? <Button label="Volver a Entrenar" variant="secondary" onPress={onTraining} /> : null}
    {finished && postWorkoutOpen && !discarded ? <PostWorkoutScreen finished={finished} detail={detail} readSummary={readSummary} onHome={() => { setPostWorkoutOpen(false); (onTraining ?? onHome)(); }} onViewSession={() => setPostWorkoutOpen(false)} /> : null}
  </ScrollScreen>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, strong: { fontWeight: '600' }, italic: { fontStyle: 'italic' },
  header: { gap: spacing.xs }, title: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' }, strip: { width: 4, borderRadius: 2 },
  hero: { gap: spacing.xs },
  feelings: { gap: spacing.md }, feelingRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xl, rowGap: spacing.md },
  section: { gap: spacing.md, marginTop: spacing.md },
  muscle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 28 }, muscleLabel: { width: 108 },
  track: { flex: 1, height: 8, borderRadius: brandTokens.radius.full, overflow: 'hidden' }, fill: { height: '100%', borderRadius: brandTokens.radius.full },
  muscleCount: { minWidth: 56, textAlign: 'right' }, muscleStack: { gap: spacing.xs },
  status: { flexShrink: 1, maxWidth: '45%', justifyContent: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.lg }, inline: { fontWeight: '400' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: 1 }, right: { textAlign: 'right' }, chevron: { paddingTop: 3 },
  flipped: { transform: [{ rotate: '180deg' }] },
  expanded: { gap: spacing.sm, paddingBottom: spacing.md },
  set: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.xs, minHeight: 36 }, setNumber: { width: 16 },
  tag: { borderRadius: brandTokens.radius.chip, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  more: { minHeight: 44, justifyContent: 'center' }, variants: { marginTop: spacing.md },
});
