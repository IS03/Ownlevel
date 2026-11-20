import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ProgressEditorialFinding } from '@/api/progress';
import { LinkRow, AppText, Heading, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { InsightRow } from '@/insights/insight-row';
import { exactPeriodDate, exactPeriodRange } from '@/insights/period-model';
import { shortRange } from './progress-range';

export const findingMethodLabel = (method: ProgressEditorialFinding['method']) => ({
  'progress-record': 'Progreso · récord registrado',
  'progress-first-last': 'Progreso · primera y última sesión',
  'progress-nutrition': 'Progreso · promedios entre períodos',
})[method];

function Reference({ item }: {item: ProgressEditorialFinding}) {
  const c = item.coverage, { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions();
  const [methodOpen, setMethodOpen] = useState(false);
  const sample = (days: number | null, eligible: number | null) => days === null ? 'Cobertura no disponible' : `${days}${eligible === null ? '' : ` de ${eligible}`} días utilizados`;
  const nutrition = item.method === 'progress-nutrition';
  const current = nutrition ? { label: 'Actual', range: item.period, sample: sample(c.current, c.eligibleCurrent) }
    : item.method === 'progress-first-last' ? { label: 'Última sesión', range: {start: item.observedDate!, end: item.observedDate!}, sample: null }
    : { label: 'Este período', range: item.period, sample: `${c.current} ${c.current === 1 ? 'serie evaluada' : 'series evaluadas'}` };
  const reference = { label: nutrition ? 'Referencia' : item.method === 'progress-first-last' ? 'Primera sesión' : 'Historial de referencia',
    range: {start: item.reference.start ?? item.reference.end, end: item.reference.end},
    sample: nutrition ? sample(c.reference, c.eligibleReference) : item.method === 'progress-record' ? 'Hasta esta fecha' : null };
  return <View style={styles.detail}>
    <AppText numeric variant="title2">{item.description}</AppText>
    <View style={[styles.pair, {backgroundColor: colors.surfaceRaised}, fontScale > 1.3 && styles.stacked]} testID="finding-period-pair">
      {[reference, current].map(side => <View key={side.label} style={styles.side}>
        <AppText muted variant="caption">{side.label}</AppText>
        <AppText numeric variant="headline">{shortRange(side.range, item.period.end)}</AppText>
        {side.sample ? <AppText numeric muted variant="footnote">{side.sample}</AppText> : null}
      </View>)}
    </View>
    {nutrition ? <AppText muted variant="footnote">Solo días cerrados con ese nutriente completo entre las comidas registradas. No confirma toda la ingesta.</AppText>
      : item.method === 'progress-first-last' ? <AppText muted numeric variant="footnote">{c.current} sesiones con series utilizables.</AppText> : null}
    <LinkRow kind="disclosure" label="Cómo se calculó" expanded={methodOpen} onPress={() => setMethodOpen(v => !v)} />
    {methodOpen ? <View style={styles.method}>
      <AppText muted variant="caption">{findingMethodLabel(item.method)}</AppText>
      {item.method === 'progress-record' ? <>
        <AppText muted numeric variant="footnote">Referencia: historial registrado hasta el {exactPeriodDate(item.reference.end)}, en el mismo modo de carga.</AppText>
        <AppText muted numeric variant="footnote">{c.current} {c.current === 1 ? 'serie del período evaluada' : 'series del período evaluadas'} según el modo de carga registrado.</AppText>
      </> : item.method === 'progress-first-last' ? <>
        <AppText muted numeric variant="footnote">Referencia: sesión del {exactPeriodDate(item.reference.end)} → sesión del {exactPeriodDate(item.observedDate!)}.</AppText>
        <AppText muted variant="footnote">Se comparan la primera y la última sesión, por modo de carga.</AppText>
      </> : <AppText muted variant="footnote">Las coberturas de ambos períodos pueden diferir. El promedio usa los días con dato completo del nutriente entre las entradas registradas; no permite conocer comidas que no registraste.</AppText>}
    </View> : null}
  </View>;
}

/** One expanded observation at a time. All figures arrive in the same confirmed overview reading. */
export function ProgressFindings({ items, selected, onSelect, onOpen, sourcesUnavailable = false }: {
  items: ProgressEditorialFinding[] | undefined; selected: string | null; sourcesUnavailable?: boolean;
  onSelect: (id: string | null) => void; onOpen: (item: ProgressEditorialFinding) => void;
}) {
  if (!items?.length) return <AppText muted variant="footnote" testID="progress-findings">{items === undefined ? 'Los hallazgos no están disponibles en esta lectura.'
    : sourcesUnavailable ? 'No pudimos leer todas las fuentes de hallazgos.' : 'No hay hallazgos para destacar en esta ventana.'}</AppText>;
  return <View style={styles.section} testID="progress-findings">
    <Heading level={2}>Para mirar de cerca</Heading>
    <AppText muted numeric variant="footnote" accessibilityLabel={exactPeriodRange(items[0]!.period)}>{shortRange(items[0]!.period, items[0]!.period.end)}</AppText>
    {items.map(item => <View key={item.id} testID={`progress-finding-${item.id}`}>
          <InsightRow label={`${item.kind === 'record' ? 'Récord' : 'Comparación'} · ${item.title}`}
            detail={selected === item.id ? undefined : item.description} spoken={`Ver referencia de ${item.title}. ${item.description}. ${findingMethodLabel(item.method)}`}
            expanded={selected === item.id} heading onPress={() => onSelect(selected === item.id ? null : item.id)}/>
          {selected === item.id ? <>
            <Reference item={item}/>
            <LinkRow label={item.method === 'progress-nutrition' ? 'Ver días registrados' : 'Abrir ejercicio'} accessibilityLabel={`Ver registros de ${item.title}`} onPress={() => onOpen(item)}/>
          </> : null}
        </View>)}
  </View>;
}

const styles = StyleSheet.create({
  section: {gap: spacing.sm}, detail: {gap: spacing.md, paddingTop: spacing.md},
  pair: {flexDirection: 'row', gap: spacing.lg, padding: spacing.lg, borderRadius: radius.inner},
  stacked: {flexDirection: 'column'}, side: {flex: 1, gap: spacing.xs}, method: {gap: spacing.sm},
});
