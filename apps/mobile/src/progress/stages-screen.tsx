import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useMobileApi } from '@/api';
import { fetchProgressStages, type ProgressStages, type ProgressStageSummary } from '@/api/progress-stages';
import {
  AppText, Button, ChipGroup, EmptyState, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme, useReduceMotion,
} from '@/design-system';
import { haptics } from '@/platform/haptics';
import { EditorialScreen, Reveal } from '@/settings/editorial';
import { StageProgressBar, StageStripe } from '@/stages/stages-ui';
import { arrowDelta, formatValue } from './progress-format';
import { defaultCompare, kindLabel, stageDates, stageLength, stageNotes, stageProgress, stageRows } from './stages-model';
import { useProgressResource } from './use-progress-resource';

const COL = 92;

/** Three numbers of one stage, per day or per week; a missing value says so instead of 0. */
function Numbers({ stage, sources }: { stage: ProgressStageSummary; sources: ProgressStages['sources'] }) {
  const cells = [
    { key: 'eaten', value: sources.nutrition !== 'ok' ? 'No disponible' : stage.eatenKcal === null ? 'Sin dato' : formatValue(stage.eatenKcal, null, 'integer'),
      caption: stage.targetKcal === null ? 'kcal por día' : `kcal por día · objetivo ${formatValue(stage.targetKcal, null, 'integer')}` },
    { key: 'weight', value: sources.body !== 'ok' ? 'No disponible' : stage.weightPerWeekKg === null ? 'Sin dato' : arrowDelta(stage.weightPerWeekKg, 'kg'),
      caption: 'peso por semana' },
    { key: 'training', value: sources.training !== 'ok' ? 'No disponible' : stage.trainingDaysPerWeek === null ? 'Sin dato' : formatValue(stage.trainingDaysPerWeek, null),
      caption: 'entrenos por semana' },
  ];
  return <View style={styles.numbers} testID="stages-numbers">
    {cells.map(c => <View key={c.key} style={styles.number} accessible accessibilityLabel={`${c.value}, ${c.caption}`}>
      <AppText numeric variant="title2">{c.value}</AppText>
      <AppText muted variant="caption">{c.caption}</AppText>
    </View>)}
  </View>;
}

/** Columns side by side: the one you are looking at in champagne, the rest neutral. */
function Table({ stages, highlight, sources, testID, onPick }: {
  stages: ProgressStageSummary[]; highlight: string; sources: ProgressStages['sources']; testID: string; onPick?: (id: string) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const rows = stageRows(sources);
  const scroll = stages.length > 2;
  const body = <View>
    <View style={styles.tr}>
      <View style={styles.th} />
      {stages.map(s => <Pressable key={s.id} disabled={!onPick} accessibilityRole={onPick ? 'button' : undefined}
        accessibilityLabel={onPick ? `Ver ${s.name}` : undefined} onPress={() => { haptics.selection(); onPick?.(s.id); }}
        style={[styles.td, scroll && { width: COL }]}>
        <AppText variant="headline" numberOfLines={2} style={[styles.right, s.id === highlight && { color: colors.primary }]}>{s.name}</AppText>
      </Pressable>)}
    </View>
    {rows.map(r => <View key={r.key} style={[styles.tr, { borderTopColor: colors.border }, styles.rule]} testID={`${testID}-${r.key}`}>
      <AppText muted variant="footnote" style={styles.th}>{r.label}</AppText>
      {stages.map(s => {
        const v = r.value(s), empty = v === 'Sin dato' || v === 'No disponible';
        return <AppText key={s.id} numeric variant={empty ? 'footnote' : 'headline'} muted={empty}
          style={[styles.td, styles.right, scroll && { width: COL }, !empty && s.id === highlight && { color: colors.primary }]}>{v}</AppText>;
      })}
    </View>)}
  </View>;
  return <View testID={testID}>{scroll ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{body}</ScrollView> : body}</View>;
}

function Content({ data }: { data: ProgressStages }) {
  const router = useRouter();
  const reduced = useReduceMotion();
  const [selected, setSelected] = useState(data.stages[0].id);
  const a = data.stages.find(s => s.id === selected) ?? data.stages[0];
  const [compareWith, setCompareWith] = useState<string | null>(() => defaultCompare(data.stages, a.id));
  const b = data.stages.find(s => s.id === compareWith && s.id !== a.id) ?? data.stages.find(s => s.id === defaultCompare(data.stages, a.id)) ?? null;
  const [all, setAll] = useState(false);
  const progress = stageProgress(a);
  const notes = stageNotes(data.stages);
  const fade = FadeIn.duration(reduced ? 0 : 200);
  const pick = (id: string) => { setSelected(id); setCompareWith(defaultCompare(data.stages, id)); };
  return <>
    <Reveal index={1}>
      <View style={styles.section} testID="stages-selected">
        <AppText muted variant="caption" style={styles.eyebrow}>{a.status === 'current' ? 'AHORA' : 'ETAPA'}</AppText>
        <View style={styles.titleRow}><StageStripe kind={a.kind} /><View style={styles.grow}>
          <Heading level={2}>{a.name}</Heading>
          <AppText muted numeric variant="footnote">{`${kindLabel(a.kind)} · ${stageDates(a)} · ${stageLength(a)}`}</AppText>
        </View></View>
        {progress !== null ? <StageProgressBar value={progress} /> : null}
        <Numbers stage={a} sources={data.sources} />
      </View>
    </Reveal>
    {data.stages.length < 2 ? <Reveal index={2}><View style={styles.section} testID="stages-single">
      <AppText muted>Por ahora tenés una sola etapa. Cuando empiece la próxima, vas a poder compararlas acá.</AppText>
      {!data.hasUpcoming ? <Button label="Programar la próxima etapa" variant="quiet" onPress={() => router.push('/settings/stage-action')} /> : null}
    </View></Reveal> : <>
      <Reveal index={2}><View style={styles.section} testID="stages-compare">
        <Heading level={2}>Comparar con</Heading>
        <ChipGroup accessibilityLabel="Etapa para comparar" value={b?.id ?? ''} onChange={id => { haptics.selection(); setCompareWith(id); }}
          options={data.stages.filter(s => s.id !== a.id).map(s => ({ value: s.id, label: s.name }))} />
        {b ? <Animated.View key={b.id} entering={fade} exiting={FadeOut.duration(reduced ? 0 : 150)}>
          <Table testID="stages-pair" stages={[a, b]} highlight={a.id} sources={data.sources} />
        </Animated.View> : null}
      </View></Reveal>
      {data.stages.length > 2 ? <Reveal index={3}>{all
        ? <Animated.View entering={fade} style={styles.section} testID="stages-all">
          <Heading level={2}>Todas tus etapas</Heading>
          <AppText muted variant="footnote">Tocá una etapa para verla arriba.</AppText>
          <Table testID="stages-all-table" stages={data.stages} highlight={a.id} sources={data.sources} onPick={pick} />
        </Animated.View>
        : <Button label={`Ver las ${data.stages.length} etapas`} variant="quiet" onPress={() => { haptics.selection(); setAll(true); }} />}
      </Reveal> : null}
    </>}
    {notes.length ? <AppText muted variant="footnote" testID="stages-notes">{notes.join(' ')}</AppText> : null}
  </>;
}

/** Progreso › Tus etapas: one stage first, one comparison next, everything only if you ask for it. */
export function ProgressStagesScreen() {
  const router = useRouter();
  const { client } = useMobileApi();
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressStages(c, signal), []);
  const { state, data, refresh } = useProgressResource(client, 'stages', load);
  return <EditorialScreen>
    <Heading>Tus etapas</Heading>
    <AppText muted>Lo que pasó de verdad en cada una, por día o por semana.</AppText>
    {state.status === 'loading' ? <View style={styles.section} testID="stages-loading"><SkeletonBlock height={120} /><SkeletonBlock height={180} /></View>
      : !data ? <UnavailableState title="No pudimos cargar tus etapas" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
        action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
        {data.stages.length ? <Content data={data} /> : <EmptyState title="Todavía no tenés etapas"
          description="Cuando armes tu plan por etapas, acá vas a ver cómo te fue en cada una."
          action={<Button label="Armar mi plan" variant="secondary" onPress={() => router.push('/settings/stages')} />} />}
      </>}
  </EditorialScreen>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  eyebrow: { letterSpacing: 1 },
  titleRow: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1, gap: 2 },
  numbers: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.xs },
  number: { flex: 1, gap: 2 },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: spacing.sm },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
  th: { width: 104 },
  td: { flex: 1 },
  right: { textAlign: 'right' },
});
