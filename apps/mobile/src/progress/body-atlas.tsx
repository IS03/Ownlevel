import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BODY_MEASUREMENT_FIELDS, BODY_MEASUREMENT_LABELS } from '@/api/body';
import type { ProgressBody, ProgressBodyMetric } from '@/api/progress';
import { LinkRow, AppIcon, AppSheet, AppText, Button, Heading, brandTokens, radius, sizes, spacing, useOwnlevelTheme, useAppSheetDismiss } from '@/design-system';
import { formatBodyDate } from '@/body/body-model';
import { bodyObservationHref } from './body-chart-navigation';
import { arrowDelta, formatValue } from './progress-format';
import { bodyInterval, defaultBodyPair, equivalentPerWeek, measuresComparable } from './body-context-model';
import { BodyIntervalContext, WeeklyWeightReference } from './body-context';

export const BODY_CHOICES = [
  { key: 'body.weight', label: 'Peso' },
  ...BODY_MEASUREMENT_FIELDS.map(field => ({
    key: `body.${field.replace(/Cm$/, '').replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)}`,
    label: BODY_MEASUREMENT_LABELS[field],
  })),
];
const ZONES = [
  { label: 'Tronco', keys: ['body.waist', 'body.abdomen', 'body.chest', 'body.hip'] },
  { label: 'Brazos', keys: ['body.arm_right', 'body.arm_left'] },
  { label: 'Muslos', keys: ['body.thigh_right', 'body.thigh_left'] },
  { label: 'Pantorrillas', keys: ['body.calf_right', 'body.calf_left'] },
];
export const bodyDates = (metrics: readonly ProgressBodyMetric[]) => [...new Set(metrics.flatMap(m => m.observations.filter(o => Number.isFinite(o.value) && o.value > 0).map(o => o.date)))].sort();
/** Exact-date lookup only: never carry an earlier observation into an unrecorded day. */
export function bodyDatePair(metric: ProgressBodyMetric, a: string, b: string) {
  const find = (date: string) => metric.observations.find(o => o.date === date && Number.isFinite(o.value) && o.value > 0) ?? null;
  const first = find(a), last = find(b);
  return { first, last, change: first && last && a !== b ? last.value - first.value : null };
}
const difference = (value: number, unit: string) => Math.abs(value) < 1e-9 ? `= ${formatValue(0, unit)}`
  : Math.abs(value) < 0.005 ? `${value < 0 ? '↘' : '↗'} menos de 0,01 ${unit}` : arrowDelta(value, unit);

export function BodyMetricPicker({ selected }: { selected: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const label = BODY_CHOICES.find(m => m.key === selected)?.label ?? 'Medida';
  return <>
    <LinkRow label="Medida" value={label} onPress={() => setOpen(true)} />
    {open ? <AppSheet onClose={() => setOpen(false)} closeLabel="Cerrar selector de medida" style={{ backgroundColor: colors.background, maxHeight: '85%' }}>
      <ScrollView contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false}>
        <Heading level={2}>Qué querés mirar</Heading>
        {BODY_CHOICES.map(m => <SheetChoice key={m.key} label={m.label} selected={m.key === selected} onChoose={() => router.setParams({ metric: m.key })} />)}
        <SheetChoice label="Cerrar" />
      </ScrollView>
    </AppSheet> : null}
  </>;
}

export function BodyZones({ data, onRegister, disabled }: { data: ProgressBody; onRegister?: () => void; disabled?: boolean }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale, width } = useWindowDimensions();
  const router = useRouter();
  const stacked = fontScale > 1.3 || width < 375;
  const [zoneKey, setZoneKey] = useState<string | null>(null);
  const opened = ZONES.find(zone => zone.label === zoneKey);
  const value = (key: string) => {
    const latest = data.metrics.find(m => m.key === key)?.latest;
    return latest && Number.isFinite(latest.value) && latest.value > 0 ? latest : null;
  };
  const outside = (date: string) => date < data.period.start || date > data.period.end;
  const metricLabel = (key: string) => BODY_CHOICES.find(m => m.key === key)!.label;
  const line = (key: string) => {
    const latest = value(key);
    return `${metricLabel(key)}, ${latest ? `${formatValue(latest.value, 'cm')}, ${formatBodyDate(latest.date)}${outside(latest.date) ? ', fuera del período' : ''}` : 'sin registro válido'}`;
  };
  return <View style={styles.section} testID="body-zones">
    <View style={[styles.zoneHeader, stacked && styles.stacked]}>
      <Heading level={2} style={styles.grow}>Tu cuerpo, por zonas</Heading>
      {onRegister ? <Button label="Medir" variant="quiet" disabled={disabled} onPress={onRegister} /> : null}
    </View>
    <AppText muted variant="footnote">Cada medida conserva la fecha de su último registro. Abrí una zona para explorarla.</AppText>
    <View style={styles.grid}>{ZONES.map(zone => {
      const shown = zone.keys.length > 2 ? [zone.keys.find(key => value(key)) ?? zone.keys[0]] : zone.keys;
      return <Pressable key={zone.label} accessibilityRole="button" accessibilityLabel={`${zone.label}. ${shown.map(line).join('. ')}. Explorar zona.`}
        testID={`body-zone-${zone.label}`} onPress={() => setZoneKey(zone.label)}
        style={({ pressed }) => [styles.card, stacked ? styles.full : styles.half, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
        <View style={styles.zoneHeader}><AppText variant="headline" style={styles.grow}>{zone.label}</AppText><AppIcon name="chevronRight" color={colors.textMuted} /></View>
        {shown.map(key => {
          const latest = value(key);
          return <View key={key} style={styles.zoneMetric}>
            <AppText muted variant="caption">{metricLabel(key)}</AppText>
            <AppText numeric variant="title2">{latest ? formatValue(latest.value, 'cm') : '—'}</AppText>
            <AppText muted numeric variant="caption">{latest ? formatBodyDate(latest.date) : 'Sin registro válido'}</AppText>
            {latest && outside(latest.date) ? <AppText muted variant="caption">Fuera del período</AppText> : null}
          </View>;
        })}
        {zone.keys.length > 2 ? <AppText muted variant="caption">Cintura, abdomen, pecho y cadera</AppText> : null}
      </Pressable>;
    })}</View>
    {opened ? <AppSheet testID="body-zone-sheet" onClose={() => setZoneKey(null)} closeLabel="Cerrar zona" style={{ backgroundColor: colors.background, maxHeight: '85%' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheet}>
        <Heading level={2}>{opened.label}</Heading>
        {opened.keys.map(key => <SheetChoice key={key} label={line(key)} onChoose={() => router.push({ pathname: '/(tabs)/progress/trends/body', params: { metric: key } })} />)}
        <SheetChoice label="Cerrar" />
      </ScrollView>
    </AppSheet> : null}
  </View>;
}

function SheetChoice({ label, selected, onChoose }: { label: string; selected?: boolean; onChoose?: () => void }) {
  const dismiss = useAppSheetDismiss();
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} style={styles.pickerRow} onPress={() => dismiss(onChoose)}>
    <AppText variant="headline">{label}</AppText>
    {selected ? <AppIcon name="checkmark" color={colors.primary} /> : null}
  </Pressable>;
}

function DateChoice({ dates, label, value, onChange }: { dates: string[]; label: string; value: string; onChange: (date: string) => void }) {
  const [open, setOpen] = useState(false);
  const { colors } = useOwnlevelTheme();
  return <View>
    <LinkRow label={label} value={value ? formatBodyDate(value) : 'Sin registros'} numeric onPress={() => setOpen(true)} disabled={!dates.length} />
    {open ? <AppSheet onClose={() => setOpen(false)} closeLabel={`Cerrar ${label.toLowerCase()}`} style={{ backgroundColor: colors.background, maxHeight: '85%' }}>
      <FlatList data={[...dates].reverse()} keyExtractor={date => date} contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false}
        ListHeaderComponent={<Heading level={2}>{label}</Heading>}
        renderItem={({ item: date }) => <SheetChoice label={formatBodyDate(date)} selected={date === value} onChoose={() => onChange(date)} />}
        ListFooterComponent={<SheetChoice label="Cerrar" />} />
    </AppSheet> : null}
  </View>;
}

/** Comparison reads the same confirmed period, with no request or fabricated cross-date snapshot. */
export function BodyRecordComparison({ metrics, today }: { metrics: ProgressBodyMetric[]; today?: string }) {
  const dates = bodyDates(metrics);
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState<{ a: string; b: string } | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const chosen = pair && pair.a < pair.b && dates.includes(pair.a) && dates.includes(pair.b) ? pair : null;
  const initial = defaultBodyPair(metrics);
  const a = chosen?.a ?? initial?.a ?? dates[0] ?? '';
  const b = chosen?.b ?? initial?.b ?? dates.at(-1) ?? '';
  const interval = bodyInterval(a, b);
  const expanded = open && dates.length > 1;
  const rows = metrics.map(metric => ({ metric, ...bodyDatePair(metric, a, b) }));
  const comparable = rows.filter(row => row.change !== null);
  const missing = rows.filter(row => row.change === null);
  return <View style={styles.section} testID="body-record-comparison">
    <Heading level={2}>{metrics.length === 1 ? 'Comparar dos fechas' : 'Qué cambió en tu cuerpo'}</Heading>
    <AppText muted variant="footnote">Dos registros, lado a lado. Solo dentro del período elegido.</AppText>
    {dates.length > 1 ? <LinkRow kind="disclosure" expanded={expanded} label="Comparar dos registros" onPress={() => setOpen(v => !v)} /> : null}
    {dates.length < 2 ? <AppText muted variant="footnote">Necesitás registros en dos fechas distintas para comparar.</AppText> : null}
    {expanded ? <>
      <View>
        <DateChoice dates={dates.filter(d => d < b)} label="Desde" value={a} onChange={date => setPair({ a: date, b })} />
        <DateChoice dates={dates.filter(d => d > a)} label="Hasta" value={b} onChange={date => setPair({ a, b: date })} />
      </View>
      <AppText muted numeric variant="caption">{comparable.length} {comparable.length === 1 ? 'medida con dato' : 'medidas con dato'} en ambas fechas.</AppText>
      {interval ? <AppText muted numeric variant="footnote">{interval.elapsed} {interval.elapsed === 1 ? 'día' : 'días'} entre registros{interval.short ? '. Es poco tiempo: muestra la diferencia entre dos días, no una tendencia' : ''}.</AppText> : null}
      {comparable.some(row => row.metric.key !== 'body.weight') ? <AppText muted variant="caption">Una medida puede variar algunos milímetros según cómo te medís, y no separa músculo de grasa.</AppText> : null}
      {comparable.map(row => {
        const weekly = row.metric.key === 'body.weight' && interval && Math.abs(row.change!) >= 1e-9 ? equivalentPerWeek(row.change!, interval.elapsed) : null;
        return <View key={row.metric.key} style={styles.comparisonRow} accessible accessibilityLabel={`${row.metric.label}: ${formatValue(row.first!.value, row.metric.unit)} a ${formatValue(row.last!.value, row.metric.unit)}, ${difference(row.change!, row.metric.unit)}`}>
          <View style={styles.comparisonHead}>
            <AppText variant="headline">{row.metric.label}</AppText>
            <AppText numeric variant="headline">{difference(row.change!, row.metric.unit)}</AppText>
          </View>
          <AppText numeric muted variant="footnote">{formatValue(row.first!.value, row.metric.unit)} → {formatValue(row.last!.value, row.metric.unit)}{weekly !== null ? ` · ≈ ${difference(weekly, row.metric.unit)} por semana` : ''}</AppText>
        </View>;
      })}
      {!measuresComparable(metrics) && metrics.some(m => m.key !== 'body.weight' && m.observations.length) ? <AppText muted variant="footnote">Tus medidas tienen una sola fecha en este período. Para compararlas, elegí un período más largo.</AppText> : null}
      {missing.length ? <LinkRow kind="disclosure" expanded={missingOpen} label={`${missingOpen ? 'Ocultar' : 'Ver'} medidas sin dato para comparar (${missing.length})`} onPress={() => setMissingOpen(v => !v)} /> : null}
      {missingOpen ? missing.map(row => <View key={row.metric.key} style={styles.comparisonRow}>
        <AppText variant="headline">{row.metric.label}</AppText>
        <AppText numeric muted variant="footnote">{row.first ? formatValue(row.first.value, row.metric.unit) : 'Sin registro'} → {row.last ? formatValue(row.last.value, row.metric.unit) : 'Sin registro'}</AppText>
      </View>) : null}
      <AppText muted variant="caption">Cada valor es el de esa fecha: no completamos huecos con registros anteriores.</AppText>
      {today && interval ? <>
        {metrics.some(m => m.key === 'body.weight') ? <WeeklyWeightReference key={`${a}|${b}`} a={a} b={b} today={today} /> : null}
        <BodyIntervalContext key={`context|${a}|${b}`} range={interval.context} />
      </> : null}
    </> : null}
  </View>;
}

export function BodyJournal({ data }: { data: ProgressBody }) {
  const router = useRouter();
  const dates = bodyDates(data.metrics).reverse();
  const [limit, setLimit] = useState(20);
  return <View style={styles.section} testID="body-journal">
    <Heading level={2}>Tu cuaderno</Heading>
    <AppText muted variant="footnote">Registros válidos del período, agrupados por fecha. Abrí el original para corregirlo.</AppText>
    {!dates.length ? <AppText muted>No hay registros válidos en este período.</AppText> : null}
    {dates.slice(0, limit).map(date => <View key={date} style={styles.comparisonRow}>
      <AppText numeric variant="headline">{formatBodyDate(date)}</AppText>
      {data.metrics.flatMap(metric => {
        const point = metric.observations.find(o => o.date === date && Number.isFinite(o.value) && o.value > 0);
        return point ? [<AppText key={metric.key} numeric variant="footnote">{metric.label} · {formatValue(point.value, metric.unit)}</AppText>] : [];
      })}
      <LinkRow label={`Ver original del ${formatBodyDate(date)}`} onPress={() => { const href = bodyObservationHref(date, null); if (href) router.push(href); }} />
    </View>)}
    {dates.length > limit ? <LinkRow kind="disclosure" label="Ver más días del período" onPress={() => setLimit(n => n + 20)} /> : null}
    {data.excludedSuspect > 0 ? <AppText muted variant="footnote">{data.excludedSuspect} {data.excludedSuspect === 1 ? 'medición sospechosa no cuenta' : 'mediciones sospechosas no cuentan'} en este cuaderno. Siguen disponibles en los registros originales.</AppText> : null}
    <LinkRow label="Ver historial y registros originales" onPress={() => router.push('/(tabs)/progress/body')} />
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { padding: brandTokens.layout.cardPadding, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, gap: spacing.md },
  half: { width: '47%', flexGrow: 1 }, full: { width: '100%' },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zoneMetric: { minHeight: sizes.touchTarget, gap: spacing.xs, paddingVertical: spacing.xs },
  sheet: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  pickerRow: { minHeight: sizes.touchTarget, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  datePair: { flexDirection: 'row', gap: spacing.md }, stacked: { flexDirection: 'column' }, grow: { flex: 1 },
  comparisonRow: { gap: spacing.xs, paddingVertical: spacing.sm },
  comparisonHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: spacing.md },
});
