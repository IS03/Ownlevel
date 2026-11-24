import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { LoadPattern, SessionExerciseDto } from '@/api/active-session';
import { AppText, Button, spacing } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { QuickHistoryCard } from './active-session-sheets';
import { PATTERN_GUIDANCE, patternEvidenceLine, schemeLabel } from './load-pattern-model';
import { RoutineEditorSheet } from './routine-editor-sheet';
import { RoutineSheetButton } from './routine-sheet-button';

export type LoadPatternChoice = 'review' | 'increase_reps' | 'increase_weight' | 'keep' | 'later';
/**
 * #537 · The evidence of a load pattern and what the user can do with it. Nothing here edits today's sets or loads:
 * «Revisar series de hoy» only goes back to them, «Para la próxima» sets the existing «Próxima vez» decision, «Mantener
 * este esquema» silences this pattern and «Más adelante» hides it for this session.
 */
export function LoadPatternSheet({ exercise, pattern, canDecide, onChoose, onClose }: {
  exercise: SessionExerciseDto; pattern: LoadPattern; canDecide: boolean; onChoose: (choice: LoadPatternChoice) => void; onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [choice, setChoice] = useState<LoadPatternChoice | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const { fontScale } = useWindowDimensions(), large = fontScale > 1.3;
  const numberWidth = Math.ceil(40 * Math.min(Math.max(fontScale, 1), 2));
  // The choice is applied once the sheet is down, so the card below never changes under a closing sheet.
  const choose = (next: LoadPatternChoice) => { haptics.selection(); setChoice(next); setOpen(false); };
  return <RoutineEditorSheet open={open} pending={false} onClose={() => setOpen(false)} onDismissed={() => { if (choice) onChoose(choice); onClose(); }}>
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText accessibilityRole="header" variant="title2">Tu esquema reciente</AppText>
          <AppText muted variant="footnote">{`${exercise.nameSnapshot} · ${pattern.sessions[0]?.routineName ?? ''}`}</AppText>
        </View>
        <RoutineSheetButton label="Cerrar esquema reciente" icon="close" onPress={() => setOpen(false)} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <AppText numeric variant="headline">{schemeLabel(pattern.scheme)}</AppText>
          <AppText muted variant="subheadline">{patternEvidenceLine(pattern)}</AppText>
        </View>
        {pattern.sessions.map(session => <QuickHistoryCard key={session.sessionId} showRoutine={false} large={large} numberWidth={numberWidth} canUse={false}
          expanded={expanded.has(session.sessionId)} onExpand={() => setExpanded(current => new Set(current).add(session.sessionId))}
          session={{ sessionId: session.sessionId, logDate: session.logDate, completedAt: null, routineId: null, routineName: session.routineName, decision: 'maintain', sets: session.sets }} />)}
        <AppText muted variant="subheadline">{PATTERN_GUIDANCE}</AppText>
        <Button label="Revisar series de hoy" variant="secondary" onPress={() => choose('review')} />
        <View style={styles.next}>
          <AppText muted variant="footnote">Para la próxima</AppText>
          <View style={[styles.pair, large && styles.pairStacked]}>
            <View style={styles.flex}><Button disabled={!canDecide} label="Más reps" variant="secondary" onPress={() => choose('increase_reps')} /></View>
            <View style={styles.flex}><Button disabled={!canDecide} label="Más peso" variant="secondary" onPress={() => choose('increase_weight')} /></View>
          </View>
        </View>
        <View style={[styles.pair, large && styles.pairStacked]}>
          <View style={styles.flex}><Button label="Mantener este esquema" variant="quiet" onPress={() => choose('keep')} /></View>
          <View style={styles.flex}><Button label="Más adelante" variant="quiet" onPress={() => choose('later')} /></View>
        </View>
      </ScrollView>
    </View>
  </RoutineEditorSheet>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 },
  header: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  summary: { gap: spacing.xs }, next: { gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.sm }, pairStacked: { flexDirection: 'column' },
});
