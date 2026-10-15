import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMobileApi } from '@/api';
import { progressRequestKey } from '@/api/progress';
import type { InfluenceViewDefinition } from '@/api/progress-views';
import { fetchProgressInfluence, influenceDefinitionKey, validInfluenceDefinition, type InfluenceDefinition, type InfluenceReading, type InfluenceSuggestedKey } from '@/api/progress-influence';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme, type AppIconName } from '@/design-system';
import { ProgressScroll } from './progress-scroll';
import { ProgressRow } from './progress-row';
import { useProgressRange } from './progress-range-context';
import { useProgressResource } from './use-progress-resource';
import { CAUTION, LAG_LABELS, QUESTIONS, answerText, groupLabels, questionText, shortAnswer, valueText } from './influence-model';
import { PinViewSheet } from './pin-view-sheet';

function Detail({ title, detail, icon, onPress, testID }: { title: string; detail?: string; icon: AppIconName; onPress?: () => void; testID?: string }) {
  const { colors } = useOwnlevelTheme();
  return <ProgressRow label={`${title}${detail ? `. ${detail}` : ''}`} onPress={onPress} testID={testID}>
    <AppIcon name={icon} color={colors.textMuted} size={20} /><View style={styles.grow}><AppText variant="headline">{title}</AppText>{detail ? <AppText muted numeric variant="footnote">{detail}</AppText> : null}</View>
  </ProgressRow>;
}
function Answer({ data }: { data: InfluenceReading }) {
  const { colors } = useOwnlevelTheme(), { state, setState, today, compareOn, compareText } = useProgressRange();
  const r = data.current, ref = data.reference;
  const labels = groupLabels(data);
  return <>
    {r.status === 'ok' ? <View style={styles.section}>
      <AppText variant="headline" testID="influence-answer-text">{answerText(data)}</AppText>
      {data.definition.outcome.startsWith('training.') ? <AppText muted variant="footnote">sobre días que entrenaste</AppText> : null}
      <AppText muted numeric>{valueText(Math.abs(r.difference), data.measure.outcome)} {r.difference < 0 ? 'menos' : r.difference > 0 ? 'más' : 'de diferencia'}{r.differencePercent !== null ? ` · ${`${Math.round(Math.abs(r.differencePercent))} %`}` : ''}</AppText>
      <View style={styles.section} testID="influence-bars">{[r.high, r.low].map((group, i) => {
        const text = `${valueText(group.average, data.measure.outcome)} · ${group.days.length} días`;
        return <View key={i} accessible accessibilityLabel={`${labels[i]}: ${text}`} style={{ gap: spacing.xs }}>
          <View style={styles.barLabel}><AppText variant="headline" style={styles.grow}>{labels[i]}</AppText><AppText muted numeric variant="footnote">{text}</AppText></View>
          <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}><View testID={`influence-bar-${i}`} style={{ height: '100%', backgroundColor: colors.primary, opacity: i ? 0.4 : 1,
            width: `${Math.max(0, group.average) / Math.max(0, r.high.average, r.low.average, 1e-9) * 100}%`, borderRadius: 10 }} /></View>
          {group.average < 0 ? <AppText muted variant="caption">Valor negativo: se muestra en el número, sin barra.</AppText> : null}
        </View>;
      })}</View>
      <Detail title="Evidencia" icon="progress" detail={`${{ low: 'Poca', moderate: 'Moderada', clear: 'Clara' }[r.evidence]} · ${r.pairs} días con los dos datos`} />
    </View> : <View style={styles.section} testID="influence-insufficient">
      <Heading level={2}>Todavía no alcanza</Heading>
      <AppText muted>Hay {r.pairs} días con los dos datos en este período. Hacen falta al menos 14, con 5 en cada grupo, para comparar sin adivinar.</AppText>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 14, now: Math.min(r.pairs, 14), text: `${r.pairs} de 14 días` }} style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={{ width: `${Math.min(r.pairs / 14, 1) * 100}%`, backgroundColor: colors.textMuted, height: '100%', borderRadius: 10 }} />
      </View><AppText muted numeric>{r.pairs} de 14 días</AppText>
      <Detail title="Probá un período más largo" icon="calendar" testID="influence-longer" onPress={() => setState({ ...state, unit: '3m', anchor: today, custom: null })} />
      <Detail title={`${data.measure[r.missing].label} es lo que más falta`} icon="info" />
    </View>}
    {r.status === 'ok' && compareOn && ref ? <Detail title="Comparando" icon="compare" testID="influence-comparison" detail={`Frente a ${compareText}: ${ref.status === 'ok' ? `${valueText(ref.high.average, data.measure.outcome, false)} y ${valueText(ref.low.average, data.measure.outcome)}` : 'no alcanza'}`} /> : null}
    <Detail title="Ojo" icon="info" detail={CAUTION} />
  </>;
}
function Reading({ definition, questionKey }: { definition: InfluenceDefinition; questionKey?: string }) {
  const { colors } = useOwnlevelTheme();
  const [pinOpen, setPinOpen] = useState(false), [pinned, setPinned] = useState<string | null>(null);
  const definitionKey = influenceDefinitionKey(definition);
  const { client } = useMobileApi(), { query, compare } = useProgressRange();
  const { state, data, refresh } = useProgressResource(client, `influence|${progressRequestKey(query, compare)}|${influenceDefinitionKey(definition)}`,
    useCallback((c, s) => fetchProgressInfluence(c, query, definition, s, compare), [query, compare, definition]));
  const title = questionKey && Object.hasOwn(QUESTIONS, questionKey) ? QUESTIONS[questionKey as InfluenceSuggestedKey].title
    : data ? questionText(definition, data.measure.split, data.measure.outcome) : 'Tu pregunta';
  return <ProgressScroll title={title} multilineTitle compactTitle="Qué influye" testID="influence-answer-screen">
    {state.status === 'loading' ? <SkeletonBlock height={240} /> : data ? <>
      {state.status !== 'ready' ? <InlineUnavailable message="No se pudo actualizar. Mostramos la última lectura confirmada." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
      <AppText muted>{definition.split === 'day.training' ? 'Días con y sin entrenamiento' : definition.split === 'day.work' ? 'Días laborales y no laborales'
        : `${data.measure.split.label} ${LAG_LABELS[definition.lag]}`}{definition.split.startsWith('day.') && definition.lag ? (definition.lag === 1 ? ', el día siguiente' : ', 2 días después') : ''} · {data.measure.outcome.label.toLocaleLowerCase('es-AR')} del día</AppText>
      <Answer data={data} />
      {pinned === definitionKey ? <View style={styles.pinned} testID="influence-pinned"><AppIcon name="check" color={colors.primary} size={20} /><AppText variant="headline" style={{ color: colors.primary }}>Fijada en Mis vistas</AppText></View>
        : <ProgressRow label="Fijar en Mis vistas" testID="influence-pin" onPress={() => setPinOpen(true)}><AppIcon name="pin" color={colors.primary} size={20} /><AppText variant="headline" style={{ flex: 1, color: colors.primary }}>Fijar en Mis vistas</AppText></ProgressRow>}
      {pinOpen ? <PinViewSheet key={definitionKey} label={title} suggestedName={title.slice(0, 60)}
        definition={{ kind: 'influence', measure: definition.outcome, split: definition.split, cut: definition.cut, lag: definition.lag } satisfies InfluenceViewDefinition}
        preview={shortAnswer(data)} onPinned={() => setPinned(definitionKey)} onClose={() => setPinOpen(false)} /> : null}
    </> : <UnavailableState title="No pudimos cargar la respuesta" description="Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />}
  </ProgressScroll>;
}
export function InfluenceAnswerScreen() {
  const params = useLocalSearchParams<{ split?: string; cut?: string; lag?: string; outcome?: string; key?: string }>();
  const definition = { split: params.split, cut: params.cut, lag: Number(params.lag), outcome: params.outcome } as InfluenceDefinition;
  if (typeof definition.split !== 'string' || typeof definition.cut !== 'string' || typeof definition.outcome !== 'string' || !['0', '1', '2'].includes(params.lag ?? '') || !validInfluenceDefinition(definition))
    return <ProgressScroll title="Tu pregunta" testID="influence-answer-screen"><AppText muted>Esta pregunta no es válida. Volvé a armarla.</AppText></ProgressScroll>;
  return <Reading definition={definition} questionKey={params.key} />;
}
const styles = StyleSheet.create({ section: { gap: spacing.md }, grow: { flex: 1 }, barLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }, track: { height: 10, borderRadius: 10, overflow: 'hidden' }, pinned: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50 } });
