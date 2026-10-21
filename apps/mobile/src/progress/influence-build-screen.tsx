import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { parseInfluenceMeasure, validInfluenceDefinition, influenceCutValue, type InfluenceDefinition, type InfluenceMeasureInfo } from '@/api/progress-influence';
import { AppText, Button, GlassSurface, SegmentedControl, spacing } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { RoutineSheetButton } from '@/training/routine-sheet-button';
import { MeasureSheet, OptionSheet } from './explore-sheets';
import type { ExploreChoice } from './explore-model';
import { choiceFor, measureInfo, questionText, valueText } from './influence-model';
import { ProgressScroll } from './progress-scroll';
import { ProgressRow } from './progress-row';

function CutSheet({ cut, measure, onChange, onClose }: { cut: string; measure: InfluenceMeasureInfo; onChange: (cut: string) => void; onClose: () => void }) {
  const step = measure.unit === 'kcal' ? 50 : measure.valueType === 'duration' ? 15 : measure.unit === 'g' ? 10 : 1;
  const [custom, setCustom] = useState(() => influenceCutValue(cut) ?? (measure.unit === 'g' ? 300 : measure.unit === 'kcal' ? 2000 : measure.valueType === 'duration' ? 420 : 1));
  const change = (delta: number) => { const n = Math.max(0, custom + delta); setCustom(n); onChange(`gte:${n}`); triggerHaptic('stepperChange'); };
  return <OptionSheet title="Cómo separar los días" selected={cut === 'median' ? 'median' : 'custom'} onClose={onClose} closeOnPick={false}
    options={[{ key: 'median', label: 'Arriba / abajo de tu mediana', detail: 'Grupos parejos' }, { key: 'custom', label: 'Un corte propio', detail: '' }]}
    onPick={key => onChange(key === 'median' ? 'median' : `gte:${custom}`)}>
    {cut !== 'median' ? <GlassSurface style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel="Bajar corte" accessibilityState={{ disabled: custom === 0 }} disabled={custom === 0} onPress={() => change(-step)} style={styles.minus}><AppText>−</AppText></Pressable>
      <AppText numeric variant="headline" style={styles.center}>{valueText(custom, measure)} o más</AppText>
      <RoutineSheetButton label="Subir corte" icon="plus" onPress={() => change(step)} />
    </GlassSurface> : null}
    <AppText muted variant="footnote">Con menos de 5 días en un grupo no se muestra una respuesta.</AppText>
  </OptionSheet>;
}
function Field({ title, value, onPress, testID }: { title: string; value: string; onPress?: () => void; testID: string }) {
  return <ProgressRow label={`${title}. ${value}`} onPress={onPress} testID={testID}>
    <AppText muted style={styles.fieldLabel}>{title}</AppText><AppText variant="headline" style={styles.fieldValue}>{value}</AppText>
  </ProgressRow>;
}
export function InfluenceBuildScreen() {
  const router = useRouter(), params = useLocalSearchParams<{ outcome?: string; outcomeLabel?: string }>();
  const [split, setSplit] = useState<ExploreChoice | null>(null);
  const [outcome, setOutcome] = useState<ExploreChoice | null>(() => typeof params.outcome === 'string' && parseInfluenceMeasure(params.outcome, 'outcome')
    ? { ...choiceFor(params.outcome)!, ...(params.outcomeLabel ? { label: params.outcomeLabel } : {}) } : null);
  const [cut, setCut] = useState('median'), [lag, setLag] = useState<0 | 1 | 2>(0), [sheet, setSheet] = useState<'split' | 'outcome' | 'cut' | null>(null);
  const definition: InfluenceDefinition = { split: split?.key ?? '', cut, lag, outcome: outcome?.key ?? '' };
  const valid = validInfluenceDefinition(definition), splitInfo = split ? measureInfo(split) : null, outcomeInfo = outcome ? measureInfo(outcome) : null;
  const cutLabel = cut === 'yes' ? 'Sí / no' : cut === 'median' ? 'Arriba / abajo de tu mediana' : splitInfo ? `${valueText(influenceCutValue(cut)!, splitInfo)} o más` : 'Un corte propio';
  return <ProgressScroll title="Tu pregunta" testID="influence-build-screen">
    <View>
      <Field title="Separar por" value={split?.label ?? 'Elegí una medida'} testID="influence-split" onPress={() => setSheet('split')} />
      {/* How to split only means something once there is something to split. */}
      {split ? <Field title="Cómo" value={cutLabel} testID="influence-cut" onPress={cut !== 'yes' ? () => setSheet('cut') : undefined} /> : null}
      <Field title="Qué medir" value={outcome?.label ?? 'Elegí una medida'} testID="influence-outcome" onPress={() => setSheet('outcome')} />
    </View>
    <View style={styles.section}>
      <AppText muted variant="footnote">Cuándo mirarlo</AppText>
      <SegmentedControl accessibilityLabel="Cuándo mirar la medida" value={String(lag)} options={[{ value: '0', label: 'Ese día' }, { value: '1', label: 'Al otro día' }, { value: '2', label: 'A los 2 días' }]}
        onChange={value => setLag(Number(value) as 0 | 1 | 2)} />
    </View>
    <View style={styles.section}>
      <AppText muted>Tu pregunta</AppText>
      {splitInfo && outcomeInfo ? <AppText variant="headline">{questionText(definition, splitInfo, outcomeInfo)}</AppText> : <AppText muted>Elegí qué separa tus días y qué querés mirar.</AppText>}
      {splitInfo && cut === 'median' ? <AppText muted variant="footnote">Se comparan los días por encima y por debajo de tu mediana del período.</AppText> : null}
      {split && outcome && !valid ? <AppText muted variant="footnote">Para mirar la misma medida, elegí otro día.</AppText> : null}
    </View>
    <Button label="Ver respuesta" testID="influence-see-answer" disabled={!valid} onPress={() => { if (valid) router.push({ pathname: '/(tabs)/progress/influence/answer', params: { ...definition, lag: String(lag) } }); }} />
    {sheet === 'split' || sheet === 'outcome' ? <MeasureSheet influenceRole={sheet} selected={sheet === 'split' ? split?.key ?? null : outcome?.key ?? null} onClose={() => setSheet(null)}
      onPick={choice => { if (sheet === 'split') { setSplit(choice); setCut(choice.key.startsWith('day.') ? 'yes' : 'median'); } else setOutcome(choice); }} /> : null}
    {sheet === 'cut' && splitInfo ? <CutSheet cut={cut} measure={splitInfo} onChange={setCut} onClose={() => setSheet(null)} /> : null}
  </ProgressScroll>;
}
const styles = StyleSheet.create({ section: { gap: spacing.xs }, fieldLabel: { width: 96 }, fieldValue: { flex: 1, textAlign: 'right' }, stepper: { flexDirection: 'row', alignItems: 'center', padding: spacing.xs }, center: { flex: 1, textAlign: 'center' }, minus: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
