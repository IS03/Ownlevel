import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMobileApi } from '@/api';
import { fetchProgressBody, fetchProgressMetrics, fetchProgressTraining, progressRequestKey } from '@/api/progress';
import { parseInfluenceMeasure } from '@/api/progress-influence';
import { AppIcon, AppText, SheetHandle, TextField, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { RoutineSheetButton } from '@/training/routine-sheet-button';
import { STATIC_MEASURES, bodyChoices, exerciseChoices, metricChoices, type ExploreChoice } from './explore-model';
import { useProgressRange } from './progress-range-context';
import { useProgressResource } from './use-progress-resource';

export function ExploreSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion(), insets = useSafeAreaInsets();
  return <Modal transparent statusBarTranslucent visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.fill}>
      <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={[StyleSheet.absoluteFill, styles.scrim]} />
      <Animated.View entering={reduced ? FadeIn.duration(200) : SlideInDown.duration(300)} accessibilityViewIsModal
        style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <SheetHandle />
        <View style={styles.header}>
          <RoutineSheetButton label="Cerrar" icon="close" onPress={onClose} />
          <AppText accessibilityRole="header" variant="headline" style={styles.title}>{title}</AppText>
          <View style={styles.spacer} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}

function Choice({ choice, selected, first, onPick }: { choice: ExploreChoice; selected: boolean; first: boolean; onPick: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${choice.label}. ${choice.detail}`}
    testID={`explore-choice-${choice.key}`} onPress={() => { triggerHaptic('stepperChange'); onPick(); }}
    style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, pressed && { opacity: 0.6 }]}>
    <View style={styles.grow}>
      <AppText variant="headline" style={selected ? { color: colors.primary } : undefined}>{choice.label}</AppText>
      {choice.detail ? <AppText muted variant="footnote">{choice.detail}</AppText> : null}
    </View>
    {selected ? <AppIcon name="check" color={colors.primary} size={18} /> : null}
  </Pressable>;
}
function Group({ title, choices, selected, onPick, note }: { title: string; choices: ExploreChoice[]; selected: string | null; onPick: (c: ExploreChoice) => void; note?: string }) {
  return <View style={styles.group}>
    <AppText muted variant="caption" style={styles.groupTitle}>{title.toLocaleUpperCase('es-AR')}</AppText>
    {note ? <AppText muted variant="footnote">{note}</AppText> : null}
    {choices.map((c, i) => <Choice key={c.key} choice={c} first={i === 0} selected={c.key === selected} onPick={() => onPick(c)} />)}
  </View>;
}

/** One list of options (breakdown or day filter); the first one clears it. */
export function OptionSheet({ title, options, selected, onPick, onClose, closeOnPick = true, children }: {
  title: string; options: ExploreChoice[]; selected: string; onPick: (key: string) => void; onClose: () => void; closeOnPick?: boolean; children?: ReactNode;
}) {
  return <ExploreSheet title={title} onClose={onClose}>
    <View>{options.map((c, i) => <Choice key={c.key} choice={c} first={i === 0} selected={c.key === selected} onPick={() => { onPick(c.key); if (closeOnPick) onClose(); }} />)}</View>
    {children}
  </ExploreSheet>;
}

function DynamicGroup({ title, read, choices, empty, selected, pick, match }: {
  title: string; read: { state: { status: string }; data: unknown }; choices: ExploreChoice[]; empty: string;
  selected: string | null; pick: (c: ExploreChoice) => void; match: (c: ExploreChoice) => boolean;
}) {
  const shown = choices.filter(match);
  const note = read.state.status === 'loading' ? 'Cargando…' : !read.data ? 'No pudimos cargar esta lista.' : !choices.length ? empty : undefined;
  return note || shown.length ? <Group title={title} choices={note ? [] : shown} selected={selected} onPick={pick} note={note} /> : null;
}

/** S3 · choose a measure: search, fixed groups, and the user's metrics, body measures and exercises of the period. */
export function MeasureSheet({ selected, onPick, onClose, influenceRole }: { selected: string | null; onPick: (c: ExploreChoice) => void; onClose: () => void; influenceRole?: 'split' | 'outcome' }) {
  const { client } = useMobileApi();
  const { query, compare } = useProgressRange();
  const [search, setSearch] = useState('');
  const key = progressRequestKey(query, compare);
  const metrics = useProgressResource(client, `explore-metrics|${key}`, useCallback((c, s) => fetchProgressMetrics(c, query, null, s), [query]));
  const needle = search.trim().toLocaleLowerCase('es-AR');
  const match = (c: ExploreChoice) => (!influenceRole || !!parseInfluenceMeasure(c.key, influenceRole)) && (!needle || c.label.toLocaleLowerCase('es-AR').includes(needle));
  const pick = (c: ExploreChoice) => { onPick(c); onClose(); };
  return <ExploreSheet title="Medida" onClose={onClose}>
    <TextField search hideLabel label="Buscar medida" placeholder="Buscar medida" value={search} onChangeText={setSearch} />
    {STATIC_MEASURES.map(g => { const shown = g.choices.filter(match); return shown.length ? <Group key={g.title} title={g.title} choices={shown} selected={selected} onPick={pick} /> : null; })}
    <DynamicGroup title="Métricas" read={metrics} choices={metrics.data ? metricChoices(metrics.data) : []} empty="Todavía no tenés métricas." selected={selected} pick={pick} match={match} />
    {influenceRole === 'split' ? <Group title="Días" choices={[
      { key: 'day.training', label: 'Día de entrenamiento', detail: 'Con una sesión completada' },
      { key: 'day.work', label: 'Día laboral', detail: 'Según el registro del día' },
    ].filter(match)} selected={selected} onPick={pick} /> : null}
    {!influenceRole ? <AdditionalMeasures selected={selected} pick={pick} match={match} /> : null}
  </ExploreSheet>;
}

/** Only Explorar reads these sources. Influence shares the picker without loading unsupported measures. */
function AdditionalMeasures({ selected, pick, match }: { selected: string | null; pick: (c: ExploreChoice) => void; match: (c: ExploreChoice) => boolean }) {
  const { client } = useMobileApi(), { query, compare } = useProgressRange();
  const key = progressRequestKey(query, compare);
  const body = useProgressResource(client, `explore-body|${key}`, useCallback((c, s) => fetchProgressBody(c, query, s), [query]));
  const training = useProgressResource(client, `explore-training|${key}`, useCallback((c, s) => fetchProgressTraining(c, query, s), [query]));
  return <>{[
    { title: 'Cuerpo', read: body, choices: body.data ? bodyChoices(body.data) : [], empty: 'Todavía no hay pesos ni medidas registrados.' },
    { title: 'Ejercicios del período', read: training, choices: training.data ? exerciseChoices(training.data) : [], empty: 'Sin ejercicios completados en este período.' },
  ].map(g => <DynamicGroup key={g.title} {...g} selected={selected} pick={pick} match={match} />)}</>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' }, scrim: { backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: brandTokens.radius.sheet, borderTopRightRadius: brandTokens.radius.sheet, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  title: { flex: 1, textAlign: 'center' }, spacer: { width: 44 },
  content: { padding: 16, paddingTop: 4, gap: 16 },
  group: { gap: 2 }, groupTitle: { fontWeight: '600', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 9 },
  grow: { flex: 1, gap: 1 },
});
