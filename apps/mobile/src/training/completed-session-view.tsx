import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SessionDetailDto, SessionFinishedDto } from '@/api/active-session';
import { AppIcon, AppText, Button, Heading, ScrollScreen, Surface, spacing, useOwnlevelTheme } from '@/design-system';
import { formatTimeRange } from '@/home/format';
import { compactWeekdayDate, volumeLabel } from './history-model';
import { trainingRoutineColor } from './routine-colors';
import { completedSessionModel } from './completed-session-model';

import { PostWorkoutScreen, type SessionHighlightsLoader } from './post-workout-screen';

function Stat({ value, label }: { value: string; label: string }) {
  return <Surface style={styles.stat}><AppText numeric variant="title2" numberOfLines={1} adjustsFontSizeToFit>{value}</AppText><AppText muted variant="footnote">{label}</AppText></Surface>;
}

/** Read-only closed session (HI5). Server truth only; Corregir/Eliminar live in the screen's •••. */
export function CompletedSessionView({ detail, finished, onHome, onTraining, onOpenExercise, actions, banner, readHighlights }: {
  readHighlights?: SessionHighlightsLoader;
  detail: SessionDetailDto; finished: SessionFinishedDto | null; onHome: () => void; onTraining?: () => void;
  onOpenExercise?: (exerciseId: string) => void; actions?: ReactNode; banner?: ReactNode;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  const [postWorkoutOpen, setPostWorkoutOpen] = useState(Boolean(finished));
  const model = completedSessionModel(detail);
  const discarded = model.status === 'discarded';
  const volume = volumeLabel(model.volumeKg);
  const subtitle = [compactWeekdayDate(model.logDate), model.endedAt ? formatTimeRange(model.startedAt, model.endedAt) : null, model.duration].filter(Boolean).join(' · ');
  const summary = model.metadata.filter(item => item.key !== 'notes'), notes = model.metadata.find(item => item.key === 'notes');
  return <ScrollScreen testID={discarded ? 'discarded-session' : 'completed-session'}>
    <View style={styles.title}>
      {model.color ? <View style={[styles.strip, { backgroundColor: trainingRoutineColor(model.color, isDark) }]} /> : null}
      <View style={styles.flex}><Heading level={1}>{model.name}</Heading><AppText muted numeric variant="subheadline">{subtitle}</AppText></View>
    </View>
    {banner}
    {discarded ? <Surface><AppText muted>Esta sesión fue eliminada del historial. Se muestra sólo como referencia.</AppText></Surface> : null}
    <View style={styles.stats}>
      <Stat value={String(model.completedSetCount)} label={model.completedSetCount === 1 ? 'serie' : 'series'} />
      <Stat value={`${model.completedExerciseCount} de ${model.exerciseCount}`} label="ejercicios" />
      {volume ? <Stat value={volume} label="volumen" /> : null}
    </View>
    {model.metadata.length ? <Surface style={styles.section} testID="completed-summary">
      {summary.length ? <View style={styles.metadata}>{summary.map(item => <View key={item.key} style={styles.metadataItem}>
        <AppText muted variant="footnote">{item.label}</AppText><AppText numeric variant="headline">{item.value}</AppText></View>)}</View> : null}
      {summary.length && notes ? <View style={[styles.hairline, { backgroundColor: colors.border }]} /> : null}
      {notes ? <AppText>{notes.value}</AppText> : null}
    </Surface> : null}
    {model.exercises.map(exercise => <Surface key={exercise.id} style={styles.section} testID={`completed-exercise-${exercise.id}`}>
      <View style={styles.exerciseHeader}>
        <View style={styles.flex}><AppText variant="headline" style={exercise.done ? null : { color: colors.textMuted }}>{exercise.name}</AppText>
          {exercise.identity ? <AppText muted variant="footnote">{exercise.identity}</AppText> : null}</View>
        {onOpenExercise ? <Pressable accessibilityRole="button" accessibilityLabel={`Ver historial de ${exercise.name}`} hitSlop={8} onPress={() => onOpenExercise(exercise.exerciseId)}
          style={styles.historyLink} testID={`completed-exercise-history-${exercise.id}`}>
          <AppIcon name="clock" color={colors.textMuted} size={17} /><AppText variant="subheadline">Historial</AppText>
        </Pressable> : null}
      </View>
      {exercise.sets.map(set => <View key={set.setNumber} style={styles.set} accessible
        accessibilityLabel={`Serie ${set.setNumber}: ${set.completed ? set.label : `${set.label === '—' ? '' : `${set.label}, `}no hecha`}`}>
        <AppText muted numeric style={styles.setNumber} variant="subheadline">{set.setNumber}</AppText>
        <AppText numeric style={[styles.flex, set.completed ? null : { color: colors.textMuted }]} variant="body">{set.label}</AppText>
        {set.completed ? null : <AppText muted variant="footnote">no hecha</AppText>}
      </View>)}
    </Surface>)}
    {actions}
    {onTraining ? <Button label="Volver a Entrenar" variant="secondary" onPress={onTraining} /> : null}
    {finished && postWorkoutOpen && !discarded ? <PostWorkoutScreen finished={finished} readHighlights={readHighlights} onHome={() => { setPostWorkoutOpen(false); (onTraining ?? onHome)(); }} onViewSession={() => setPostWorkoutOpen(false)} /> : null}
  </ScrollScreen>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  section: { gap: spacing.sm },
  title: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' }, strip: { width: 4, borderRadius: 2 },
  stats: { flexDirection: 'row', gap: spacing.sm }, stat: { flex: 1, gap: 2, padding: spacing.md },
  hairline: { height: StyleSheet.hairlineWidth }, historyLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metadataItem: { minWidth: 88, gap: 2 },
  set: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 32 }, setNumber: { width: 20 },
});
