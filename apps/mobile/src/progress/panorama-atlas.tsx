import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import type { HistoryRange } from '@/api/history';
import type { NutritionReport } from '@/api/nutrition-report';
import type { ProgressDestination, ProgressOverview } from '@/api/progress';
import { AppIcon, AppText, brandTokens, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { exactPeriodDate, exactPeriodRange } from '@/insights/period-model';
import { formatValue } from './progress-format';
import { panoramaCalendar, panoramaCalories, panoramaWeightGeometry } from './panorama-model';

export type AtlasDaily = { history?: HistoryRange; report?: NutritionReport; historyStale?: boolean; reportStale?: boolean; loading?: boolean };
const value = (n: number, unit: string) => formatValue(unit === 'kg' ? Math.round(n * 10) / 10 : n, unit, unit === 'kg' ? undefined : 'integer');

function Area({ label, title, hint, onPress, children, dark = false }: { label: string; title: string; hint: string; onPress: () => void; children: ReactNode; dark?: boolean }) {
  const reduced = useReduceMotion(), { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={`${hint} Abre el detalle de estos 30 días.`}
    onPress={() => { haptics.selection(); onPress(); }} style={({ pressed }) => [styles.area, pressedStyle(pressed, reduced)]}>
    <View style={styles.heading}><AppText accessibilityRole="header" variant="headline" style={dark && { color: brandTokens.palette.dark.text }}>{title}</AppText>
      <AppIcon name="chevronRight" size={17} color={dark ? brandTokens.palette.dark.textMuted : colors.textMuted} /></View>
    {children}
  </Pressable>;
}

function WeightLine({ data }: { data: ProgressOverview }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(160);
  const points = data.sparks?.weight?.current ?? [], geometry = panoramaWeightGeometry(points, width, 64);
  return <View onLayout={e => setWidth(Math.max(16, e.nativeEvent.layout.width))} style={styles.plot} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height={64}>
      {geometry.map((p, i) => p ? <Circle key={`p${i}`} cx={p.x} cy={p.y} r={3} fill={colors.primary} /> : null)}
      {geometry.map((p, i) => p && geometry[i - 1] ? <Line key={`l${i}`} x1={geometry[i - 1]!.x} y1={geometry[i - 1]!.y} x2={p.x} y2={p.y} stroke={colors.primary} strokeWidth={2} /> : null)}
    </Svg>
  </View>;
}

function CalorieCloud({ days }: { days: NonNullable<ReturnType<typeof panoramaCalories>> }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(160);
  const values = days.map(d => d.value), low = Math.min(...values), high = Math.max(...values);
  // Stack exact repetitions. Nearby distinct values may overlap; the accessible detail remains in the report.
  const groups = new Map<string, { value: number; partial: boolean; count: number }>();
  for (const d of days) { const key = `${d.value}|${d.partial}`; const old = groups.get(key); groups.set(key, { ...d, count: (old?.count ?? 0) + 1 }); }
  return <View onLayout={e => setWidth(Math.max(32, e.nativeEvent.layout.width))} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height={64}>
      {[...groups.values()].sort((a, b) => a.value - b.value).map((d, i) => {
        const x = high === low ? width / 2 : 8 + (d.value - low) / (high - low) * (width - 16), y = d.partial ? 44 : 20 + (i % 3) * 6;
        return <Circle key={`${d.value}|${d.partial}`} cx={x} cy={y} r={d.count > 1 ? 4 : 3} fill={d.partial ? 'none' : colors.primary} stroke={colors.primary} strokeWidth={1} />;
      })}
      {[...groups.values()].filter(d => d.count > 1).map(d => {
        const x = high === low ? width / 2 : 8 + (d.value - low) / (high - low) * (width - 16);
        return <SvgText key={`${d.value}|${d.partial}`} x={x} y={d.partial ? 60 : 12} textAnchor="middle" fontSize={brandTokens.typeScale.caption.fontSize} fill={colors.textMuted}>{d.count}</SvgText>;
      })}
    </Svg>
    <View style={styles.heading}><AppText muted numeric variant="caption">{value(low, 'kcal')}</AppText><AppText muted numeric variant="caption">{high === low ? '' : value(high, 'kcal')}</AppText></View>
  </View>;
}

export function PanoramaAtlas({ data, daily, onOpen }: { data: ProgressOverview; daily?: AtlasDaily; onOpen: (d: ProgressDestination) => void }) {
  const { colors } = useOwnlevelTheme(), { width, fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3 || width < 360;
  const t = data.training.status === 'ok' ? data.training.data : null, n = data.nutrition.status === 'ok' ? data.nutrition.data : null;
  const w = data.panorama?.weight, coverage = data.panorama?.nutrition;
  const cells = panoramaCalendar(data, daily?.history), days = panoramaCalories(data, daily?.report);
  const max = Math.max(1, ...(cells ?? []).map(d => d?.count ?? 0));
  const ink = brandTokens.palette.dark, intensity = brandTokens.intensity.dark;
  const comparisonText = !t ? '' : !t.sessions ? 'Sin sesiones registradas en esta ventana.'
    : data.inPeriod?.comparable ? `${data.inPeriod.improved} de ${data.inPeriod.comparable} ejercicios con mejora · primera frente a última sesión`
    : data.inPeriod == null ? 'Comparación no disponible en esta lectura.' : 'Sin ejercicios comparables entre dos sesiones de esta ventana.';
  const calendarText = cells ? `${t!.trainingDays} días con sesiones finalizadas. ${cells.filter(d => d && d.count > 0).map(d => `${exactPeriodDate(d!.date)}: ${d!.count}`).join('. ')}. Los demás días de la ventana no tienen sesiones finalizadas registradas.` : 'Calendario diario no disponible en esta lectura.';
  const trainingHint = [t ? `${t.sessions} sesiones finalizadas, ${t.trainingDays} días entrenados, ${t.sets} series.` : 'Entrenamiento no disponible.', comparisonText, calendarText,
    daily?.historyStale ? 'Calendario sin actualizar; última lectura confirmada.' : ''].join(' ');
  const weightHint = data.body.status !== 'ok' ? 'Cuerpo no disponible.' : w?.last
    ? `${value(w.last.value, 'kg')}, del ${exactPeriodDate(w.last.date)}. ${w.count} ${w.count === 1 ? 'registro válido' : 'registros válidos'}. El gráfico muestra el último peso de cada intervalo; los huecos quedan sin unir.`
    : 'Sin pesajes confirmados en esta lectura.';
  const nutritionHint = n ? [
    `${n.averageKcal === null ? 'Sin promedio' : `${value(n.averageKcal, 'kcal')} por día utilizado`}.`,
    `Proteína: ${n.averageProteinG === null ? 'sin promedio' : `${value(n.averageProteinG, 'g')} por día`}; ${coverage?.proteinDays ?? 'sin dato de'} días utilizados.`,
    `${coverage?.caloriesDays ?? 'Sin dato de'} días utilizados para calorías. ${n.registeredDays} de ${n.days} días con alimentación registrada.`,
    days ? `${days.length} días en la distribución, ${days.filter(d => d.partial).length} parciales. Los puntos huecos son registros parciales; un número junto al punto indica días repetidos.` : 'Distribución diaria no disponible.',
    daily?.reportStale ? 'Distribución sin actualizar; última lectura confirmada.' : '', 'No confirma toda la ingesta.',
  ].join(' ') : 'Nutrición no disponible.';

  return <View testID="progress-panorama" style={styles.summary}>
    <AppText muted numeric variant="footnote">Resumen de los últimos {data.period.days} días</AppText>
    <AppText muted numeric variant="caption">{exactPeriodRange(data.period)}{data.period.includesToday ? ' · hoy en curso' : ''}</AppText>
    <View testID="panorama-training" style={[styles.hero, { backgroundColor: ink.surface }]}>
      <Area dark title="Entrenamiento" label="Ver actividad y ejercicios" hint={trainingHint} onPress={() => onOpen({ kind: 'training' })}>
        <View style={[styles.heroBody, stacked && styles.stacked]}>
          <View style={styles.number}><AppText numeric variant="heroNumber" style={{ color: ink.text }}>{t ? t.sessions : '—'}</AppText>
            <AppText variant="footnote" style={{ color: ink.textMuted }}>sesiones{ '\n' }finalizadas</AppText></View>
          <View style={styles.calendar} testID="panorama-calendar" accessible accessibilityLabel={calendarText}>
            {cells ? <>
              <View style={styles.week}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => <AppText key={i} variant="caption" style={[styles.weekday, { color: ink.textMuted }]}>{d}</AppText>)}</View>
              <View style={styles.cells}>{cells.map((d, i) => <View key={d?.date ?? `blank${i}`} testID={d ? `panorama-day-${d.date}-${d.count}` : undefined}
                style={styles.cellSlot}><View style={[styles.cell, { backgroundColor: intensity[d ? d.count === 0 ? 0 : Math.max(1, Math.ceil(d.count / max * 4)) : 0], opacity: d ? 1 : 0 }]} /></View>)}</View>
            </> : <View style={styles.calendarPlaceholder}><AppText variant="caption" style={{ color: ink.textMuted }}>{daily?.loading ? 'Leyendo los días…' : 'Calendario diario no disponible.'}</AppText></View>}
          </View>
        </View>
        <AppText numeric variant="footnote" style={{ color: ink.text }}>{t ? `${t.sessions} ${t.sessions === 1 ? 'sesión' : 'sesiones'} · ${t.trainingDays} ${t.trainingDays === 1 ? 'día entrenado' : 'días entrenados'} · ${t.sets} ${t.sets === 1 ? 'serie' : 'series'}` : 'No pudimos leer Entrenamiento.'}</AppText>
        <AppText variant="caption" style={{ color: ink.textMuted }}>{comparisonText}</AppText>
        {daily?.historyStale ? <AppText variant="caption" style={{ color: ink.textMuted }}>Calendario: última lectura confirmada; no pudimos actualizar.</AppText> : null}
      </Area>
    </View>
    <View style={[styles.pair, stacked && styles.stacked]}>
      <View testID="panorama-body" style={styles.half}>
        <Area title="Cuerpo" label="Ver peso y medidas" hint={weightHint} onPress={() => onOpen({ kind: 'body' })}>
          <AppText numeric variant="title1">{data.body.status !== 'ok' ? '—' : w?.last ? value(w.last.value, 'kg') : w === undefined ? 'Sin lectura' : 'Sin pesajes'}</AppText>
          <AppText muted variant="caption">Último del período</AppText>
          {data.body.status !== 'ok' ? <AppText muted variant="footnote">No pudimos leer Cuerpo.</AppText> : w === undefined ? <AppText muted variant="caption">La fecha exacta y cobertura de peso no están disponibles en esta versión.</AppText> : w?.last ? <>
            <WeightLine data={data} />
            <AppText muted numeric variant="caption">{exactPeriodDate(w.last.date)} · {w.count} {w.count === 1 ? 'registro válido' : 'registros válidos'}</AppText>
            {w.count === 1 ? <AppText muted variant="caption">Un solo registro no permite describir una tendencia.</AppText> : null}
          </> : <AppText muted variant="caption">Sin pesajes válidos en esta ventana.</AppText>}
        </Area>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }, stacked && styles.horizontalDivider]} />
      <View testID="panorama-nutrition" style={styles.half}>
        <Area title="Nutrición" label="Ver alimentación y objetivos" hint={nutritionHint} onPress={() => onOpen({ kind: 'nutrition' })}>
          <AppText numeric variant="title1">{!n ? '—' : n.averageKcal === null ? 'Sin promedio' : formatValue(n.averageKcal, null, 'integer')}</AppText>
          {!n ? <AppText muted variant="footnote">No pudimos leer Nutrición.</AppText> : <>
            <AppText muted variant="caption">kcal/día · promedio registrado</AppText>
            {days?.length ? <CalorieCloud days={days} /> : <View style={styles.plot}><AppText muted variant="caption">{daily?.loading ? 'Leyendo los días…' : days ? 'Sin días con calorías conocidas.' : 'Distribución diaria no disponible.'}</AppText></View>}
            <AppText muted numeric variant="caption">{coverage ? `${coverage.caloriesDays} días utilizados` : 'Días utilizados no disponibles'} · {n.registeredDays} de {n.days} días con alimentación registrada</AppText>
            <AppText muted numeric variant="caption">Proteína: {n.averageProteinG === null ? 'sin promedio' : `${value(n.averageProteinG, 'g')}/día`}{coverage ? ` · ${coverage.proteinDays} días utilizados` : ''}</AppText>
            {days?.length ? <AppText muted variant="caption">Cada punto: un día. Un número indica días con el mismo valor.{days.some(d => d.partial) ? ' Punto hueco: registro parcial.' : ''}</AppText> : null}
            {daily?.reportStale ? <AppText muted variant="caption">Distribución: última lectura confirmada; no pudimos actualizar.</AppText> : null}
          </>}
        </Area>
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  summary: { gap: spacing.sm }, hero: { borderRadius: radius.card, padding: brandTokens.layout.cardPadding, marginTop: spacing.sm },
  area: { gap: spacing.md, minHeight: brandTokens.layout.minTouch }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl }, number: { gap: spacing.sm }, calendar: { flex: 1, minWidth: 140 },
  week: { flexDirection: 'row', marginBottom: spacing.xs }, weekday: { width: `${100 / 7}%`, textAlign: 'center' },
  cells: { flexDirection: 'row', flexWrap: 'wrap' }, cellSlot: { width: `${100 / 7}%`, padding: spacing.xs / 2 }, cell: { aspectRatio: 1, borderRadius: brandTokens.space.xxs },
  calendarPlaceholder: { minHeight: 140, justifyContent: 'center' }, pair: { flexDirection: 'row', gap: spacing.lg, paddingVertical: spacing.lg },
  half: { flex: 1, minWidth: 0 }, divider: { width: StyleSheet.hairlineWidth }, horizontalDivider: { width: '100%', height: StyleSheet.hairlineWidth },
  stacked: { flexDirection: 'column', alignItems: 'stretch' }, plot: { minHeight: 64, justifyContent: 'center' },
});
