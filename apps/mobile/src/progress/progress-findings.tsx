import { StyleSheet, View } from 'react-native';
import type { ProgressEditorialFinding } from '@/api/progress';
import { AppText, Button, Heading, spacing } from '@/design-system';
import { InsightRow } from '@/insights/insight-row';
import { exactPeriodDate, exactPeriodRange } from '@/insights/period-model';

export const findingMethodLabel = (method: ProgressEditorialFinding['method']) => ({
  'progress-record': 'Progreso · récord registrado',
  'progress-first-last': 'Progreso · primera y última sesión',
  'progress-nutrition': 'Progreso · promedios entre períodos',
})[method];

function Reference({ item }: {item: ProgressEditorialFinding}) {
  const c = item.coverage;
  return <View style={styles.detail}>
    {item.method === 'progress-record' ? <>
      <AppText muted numeric>Referencia: historial registrado hasta el {exactPeriodDate(item.reference.end)}, en el mismo modo de carga.</AppText>
      <AppText muted numeric>{c.current} {c.current === 1 ? 'serie del período evaluada' : 'series del período evaluadas'} según el modo de carga registrado.</AppText>
    </> : item.method === 'progress-first-last' ? <>
      <AppText muted numeric>Referencia: sesión del {exactPeriodDate(item.reference.end)} → sesión del {exactPeriodDate(item.observedDate!)}.</AppText>
      <AppText muted numeric>{c.current} sesiones con series utilizables; se comparan la primera y la última, por modo de carga.</AppText>
    </> : <>
      <AppText muted numeric>Referencia: {exactPeriodRange({start: item.reference.start!, end: item.reference.end})}.</AppText>
      <AppText muted numeric>Actual: {c.current} de {c.eligibleCurrent} días. Referencia: {c.reference} de {c.eligibleReference} días.</AppText>
      <AppText muted>Días cerrados con dato completo del nutriente entre las comidas registradas. Las coberturas pueden diferir; esto no confirma toda la ingesta.</AppText>
    </>}
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
    <AppText muted numeric variant="footnote">{exactPeriodRange(items[0]!.period)}</AppText>
    {items.map(item => <View key={item.id} testID={`progress-finding-${item.id}`}>
          <InsightRow label={`${item.kind === 'record' ? 'Récord' : 'Comparación'} · ${item.title}`}
            detail={`${item.description}\n${findingMethodLabel(item.method)}`} spoken={`Ver referencia de ${item.title}. ${item.description}. ${findingMethodLabel(item.method)}`}
            expanded={selected === item.id} heading onPress={() => onSelect(selected === item.id ? null : item.id)}/>
          {selected === item.id ? <>
            <Reference item={item}/>
            <Button variant="quiet" label={`Ver registros de ${item.title}`} onPress={() => onOpen(item)}/>
          </> : null}
        </View>)}
  </View>;
}

const styles = StyleSheet.create({section: {gap: spacing.sm}, detail: {gap: spacing.xs, paddingTop: spacing.sm}});
