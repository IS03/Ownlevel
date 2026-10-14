import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SessionFinishedDto } from '@/api/active-session';
import type { SessionHighlightsDto } from '@/api/session-highlights';
import { isKgWeightMode } from '@/api/session-highlights';
import type { MobileApiReadResult } from '@/api/results';
import { AppIcon, AppText, brandTokens, useReduceMotion, Button, OwnlevelThemeProvider } from '@/design-system';
import { formatTimeRange } from '@/home/format';
import { compactWeekdayDate } from './history-model';
import { exerciseSetLabel } from './exercise-detail-model';
import { metadataItems } from './completed-session-model';

export type SessionHighlightsLoader = (signal?: AbortSignal) => Promise<MobileApiReadResult<SessionHighlightsDto>>;
const AnimatedInput = Animated.createAnimatedComponent(TextInput);
const hero = brandTokens.palette.light;
function formatCount(value: number): string {
  'worklet';
  const [whole, decimal] = String(Math.round(value * 100) / 100).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (decimal ? `,${decimal}` : '');
}
function countText(value: number, duration: boolean) {
  'worklet';
  if (!duration) return formatCount(value);
  return value < 1 ? '<1 min' : value < 60 ? `${Math.floor(value)} min` : `${Math.floor(value / 60)} h ${String(Math.floor(value % 60)).padStart(2, '0')}`;
}
function Count({ value, label, duration = false }: { value: number; label: string; duration?: boolean }) {
  const reduced = useReduceMotion(), progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { progress.value = reduced ? 1 : withTiming(1, { duration: brandTokens.motion.duration.base }); }, [value, reduced, progress]);
  const props = useAnimatedProps(() => ({ text: countText(value * progress.value, duration), defaultValue: countText(value * progress.value, duration) }));
  return <View style={styles.stat} accessible accessibilityLabel={`${countText(value, duration)} ${label}`}>
    {reduced ? <AppText numeric style={styles.number} variant="title1">{countText(value, duration)}</AppText>
      : <AnimatedInput accessibilityElementsHidden importantForAccessibility="no-hide-descendants" editable={false} defaultValue={countText(value, duration)} animatedProps={props} style={styles.number} underlineColorAndroid="transparent" />}
    <AppText style={styles.heroText} variant="caption">{label}</AppText>
  </View>;
}
export function postWorkoutRows(finished: SessionFinishedDto, data?: SessionHighlightsDto) {
  const highlights = data?.sessionId === finished.sessionId ? data.highlights : [];
  const rows = [...highlights.filter(item => item.kind === 'record'), ...highlights.filter(item => item.kind === 'improvement')].map(item => {
    const mark = exerciseSetLabel({ actualWeightKg: item.mark.weightKg, actualReps: item.mark.reps }, item.weightMode);
    const weightDelta = item.mark.weightKg - item.previous.weightKg;
    const change = weightDelta > 0 ? `+${formatCount(weightDelta)} ${isKgWeightMode(item.weightMode) ? 'kg' : 'placas'}` : `+${item.mark.reps - item.previous.reps} reps`;
    return { id: `${item.kind}-${item.exerciseId}`, kind: item.kind, title: item.name,
      detail: item.kind === 'record' ? mark : `${mark} · ${change} que la última vez` };
  });
  return [...rows, ...(finished.routineAdditions ?? []).filter(item => item.outcome === 'added').map(item => ({
    id: `added-${item.sessionExerciseId}`, kind: 'added', title: `${item.name} se sumó a ${finished.name}`, detail: 'Va a estar en tu próxima sesión',
  }))].slice(0, 4);
}
/** Full-screen confirmed receipt; auxiliary history never gates success or manufactures empty/zero values. */
export function PostWorkoutScreen({ finished, readHighlights, onHome, onViewSession }: {
  finished: SessionFinishedDto; readHighlights?: SessionHighlightsLoader; onHome: () => void; onViewSession: () => void;
}) {
  const [highlights, setHighlights] = useState<SessionHighlightsDto>();
  const reduced = useReduceMotion(), { fontScale } = useWindowDimensions();
  useEffect(() => { AccessibilityInfo.announceForAccessibility(`${finished.name} guardado`); }, [finished.name]);
  useEffect(() => {
    if (!readHighlights) return;
    const abort = new AbortController();
    void Promise.resolve().then(() => readHighlights(abort.signal)).then(result => {
      if (!abort.signal.aborted && result.status === 'ok' && result.data.sessionId === finished.sessionId) setHighlights(result.data);
    }).catch(() => undefined);
    return () => abort.abort();
  }, [finished.sessionId, readHighlights]);
  const rows = postWorkoutRows(finished, highlights);
  const metadata = metadataItems(finished.metadata), feelings = metadata.filter(item => item.key !== 'notes'), note = metadata.find(item => item.key === 'notes');
  const minutes = Math.max(0, Math.floor((Date.parse(finished.endedAt) - Date.parse(finished.startedAt)) / 60000));
  return <Modal visible presentationStyle="fullScreen" animationType="fade" onRequestClose={onViewSession}>
    <OwnlevelThemeProvider initialMode="light"><SafeAreaView style={styles.screen} testID="post-workout-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.check}><AppIcon name="check" color={hero.onAccent} size={32} /></View>
          <AppText accessibilityRole="header" style={styles.heroText} variant="largeTitle">{finished.routineId ? `${finished.name} guardado` : 'Entrenamiento guardado'}</AppText>
          <AppText numeric style={styles.heroText} variant="subheadline">{compactWeekdayDate(finished.logDate)} · {formatTimeRange(finished.startedAt, finished.endedAt)}</AppText>
        </View>
        <View style={[styles.stats, fontScale > 1.5 && styles.vertical]}>
          <Count value={minutes} label="duración" duration />
          <Count value={finished.completedSetCount} label="series" />
          {highlights?.volumeKg !== null && highlights?.volumeKg !== undefined ? <Count value={highlights.volumeKg} label="kg de volumen" /> : null}
        </View>
        {rows.length ? <Animated.View entering={FadeIn.duration(reduced ? brandTokens.motion.duration.fast : brandTokens.motion.duration.base)} testID="post-workout-highlights">
          <AppText style={styles.sectionTitle} variant="footnote">Lo destacado</AppText>
          {rows.map((row, index) => <View key={row.id} style={[styles.row, index > 0 && styles.hairline]} testID={`post-highlight-${row.kind}`}>
            {row.kind === 'improvement' ? <AppText style={styles.heroText} variant="title2">↗</AppText> : <AppIcon name={row.kind === 'record' ? 'trophy' : 'plus'} color={hero.onHero} size={20} />}
            <View style={styles.flex}><AppText style={styles.heroText} variant="headline">{row.title}</AppText><AppText numeric style={styles.heroText} variant="subheadline">{row.detail}</AppText></View>
            {row.kind === 'record' ? <View style={styles.badge}><AppText style={styles.heroText} variant="caption">Récord</AppText></View> : null}
          </View>)}
        </Animated.View> : null}
        {feelings.length || note ? <View style={styles.feelings} testID="post-workout-feelings">
          <AppText style={styles.sectionTitle} variant="footnote">Cómo te sentiste</AppText>
          {feelings.length ? <View style={[styles.stats, fontScale > 1.5 && styles.vertical]}>{feelings.map(item => <View key={item.key} style={styles.stat}>
            <AppText style={styles.heroText} variant="caption">{item.label}</AppText><AppText numeric style={styles.heroText} variant="headline">{item.value}</AppText>
          </View>)}</View> : null}
          {note ? <AppText style={[styles.heroText, styles.italic]} variant="body">“{note.value}”</AppText> : null}
        </View> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Listo" onPress={onHome} />
        <Button label="Ver sesión" variant="quiet" onPress={onViewSession} />
      </View>
    </SafeAreaView></OwnlevelThemeProvider>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.bg, experimental_backgroundImage: `linear-gradient(160deg, ${hero.heroFrom} 0%, ${hero.bg} 75%)` },
  content: { padding: brandTokens.space.xl, gap: brandTokens.space.xxl }, hero: { alignItems: 'center', gap: brandTokens.space.sm, paddingTop: brandTokens.space.xl },
  check: { width: 72, height: 72, borderRadius: brandTokens.radius.full, backgroundColor: hero.accent, alignItems: 'center', justifyContent: 'center' },
  heroText: { color: hero.onHero }, sectionTitle: { color: hero.onHero, fontWeight: '600', marginBottom: brandTokens.space.sm },
  stats: { flexDirection: 'row', gap: brandTokens.space.md }, vertical: { flexDirection: 'column' },
  stat: { flex: 1, gap: brandTokens.space.xxs, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: hero.border, paddingLeft: brandTokens.space.sm },
  number: { ...brandTokens.typeScale.title1, color: hero.onHero, fontVariant: ['tabular-nums'], padding: 0, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm, paddingVertical: brandTokens.space.sm }, hairline: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hero.border },
  flex: { flex: 1 }, badge: { backgroundColor: hero.accentSoft, borderRadius: brandTokens.radius.chip, paddingHorizontal: brandTokens.space.xs, paddingVertical: brandTokens.space.xxs },
  feelings: { gap: brandTokens.space.xs }, italic: { fontStyle: 'italic' }, footer: { padding: brandTokens.space.md, gap: brandTokens.space.xxs },
});
