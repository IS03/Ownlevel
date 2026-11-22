import { Alert, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ProgressEditorialFinding } from '@/api/progress';
import { LinkRow, AppIcon, AppText, Heading, brandTokens, radius, spacing, useOwnlevelTheme, useFieldSurface } from '@/design-system';
import { InsightRow } from '@/insights/insight-row';
import { exactPeriodDate } from '@/insights/period-model';
import { haptics } from '@/platform/haptics';
import { shortRange } from './progress-range';

export const findingMethodLabel = (method: ProgressEditorialFinding['method']) => ({
  'progress-record': 'Progreso · récord registrado',
  'progress-first-last': 'Progreso · primera y última sesión',
  'progress-nutrition': 'Progreso · promedios entre períodos',
})[method];

/** One direct native explanation; the compared dates and sample sizes remain visible in the observation. */
export function findingExplanation(item: ProgressEditorialFinding) {
  const c = item.coverage;
  if (item.method === 'progress-nutrition') return 'Se comparan promedios por día utilizado. Solo entran días cerrados con ese nutriente completo entre las comidas registradas. Las coberturas pueden diferir; esto no confirma toda la ingesta.';
  if (item.method === 'progress-first-last') return `Se comparan la primera sesión (${exactPeriodDate(item.reference.end)}) y la última (${exactPeriodDate(item.observedDate!)}), por modo de carga. ${c.current} sesiones con series utilizables.`;
  return `Se evalúan ${c.current} ${c.current === 1 ? 'serie del período' : 'series del período'} frente al historial registrado hasta el ${exactPeriodDate(item.reference.end)}, en el mismo modo de carga.`;
}
function Reference({ item }: { item: ProgressEditorialFinding }) {
  const c = item.coverage, { fontScale } = useWindowDimensions(), surface = useFieldSurface('tile');
  const sample = (days: number | null, eligible: number | null) => days === null ? 'Cobertura no disponible' : `${days}${eligible === null ? '' : ` de ${eligible}`} días utilizados`;
  const nutrition = item.method === 'progress-nutrition';
  const current = nutrition ? { label: 'Actual', range: item.period, sample: sample(c.current, c.eligibleCurrent) }
    : item.method === 'progress-first-last' ? { label: 'Última sesión', range: { start: item.observedDate!, end: item.observedDate! }, sample: null }
    : { label: 'Este período', range: item.period, sample: `${c.current} ${c.current === 1 ? 'serie evaluada' : 'series evaluadas'}` };
  const reference = { label: nutrition ? 'Referencia' : item.method === 'progress-first-last' ? 'Primera sesión' : 'Historial de referencia',
    range: { start: item.reference.start ?? item.reference.end, end: item.reference.end },
    sample: nutrition ? sample(c.reference, c.eligibleReference) : item.method === 'progress-record' ? 'Hasta esta fecha' : null };
  return <View style={styles.detail}>
    <AppText numeric variant="headline">{item.description}</AppText>
    <View style={[styles.pair, surface, fontScale > 1.3 && styles.stacked]} testID="finding-period-pair">
      {[reference, current].map(side => <View key={side.label} style={styles.side}>
        <AppText muted variant="caption">{side.label}</AppText>
        <AppText numeric variant="headline">{shortRange(side.range, item.period.end)}</AppText>
        {side.sample ? <AppText numeric muted variant="footnote">{side.sample}</AppText> : null}
      </View>)}
    </View>
  </View>;
}

/** One expanded observation at a time. All figures arrive in the same confirmed overview reading. */
export function ProgressFindings({ items, selected, onSelect, onOpen, sourcesUnavailable = false }: {
  items: ProgressEditorialFinding[] | undefined; selected: string | null; sourcesUnavailable?: boolean;
  onSelect: (id: string | null) => void; onOpen: (item: ProgressEditorialFinding) => void;
}) {
  const { colors } = useOwnlevelTheme();
  if (!items?.length) return <AppText muted variant="footnote" testID="progress-findings">{items === undefined ? 'Los hallazgos no están disponibles en esta lectura.'
    : sourcesUnavailable ? 'No pudimos leer todas las fuentes de hallazgos.' : 'No hay hallazgos para destacar en esta ventana.'}</AppText>;
  return <View style={styles.section} testID="progress-findings">
    <Heading level={2}>Para mirar de cerca</Heading>
    {items.map(item => <View key={item.id} testID={`progress-finding-${item.id}`}>
      <View style={styles.heading}>
        <View style={styles.grow}><InsightRow label={`${item.kind === 'record' ? 'Récord' : 'Comparación'} · ${item.title}`}
          detail={selected === item.id ? undefined : `${item.description}${item.method === 'progress-nutrition' ? `\nvs. ${shortRange({ start: item.reference.start ?? item.reference.end, end: item.reference.end }, item.period.end)}` : ''}`}
          spoken={`Ver referencia de ${item.title}. ${item.description}. ${findingMethodLabel(item.method)}`}
          expanded={selected === item.id} heading onPress={() => onSelect(selected === item.id ? null : item.id)} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Cómo se calculó: ${item.title}`} testID={`finding-info-${item.id}`}
          onPress={() => { haptics.selection(); Alert.alert(item.title, findingExplanation(item), [{ text: 'Listo', style: 'cancel' }]); }}
          style={({ pressed }) => [styles.info, pressed && { opacity: 0.6 }]}>
          <AppIcon name="info" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      {selected === item.id ? <>
        <Reference item={item} />
        <LinkRow label={item.method === 'progress-nutrition' ? 'Ver días registrados' : 'Abrir ejercicio'} accessibilityLabel={`Ver registros de ${item.title}`} onPress={() => onOpen(item)} />
      </> : null}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm }, detail: { gap: spacing.md, paddingTop: spacing.sm }, heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, grow: { flex: 1, minWidth: 0 },
  info: { minWidth: brandTokens.layout.minTouch, minHeight: brandTokens.layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  pair: { flexDirection: 'row', gap: spacing.lg, padding: spacing.md, borderRadius: radius.inner, overflow: 'hidden' },
  stacked: { flexDirection: 'column' }, side: { flex: 1, gap: spacing.xs },
});
