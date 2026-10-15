import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, AppText, Button, GlassSurface, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { isKgWeightMode } from '@/api/session-highlights';
import { triggerHaptic } from '@/platform/haptics';
import { formatTimeRange } from '@/home/format';
import type { ActiveSessionController } from './active-session-controller';
import { durationLabel, exercisePayload, type SessionSummaryDraft } from './active-session-model';
import { compactWeekdayDate } from './history-model';
import { FinishPainControl, FinishScaleControl } from './finish-controls';
import { FinishNoteSheet } from './finish-note-sheet';
import { FinishSaveAnimation, type SaveOrigin } from './finish-save-animation';
import { PostWorkoutContent, type SessionHighlightsLoader } from './post-workout-screen';
import { RoutineSheetButton } from './routine-sheet-button';
export { SummaryScale } from './summary-scale'; // Correction retains its existing presentation/semantics.

export function finishPreviewVolume(controller: ActiveSessionController): number | null {
  let total = 0, known = false;
  for (const exercise of controller.getSnapshot().detail?.exercises ?? []) {
    if (!isKgWeightMode(exercise.weightModeSnapshot)) continue;
    const entry = controller.getExercise(exercise.id);
    if (!entry) return null;
    try {
      for (const set of exercisePayload(entry.draft).sets) {
        if (set.isCompleted && set.actualReps !== null && set.actualWeightKg !== null) { total += set.actualReps * set.actualWeightKg; known = true; }
      }
    } catch { return null; } // Never show a partial sum while another draft is invalid.
  }
  return known ? total : null;
}
const number = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><AppText numeric variant="title2">{value}</AppText><AppText muted variant="caption">{label}</AppText></View>;
}
/** F1→F3→F4 in one modal: the confirmed receipt fades in over the grown champagne circle, so the session never flashes between them. */
export function FinishSessionSheet({ controller, onClose, onDiscard, readHighlights, onDone, onViewSession }: {
  controller: ActiveSessionController; onClose: () => void; onDiscard?: () => void;
  readHighlights?: SessionHighlightsLoader; onDone: () => void; onViewSession: () => void;
}) {
  const { colors } = useOwnlevelTheme(), reduceMotion = useReduceMotion(), window = useWindowDimensions();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const progress = useSyncExternalStore(controller.subscribeProgress, controller.getProgress, controller.getProgress);
  const finishIntent = state.intent?.value.kind === 'finish' ? state.intent : null;
  const pending = state.intent?.value.kind === 'finish' ? state.intent.value.metadata : null;
  const running = state.finishing || finishIntent?.phase === 'running', confirmed = !!state.finished;
  const empty = progress.completedSets === 0 && !finishIntent && !confirmed;
  const blockedByOther = Boolean(state.intent && !finishIntent);
  const editable = !empty && state.summaryReady && !running && !state.intent && !state.fenced;
  const summary = pending ?? state.summary;
  const [noteOpen, setNoteOpen] = useState(false), [receipt, setReceipt] = useState(false), [now, setNow] = useState(Date.now);
  const [origin, setOrigin] = useState<SaveOrigin>({ x: 16, y: window.height - 130, width: window.width - 32 });
  const button = useRef<View>(null), reveal = useSharedValue(0);
  const showReceipt = useCallback(() => setReceipt(true), []); // Stable: the animation must not restart its sequence on re-render.
  useEffect(() => { const clock = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(clock); }, []);
  useEffect(() => { if (running || confirmed) button.current?.measureInWindow((x, y, width) => { if (width > 0) setOrigin({ x, y, width }); }); }, [running, confirmed]);
  const sheetAnimation = useAnimatedStyle(() => ({ opacity: 1 - reveal.value, transform: [{ translateY: reduceMotion ? 0 : reveal.value * window.height }] }));
  const change = (update: Partial<SessionSummaryDraft>) => { if (editable) { triggerHaptic('stepperChange'); controller.updateSummary(value => ({ ...value, ...update })); } };
  const close = () => { if (receipt) onViewSession(); else if (!running && !confirmed) onClose(); };
  const status = finishIntent?.phase === 'uncertain' ? 'No pudimos confirmar si el entrenamiento se guardó. Comprobalo antes de seguir: no se va a guardar dos veces.'
    : finishIntent?.phase === 'blocked' ? state.notice ?? 'La finalización necesita revisión.' : !running ? state.notice : null;
  const detail = state.detail;
  const volume = finishPreviewVolume(controller);
  const title = detail?.session.routineId ? `Terminar ${detail.session.name}` : 'Terminar entrenamiento';
  const subtitle = detail ? `${compactWeekdayDate(detail.session.logDate)} · ${formatTimeRange(detail.session.startedAt, detail.session.startedAt).split('–')[0]}` : '';
  return <Modal visible transparent presentationStyle="overFullScreen" animationType={reduceMotion ? 'fade' : 'slide'} onRequestClose={close}>
    <GestureHandlerRootView style={[styles.root, { backgroundColor: `${brandTokens.palette.dark.bg}66` }]}>
      <Animated.View style={[styles.sheet, { backgroundColor: colors.background, maxHeight: window.height * 0.94 }, sheetAnimation]}>
        <SafeAreaView edges={['bottom']} style={styles.safe} testID="finish-session-sheet">
          <View style={styles.header}><View style={styles.flex}><AppText accessibilityRole="header" variant="title1">{title}</AppText><AppText muted numeric variant="footnote">{subtitle}</AppText></View>
            <RoutineSheetButton label="Cerrar resumen" icon="close" onPress={close} disabled={running || confirmed} /></View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={[styles.stats, window.fontScale > 1.5 && { flexDirection: 'column' }, empty && styles.dim]}>
              <Stat value={durationLabel(detail ? Math.max(0, now - Date.parse(detail.session.startedAt)) : 0)} label="duración" />
              <View style={[styles.divider, { backgroundColor: colors.border }]} /><Stat value={`${progress.completedSets} / ${progress.totalSets}`} label="series" />
              {volume !== null ? <><View style={[styles.divider, { backgroundColor: colors.border }]} /><Stat value={number(volume)} label="kg de volumen" /></> : null}
            </View>
            {empty ? <View accessibilityRole="text" style={[styles.empty, { backgroundColor: colors.surfaceRaised }]} testID="finish-no-sets">
              <AppIcon name="info" color={colors.textMuted} size={20} /><AppText style={styles.flex} variant="subheadline">Todavía no marcaste ninguna serie. Marcalas en la sesión para poder guardar.</AppText>
            </View> : null}
            <View style={[styles.questions, !editable && styles.dim]} pointerEvents={editable ? 'auto' : 'none'} accessibilityElementsHidden={empty} importantForAccessibility={empty ? 'no-hide-descendants' : 'auto'}>
              {(['energyLevel', 'performanceLevel'] as const).map(field => {
                const label = field === 'energyLevel' ? 'Energía' : 'Rendimiento';
                return <View key={field} style={styles.scale}>
                  <View style={styles.scaleHeader}><AppText variant="headline">{label}</AppText></View>
                  <FinishScaleControl field={field} label={label} value={summary[field]} disabled={!editable} onChange={value => change({ [field]: value })} />
                  <View style={styles.ends}><AppText muted variant="caption">Baja</AppText><AppText muted variant="caption">Alta</AppText></View>
                </View>;
              })}
              <View style={styles.scale}>
                {/* No "Quitar": "Sin dolor" sets 0 and a second tap returns to unanswered (null). Fixed heights: nothing below jumps. */}
                <View style={styles.scaleHeader}><AppText variant="headline">Dolor</AppText>
                  <GlassSurface interactive style={styles.shortcut}><Pressable accessibilityRole="button" accessibilityLabel="Sin dolor" accessibilityHint={summary.painLevel === 0 ? 'Tocá de nuevo para dejarlo sin responder' : undefined}
                    accessibilityState={{ selected: summary.painLevel === 0, disabled: !editable }} disabled={!editable} onPress={() => change({ painLevel: summary.painLevel === 0 ? null : 0 })} style={styles.shortcutPress}>
                    <AppText variant="subheadline" style={{ color: summary.painLevel === 0 ? colors.primary : colors.text, fontWeight: '600' }}>Sin dolor</AppText>
                  </Pressable></GlassSurface></View>
                <FinishPainControl field="painLevel" label="Dolor" value={summary.painLevel} disabled={!editable} onChange={painLevel => change({ painLevel })} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={summary.notes ? `Editar nota: ${summary.notes}` : 'Agregar una nota'} disabled={!editable} onPress={() => setNoteOpen(true)}
                style={[styles.note, { backgroundColor: colors.surface }]} testID="finish-open-note">
                <AppIcon name="note" color={colors.textMuted} size={20} /><View style={styles.flex}><AppText numberOfLines={2}>{summary.notes || 'Agregar una nota'}</AppText>
                  {!summary.notes ? <AppText muted variant="caption">Cómo te sentiste, algo para la próxima</AppText> : null}</View><AppIcon name="chevronRight" color={colors.textMuted} size={17} />
              </Pressable>
            </View>
          </ScrollView>
          <View style={styles.footer}>
            {status ? <AppText accessibilityLiveRegion="polite" style={{ color: finishIntent?.phase === 'uncertain' ? colors.text : colors.danger }} variant="footnote">{status}</AppText> : null}
            <View ref={button} collapsable={false} style={running || confirmed ? { opacity: 0 } : undefined}>
              {empty ? <Button label="← Volver a la sesión" onPress={close} /> : finishIntent && finishIntent.phase !== 'running'
                ? <Button label="Comprobar entrenamiento" onPress={() => void controller.retryIntent()} />
                : <Button label="Guardar entrenamiento" disabled={running || confirmed || blockedByOther || state.fenced || !state.summaryReady} onPress={() => { AccessibilityInfo.announceForAccessibility('Guardando entrenamiento'); void controller.finish(); }} />}
            </View>
            {empty && onDiscard ? <Pressable accessibilityRole="button" disabled={blockedByOther || state.fenced} onPress={onDiscard} style={styles.discard}><AppText style={{ color: colors.danger }} variant="headline">Descartar entrenamiento</AppText></Pressable> : <Button label="Seguir entrenando" variant="quiet" disabled={running || confirmed} onPress={close} />}
          </View>
        </SafeAreaView>
      </Animated.View>
      <FinishSaveAnimation running={running} confirmed={confirmed} origin={origin} reveal={reveal} onReady={showReceipt} />
      {receipt && state.finished ? <Animated.View entering={FadeIn.duration(reduceMotion ? brandTokens.motion.duration.fast : brandTokens.motion.duration.base)} style={StyleSheet.absoluteFill}>
        <PostWorkoutContent finished={state.finished} readHighlights={readHighlights} onHome={onDone} onViewSession={onViewSession} />
      </Animated.View> : null}
      {noteOpen ? <FinishNoteSheet value={summary.notes ?? ''} onClose={() => setNoteOpen(false)} onSave={notes => change({ notes })} /> : null}
    </GestureHandlerRootView>
  </Modal>;
}
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' }, sheet: { height: '90%', borderTopLeftRadius: brandTokens.radius.sheet, borderTopRightRadius: brandTokens.radius.sheet }, safe: { flex: 1 }, flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: brandTokens.space.md, gap: brandTokens.space.sm }, content: { paddingHorizontal: brandTokens.space.md, paddingBottom: brandTokens.space.xl, gap: brandTokens.space.lg },
  stats: { flexDirection: 'row', gap: brandTokens.space.md }, stat: { flex: 1, gap: brandTokens.space.xxs }, divider: { width: StyleSheet.hairlineWidth }, dim: { opacity: 0.45 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm, padding: brandTokens.space.md, borderRadius: brandTokens.radius.inner },
  questions: { gap: brandTokens.space.lg }, scale: { gap: brandTokens.space.xs }, scaleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: brandTokens.space.xs }, shortcut: { borderRadius: brandTokens.radius.full }, shortcutPress: { minHeight: 44, justifyContent: 'center', paddingHorizontal: brandTokens.space.md },
  note: { flexDirection: 'row', gap: brandTokens.space.sm, alignItems: 'center', padding: brandTokens.space.md, borderRadius: brandTokens.radius.inner, minHeight: 64 },
  discard: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: brandTokens.space.md, gap: brandTokens.space.xxs },
});
