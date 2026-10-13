import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SessionDetailDto, SessionFinishedDto } from '@/api/active-session';
import { AppIcon, AppText, Button, Heading, ScrollScreen, Surface, radius, spacing, useReduceMotion, useOwnlevelTheme } from '@/design-system';
import { compactHistoryDate } from './active-session-model';
import { completedSessionModel, postWorkoutSummary, type CompletedMetadataItem } from './completed-session-model';

function MetadataList({ items }: { items: CompletedMetadataItem[] }) {
  return <View style={styles.metadata}>
    {items.map(item => <View key={item.key} style={item.key === 'notes' ? styles.metadataNote : styles.metadataItem}>
      <AppText muted variant="caption">{item.label}</AppText>
      <AppText variant={item.key === 'notes' ? 'body' : 'label'}>{item.value}</AppText>
    </View>)}
  </View>;
}

/** Post-workout base (Web parity): saved confirmation + server-confirmed totals. */
export function PostWorkoutSheet({ finished, onHome, onViewSession }: { finished: SessionFinishedDto; onHome: () => void; onViewSession: () => void }) {
  const { colors } = useOwnlevelTheme();
  const summary = postWorkoutSummary(finished);
  const reducedMotion = useReduceMotion();
  return <Modal visible transparent animationType={reducedMotion ? "fade" : "slide"} onRequestClose={onViewSession}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Ver sesión terminada" style={styles.flex} onPress={onViewSession} />
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="post-workout-sheet">
        <View style={styles.row}>
          <View style={[styles.check, { backgroundColor: `${colors.primary}22` }]}><AppIcon name="check" color={colors.primary} size={22} /></View>
          <View style={styles.flex}>
            <Heading level={2}>Entrenamiento guardado</Heading>
            <AppText muted variant="caption">{summary.name} se guardó correctamente.</AppText>
          </View>
        </View>
        <View style={[styles.totals, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <AppText variant="label">{summary.line}</AppText>
          {summary.duration ? <AppText muted variant="caption">{summary.duration}</AppText> : null}
        </View>
        <ScrollView style={styles.receipt} contentContainerStyle={styles.metadata}>
          {finished.routineAdditions?.map(item => <AppText key={item.sessionExerciseId} variant="caption">
            {item.name}: {({ added: 'se sumó a la rutina', already_in_routine: 'ya estaba en la rutina', routine_unavailable: 'no se sumó porque la rutina ya no está activa', no_completed_sets: 'no se sumó porque no tiene series completadas' })[item.outcome]}.
          </AppText>)}
          {summary.metadata.length ? <MetadataList items={summary.metadata} /> : null}
        </ScrollView>
        <Button label="Ir al inicio" onPress={onHome} />
        <Button label="Ver sesión" variant="secondary" onPress={onViewSession} />
      </SafeAreaView>
    </View>
  </Modal>;
}

/** Read-only closed session. Renders server truth only; no editing affordances. */
export function CompletedSessionView({ detail, finished, onHome, onTraining, onOpenExercise, actions, banner }: {
  detail: SessionDetailDto; finished: SessionFinishedDto | null; onHome: () => void; onTraining?: () => void;
  onOpenExercise?: (exerciseId: string) => void; actions?: ReactNode; banner?: ReactNode;
}) {
  const { colors } = useOwnlevelTheme();
  const [postWorkoutOpen, setPostWorkoutOpen] = useState(Boolean(finished));
  const model = completedSessionModel(detail);
  const discarded = model.status === 'discarded';
  return <ScrollScreen testID={discarded ? 'discarded-session' : 'completed-session'}>
    <Surface elevated style={styles.header}>
      <AppText muted variant="footnote">{discarded ? 'SESIÓN ELIMINADA' : 'SESIÓN FINALIZADA'}</AppText>
      <Heading level={2}>{model.name}</Heading>
      <AppText muted variant="caption">{[compactHistoryDate(model.logDate), model.duration].filter(Boolean).join(' · ')}</AppText>
      <AppText variant="label">{model.completedSetCount} {model.completedSetCount === 1 ? 'serie completada' : 'series completadas'} · {model.completedExerciseCount}/{model.exerciseCount} ejercicios</AppText>
    </Surface>
    {banner}
    {discarded ? <Surface><AppText muted>Esta sesión fue eliminada del historial. Se muestra sólo como referencia.</AppText></Surface> : null}
    {model.metadata.length ? <Surface style={styles.section}><AppText variant="label">Resumen</AppText><MetadataList items={model.metadata} /></Surface> : null}
    {model.exercises.map(exercise => <Surface key={exercise.id} style={styles.section} testID={`completed-exercise-${exercise.id}`}>
      {onOpenExercise ? <Pressable accessibilityRole="button" accessibilityLabel={`Ver historial de ${exercise.name}`} onPress={() => onOpenExercise(exercise.exerciseId)}
        style={styles.exerciseHeader} testID={`completed-exercise-history-${exercise.id}`}>
        <View style={styles.flex}><AppText variant="label">{exercise.name}</AppText>{exercise.identity ? <AppText muted variant="caption">{exercise.identity}</AppText> : null}</View>
        <AppText style={{ color: colors.primary }} variant="caption">Historial</AppText><AppIcon color={colors.primary} name="chevronRight" size={12} />
      </Pressable> : <View><AppText variant="label">{exercise.name}</AppText>{exercise.identity ? <AppText muted variant="caption">{exercise.identity}</AppText> : null}</View>}
      {exercise.sets.map(set => <View key={set.setNumber} style={styles.set} accessible
        accessibilityLabel={`Serie ${set.setNumber}: ${set.label}${set.completed ? ', completada' : ', no completada'}`}>
        <AppText muted style={styles.setNumber} variant="caption">{set.setNumber}</AppText>
        <AppText style={[styles.flex, set.completed ? null : { color: colors.textMuted }]} variant="caption">{set.label}</AppText>
        {set.completed ? <AppIcon name="check" color={colors.primary} size={16} /> : null}
      </View>)}
    </Surface>)}
    {actions}
    {onTraining ? <Button label="Volver a Entrenar" variant="secondary" onPress={onTraining} /> : null}
    {finished && postWorkoutOpen && !discarded ? <PostWorkoutSheet finished={finished} onHome={() => { setPostWorkoutOpen(false); onHome(); }} onViewSession={() => setPostWorkoutOpen(false)} /> : null}
  </ScrollScreen>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  header: { gap: spacing.xs }, section: { gap: spacing.sm },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metadataItem: { minWidth: 88, gap: 2 }, metadataNote: { width: '100%', gap: 2 },
  set: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 }, setNumber: { width: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  receipt: { maxHeight: 240 },
  sheet: { maxHeight: '90%', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.md },
  check: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  totals: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: 2 },
});
