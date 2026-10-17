import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ReturnToHistoryDay } from '@/history/return-to-day';
import { usePreventRemove } from 'expo-router/build/react-navigation/core/usePreventRemove';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchSessionDetail, type SessionDetailDto } from '@/api/active-session';
import { correctSession, type SessionCorrectionInput } from '@/api/training-history';
import { forgetSessionSummary } from '@/api/session-summary';
import { AppText, Button, ScrollScreen, Surface, UnavailableState, radius, sizes, spacing, useOwnlevelTheme } from '@/design-system';
import { compactHistoryDate } from './active-session-model';
import { SummaryScale } from './finish-session-sheet';
import { correctionDraft, correctionInput, correctionIsDirty, type CorrectionDraft } from './history-model';
import { ReadStateScreen } from './history-components';
import { SummarySlider } from './summary-slider';
import { useRead } from './use-read';

const newKey = () => typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID()
  : `correct-${Date.now()}-${Math.random().toString(36).slice(2)}`;
type Phase =
  | { kind: 'editing' }
  | { kind: 'saving' }
  // Unknown outcome: the identical request (same key) can be replayed safely.
  | { kind: 'uncertain'; input: SessionCorrectionInput }
  | { kind: 'conflict'; message: string }
  | { kind: 'closed'; message: string };

function CorrectionForm({ client, detail, onReload }: { client: MobileApiClient; detail: SessionDetailDto; onReload: () => void }) {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useOwnlevelTheme();
  const [draft, setDraft] = useState<CorrectionDraft>(() => correctionDraft(detail));
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = correctionIsDirty(detail, draft);
  const editable = phase.kind === 'editing';
  usePreventRemove(!saved && (phase.kind === 'saving' || phase.kind === 'uncertain' || dirty), ({ data }) => {
    if (phase.kind === 'saving') return;
    Alert.alert(phase.kind === 'uncertain' ? 'Corrección sin confirmar' : '¿Descartar los cambios?',
      phase.kind === 'uncertain' ? 'No sabemos si la corrección se guardó. Si salís, comprobalo en la sesión.' : 'La corrección todavía no se guardó.', [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
      ]);
  });
  const update = (patch: Partial<CorrectionDraft>) => { setDraft(current => ({ ...current, ...patch })); setError(null); };
  const updateSet = (exerciseId: string, setNumber: number, field: 'weight' | 'reps', value: string) => {
    setDraft(current => ({ ...current, exercises: current.exercises.map(exercise => exercise.id !== exerciseId ? exercise
      : { ...exercise, sets: exercise.sets.map(set => set.setNumber === setNumber ? { ...set, [field]: value } : set) }) }));
    setError(null);
  };
  const send = async (input: SessionCorrectionInput) => {
    setPhase({ kind: 'saving' }); setError(null);
    const result = await correctSession(client, detail.session.id, input);
    if (result.status === 'ok') {
      setSaved(true);
      forgetSessionSummary(client, detail.session.id);
      // The session screen re-reads on focus and shows confirmed server truth.
      requestAnimationFrame(() => router.back());
      return;
    }
    if (result.status === 'unavailable') { setPhase({ kind: 'uncertain', input }); return; }
    if (result.status === 'conflict' && (result.code === 'SESSION_DISCARDED' || result.code === 'SESSION_NOT_COMPLETED')) {
      setPhase({ kind: 'closed', message: result.message }); return;
    }
    if (result.status === 'conflict') {
      setPhase({ kind: 'conflict', message: 'La sesión cambió desde que abriste la corrección. Recargá para ver los datos guardados; tus cambios no se aplicaron.' });
      return;
    }
    setPhase({ kind: 'editing' });
    setError(result.status === 'validation' || result.status === 'not_found' ? result.message : 'Tu sesión expiró. Volvé a iniciar sesión.');
  };
  const save = () => {
    let input: SessionCorrectionInput;
    try { input = correctionInput(detail, draft, newKey()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Revisá los datos.'); return; }
    void send(input);
  };
  const reloadServerTruth = () => { setSaved(true); onReload(); };
  const field = (value: string, onChange: (next: string) => void, label: string, keyboard: 'decimal-pad' | 'number-pad') =>
    <TextInput accessibilityLabel={label} editable={editable} keyboardType={keyboard} selectTextOnFocus value={value} onChangeText={onChange}
      placeholder="—" placeholderTextColor={colors.textMuted}
      style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, opacity: editable ? 1 : 0.6 }]} />;
  // The actions live inside the scroll content: iOS insets it for the native tab
  // bar and the keyboard, so a fixed footer would end up hidden behind them.
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
    contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets testID="session-correction">
      <View style={styles.header}>
        <AppText variant="label" style={styles.title}>{detail.session.name}</AppText>
        <AppText muted variant="caption">{compactHistoryDate(detail.session.logDate)}</AppText>
      </View>
      <Surface style={{ borderColor: colors.text }}>
        <AppText muted variant="caption">Sólo podés corregir datos realizados y notas. La fecha, duración, rutina, ejercicios, objetivos y progresión están congelados.</AppText>
      </Surface>
      <AppText muted variant="label">Series realizadas</AppText>
      {detail.exercises.map(exercise => {
        const edited = draft.exercises.find(item => item.id === exercise.id);
        return <Surface key={exercise.id} style={styles.exercise}>
          <View><AppText variant="label">{exercise.nameSnapshot}</AppText>
            <AppText muted variant="caption">Objetivos y checks históricos no se modifican.</AppText></View>
          <View style={styles.setHeader}><AppText muted style={styles.setNumber} variant="caption">Serie</AppText>
            <AppText muted style={styles.flex} variant="caption">Peso (kg)</AppText><AppText muted style={styles.flex} variant="caption">Reps</AppText></View>
          {edited?.sets.map(set => <View key={set.setNumber} style={styles.setRow}>
            <AppText muted style={styles.setNumber} variant="label">S{set.setNumber}</AppText>
            <View style={styles.flex}>{field(set.weight, value => updateSet(exercise.id, set.setNumber, 'weight', value), `Peso serie ${set.setNumber} de ${exercise.nameSnapshot}`, 'decimal-pad')}</View>
            <View style={styles.flex}>{field(set.reps, value => updateSet(exercise.id, set.setNumber, 'reps', value), `Reps serie ${set.setNumber} de ${exercise.nameSnapshot}`, 'number-pad')}</View>
          </View>)}
        </Surface>;
      })}
      <AppText muted variant="label">Resumen y notas</AppText>
      <Surface style={styles.summary}>
        <SummaryScale field="energyLevel" value={draft.energyLevel} disabled={!editable} onChange={energyLevel => update({ energyLevel })} />
        <SummaryScale field="performanceLevel" value={draft.performanceLevel} disabled={!editable} onChange={performanceLevel => update({ performanceLevel })} />
        <SummarySlider field="painLevel" label="Dolor" minimumLabel="sin dolor" minimum={0} maximum={10} value={draft.painLevel} disabled={!editable}
          onChange={painLevel => update({ painLevel })} />
        <View style={styles.notesBlock}><AppText variant="label">Notas de la sesión</AppText>
          <TextInput accessibilityLabel="Notas de la sesión" editable={editable} multiline value={draft.notes} onChangeText={notes => update({ notes })}
            placeholder="Sin notas" placeholderTextColor={colors.textMuted}
            style={[styles.notes, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} /></View>
      </Surface>
    <View style={styles.footer}>
      {error ? <AppText accessibilityLiveRegion="polite" style={{ color: colors.danger }} variant="caption">{error}</AppText> : null}
      {phase.kind === 'uncertain' ? <>
        <AppText style={{ color: colors.text }} variant="caption">No pudimos confirmar si la corrección se guardó. Reintentá: se reenvía la misma corrección y no se aplica dos veces.</AppText>
        <Button label="Reintentar" onPress={() => void send(phase.input)} />
        <Button label="Descartar y recargar" variant="quiet" onPress={reloadServerTruth} />
      </> : phase.kind === 'conflict' ? <>
        <AppText style={{ color: colors.text }} variant="caption">{phase.message}</AppText>
        <Button label="Recargar datos" onPress={reloadServerTruth} />
      </> : phase.kind === 'closed' ? <>
        <AppText style={{ color: colors.text }} variant="caption">{phase.message}</AppText>
        <Button label="Volver" onPress={() => { setSaved(true); requestAnimationFrame(() => router.back()); }} />
      </> : <Button label={phase.kind === 'saving' ? 'Guardando…' : 'Guardar corrección'} disabled={phase.kind === 'saving' || !dirty} onPress={save} />}
    </View>
  </ScrollView>;
}

/** Route entry: /train/correct/[id]. Always edits a fresh server read (CAS versions). */
export function SessionCorrectionScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { client } = useMobileApi();
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const load = useCallback((signal: AbortSignal) => client && id ? fetchSessionDetail(client, id, signal)
    : Promise.resolve({ status: 'unavailable' as const, reason: 'auth' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } }), [client, id]);
  const { state, reload } = useRead(load);
  // A new read remounts the form, discarding local edits only on explicit reload.
  const [generation, setGeneration] = useState(0);
  if (state.status !== 'ready' || !client) return <ReadStateScreen header={<ReturnToHistoryDay />} state={state} onRetry={() => void reload()} testID="session-correction" notFoundTitle="Sesión no disponible" />;
  if (state.data.session.status !== 'completed') return <ScrollScreen testID="session-correction-closed">
    <ReturnToHistoryDay />
    <UnavailableState title="No se puede corregir" description={state.data.session.status === 'discarded' ? 'La sesión fue eliminada.' : 'Sólo se pueden corregir sesiones finalizadas.'}
      action={<Button label="Volver" onPress={() => router.back()} />} />
  </ScrollScreen>;
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ReturnToHistoryDay />
    <CorrectionForm key={`${state.data.session.updatedAt}:${generation}`} client={client} detail={state.data}
      onReload={() => { setGeneration(value => value + 1); void reload(); }} />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  header: { gap: 2 },
  title: { fontSize: 22, lineHeight: 28 },
  exercise: { gap: spacing.sm },
  setHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  setRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  setNumber: { width: 40 },
  flex: { flex: 1 },
  input: { minHeight: sizes.touchTarget, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 16 },
  summary: { gap: spacing.lg },
  notesBlock: { gap: spacing.sm },
  notes: { minHeight: 96, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 16, textAlignVertical: 'top' },
  footer: { gap: spacing.sm, paddingTop: spacing.sm },
});
