import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import type { HistoryRange } from '@/api/history';
import type { NutritionReport } from '@/api/nutrition-report';
import type { ProgressDestination, ProgressOverview } from '@/api/progress';
import { AppIcon, AppText, brandTokens, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion, useFieldSurface } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { exactPeriodDate, exactPeriodRange } from '@/insights/period-model';
import { formatValue } from './progress-format';
import { shortRange } from './progress-range';
import { panoramaCalendar, panoramaCalories, panoramaWeightGeometry } from './panorama-model';

export type AtlasDaily = { history?: HistoryRange; report?: NutritionReport; historyStale?: boolean; reportStale?: boolean; loading?: boolean };
const value = (n: number, unit: string) => formatValue(unit === 'kg' ? Math.round(n * 10) / 10 : n, unit, unit === 'kg' ? undefined : 'integer');

function Area({ label, title, hint, onPress, children }: { label: string; title: string; hint: string; onPress: () => void; children: ReactNode }) {
  const reduced = useReduceMotion(), { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={`${hint} Abre el detalle de estos 30 días.`}
    onPress={() => { haptics.selection(); onPress(); }} style={({ pressed }) => [styles.area, pressedStyle(pressed, reduced)]}>
    <View style={styles.heading}><AppText accessibilityRole="header" variant="headline">{title}</AppText>
      <AppIcon name="chevronRight" size={17} color={colors.textMuted} /></View>
    <View pointerEvents="none">{children}</View>
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

function CalorieStrip({ days }: { days: NonNullable<ReturnType<typeof panoramaCalories>> }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(160);
  const high = Math.max(0,...days.map(d=>d.value)), low = Math.min(0,...days.map(d=>d.value));
  const y = (v: number) => 64*(high-v)/Math.max(1,high-low);
  const ordered = [...days].sort((a,b)=>a.date.localeCompare(b.date));
  const step = width / Math.max(1,days.length);
  return <View onLayout={e=>setWidth(Math.max(32,e.nativeEvent.layout.width))} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height={64}>
      {ordered.map((d,i)=><Rect key={i} x={i*step} y={Math.min(y(d.value),y(0))} width={Math.max(1,step-1)} height={d.value===0?1:Math.max(1,Math.abs(y(d.value)-y(0)))} fill={colors.primary} opacity={d.partial?0.4:1} />)}
    </Svg>
  </View>;
}

export function PanoramaAtlas({ data, daily, onOpen }: { data: ProgressOverview; daily?: AtlasDaily; onOpen: (d: ProgressDestination) => void }) {
  const { colors, isDark } = useOwnlevelTheme(), { width, fontScale } = useWindowDimensions();
  const surface = useFieldSurface('tile');
  const stacked = fontScale > 1.3 || width < 360;
  const t = data.training.status === 'ok' ? data.training.data : null, n = data.nutrition.status === 'ok' ? data.nutrition.data : null;
  const w = data.panorama?.weight, coverage = data.panorama?.nutrition;
  const cells = panoramaCalendar(data, daily?.history), days = panoramaCalories(data, daily?.report);
  const max = Math.max(1, ...(cells ?? []).map(d => d?.count ?? 0));
  const ink = { text: colors.text, textMuted: colors.textMuted }, intensity = brandTokens.intensity[isDark ? 'dark' : 'light'];
  const calendarText = cells ? `${t!.trainingDays} días con sesiones finalizadas. ${cells.filter(d => d && d.count > 0).map(d => `${exactPeriodDate(d!.date)}: ${d!.count}`).join('. ')}. Los demás días de la ventana no tienen sesiones finalizadas registradas.` : 'Calendario diario no disponible en esta lectura.';
  const trainingHint = [t ? `${t.sessions} sesiones finalizadas, ${t.trainingDays} días entrenados, ${t.sets} series.` : 'Entrenamiento no disponible.', calendarText,
    daily?.historyStale ? 'Calendario sin actualizar; última lectura confirmada.' : ''].join(' ');
  const weightHint = data.body.status !== 'ok' ? 'Cuerpo no disponible.' : w?.last
    ? `${value(w.last.value, 'kg')}, del ${exactPeriodDate(w.last.date)}. ${w.count} ${w.count === 1 ? 'registro válido' : 'registros válidos'}. El gráfico muestra el último peso de cada intervalo; los huecos quedan sin unir.`
    : 'Sin pesajes confirmados en esta lectura.';
  const nutritionHint = n ? [
    `${n.averageKcal === null ? 'Sin promedio' : `${value(n.averageKcal, 'kcal')} por día utilizado`}.`,
    `Proteína: ${n.averageProteinG === null ? 'sin promedio' : `${value(n.averageProteinG, 'g')} por día`}; ${coverage?.proteinDays ?? 'sin dato de'} días utilizados.`,
    `${coverage?.caloriesDays ?? 'Sin dato de'} días utilizados para calorías. ${n.registeredDays} de ${n.days} días con alimentación registrada.`,
    days ? `${days.length} días en la distribución, ${days.filter(d => d.partial).length} parciales. Las barras suaves son sumas parciales; los días sin dato quedan fuera de esta tira.` : 'Distribución diaria no disponible.',
    daily?.reportStale ? 'Distribución sin actualizar; última lectura confirmada.' : '', 'No confirma toda la ingesta.',
  ].join(' ') : 'Nutrición no disponible.';

  return <View testID="progress-panorama" style={styles.summary}>
    <AppText muted numeric variant="footnote" accessibilityLabel={`Últimos ${data.period.days} días, ${exactPeriodRange(data.period)}${data.period.includesToday ? ', hoy en curso' : ''}`}>
      Últimos {data.period.days} días · {shortRange(data.period, data.period.end)}{data.period.includesToday ? ' · hoy en curso' : ''}</AppText>
    <View testID="panorama-training" style={[styles.hero, surface]}>
      <Area title="Entrenamiento" label="Ver actividad y ejercicios" hint={trainingHint} onPress={() => onOpen({ kind: 'training' })}>
        <View style={[styles.heroBody, stacked && styles.stacked]}>
          <View style={styles.number}><AppText numeric variant="heroNumber" style={{ color: ink.text }}>{t ? t.sessions : '—'}</AppText>
            <AppText variant="footnote" style={[styles.sessionLabel, { color: ink.textMuted, maxWidth: fontScale > 1.3 ? '100%' : brandTokens.layout.minTouch * 2 + spacing.sm }]}>sesiones finalizadas</AppText></View>
          <View style={styles.calendar} testID="panorama-calendar" accessible accessibilityLabel={calendarText}>
            {cells ? <>
              <View style={styles.week}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => <AppText key={i} variant="caption" style={[styles.weekday, { color: ink.textMuted }]}>{d}</AppText>)}</View>
              <View style={styles.cells}>{cells.map((d, i) => <View key={d?.date ?? `blank${i}`} testID={d ? `panorama-day-${d.date}-${d.count}` : undefined}
                style={styles.cellSlot}><View style={[styles.cell, isDark && d?.count === 0 && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, { backgroundColor: intensity[d ? d.count === 0 ? 0 : Math.max(1, Math.ceil(d.count / max * 4)) : 0], opacity: d ? 1 : 0 }]} /></View>)}</View>
            </> : <View style={styles.calendarPlaceholder}><AppText variant="caption" style={{ color: ink.textMuted }}>{daily?.loading ? 'Leyendo los días…' : 'Calendario diario no disponible.'}</AppText></View>}
          </View>
        </View>
        <AppText numeric variant="footnote" style={[styles.trainingFooter, { color: ink.text }]}>{t ? `${t.trainingDays} ${t.trainingDays === 1 ? 'día entrenado' : 'días entrenados'} · ${t.sets} ${t.sets === 1 ? 'serie' : 'series'}` : 'No pudimos leer Entrenamiento.'}</AppText>
        {daily?.historyStale ? <AppText variant="caption" style={{ color: ink.textMuted }}>Calendario: última lectura confirmada; no pudimos actualizar.</AppText> : null}
      </Area>
    </View>
    <View style={[styles.pair, stacked && styles.stacked]}>
      <View testID="panorama-body" style={styles.half}>
        <Area title="Cuerpo" label="Ver peso y medidas" hint={weightHint} onPress={() => onOpen({ kind: 'body' })}>
          <AppText numeric variant="title1">{data.body.status !== 'ok' ? '—' : w?.last ? value(w.last.value, 'kg') : w === undefined ? 'Sin lectura' : 'Sin pesajes'}</AppText>
          {data.body.status !== 'ok' ? <AppText muted variant="footnote">No pudimos leer Cuerpo.</AppText> : w === undefined ? <AppText muted variant="caption">La fecha exacta y cobertura de peso no están disponibles en esta versión.</AppText> : w?.last ? <>
            <WeightLine data={data} />
          </> : <AppText muted variant="caption">Sin pesajes válidos en esta ventana.</AppText>}
        </Area>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }, stacked && styles.horizontalDivider]} />
      <View testID="panorama-nutrition" style={styles.half}>
        <Area title="Nutrición" label="Ver alimentación y objetivos" hint={nutritionHint} onPress={() => onOpen({ kind: 'nutrition' })}>
          <View style={[styles.nutritionNumber, fontScale > 1.3 && styles.stacked]}><AppText numeric variant="title1">{!n ? '—' : n.averageKcal === null ? 'Sin promedio' : formatValue(n.averageKcal, null, 'integer')}</AppText>{n ? <View><AppText muted variant="caption">kcal/día</AppText><AppText muted variant="caption">promedio</AppText></View> : null}</View>
          {!n ? <AppText muted variant="footnote">No pudimos leer Nutrición.</AppText> : <>
            {days?.length ? <CalorieStrip days={days} /> : <View style={styles.plot}><AppText muted variant="caption">{daily?.loading ? 'Leyendo los días…' : days ? 'Sin días con calorías conocidas.' : 'Distribución diaria no disponible.'}</AppText></View>}
            <AppText numeric variant="footnote" style={styles.protein}>Proteína {n.averageProteinG === null ? 'sin promedio' : `${value(n.averageProteinG, 'g')}/día`}</AppText>
            {days?.some(d => d.partial) ? <AppText muted variant="caption">Barras suaves: días con suma parcial.</AppText> : null}
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
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl }, number: { gap: spacing.xs, alignItems: 'center' }, calendar: { flex: 1, minWidth: 140 },
  protein: { marginTop: spacing.sm },
  sessionLabel: { textAlign: 'center' }, trainingFooter: { marginTop: spacing.lg },
  nutritionNumber: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.xs },
  week: { flexDirection: 'row', marginBottom: spacing.xs }, weekday: { width: `${100 / 7}%`, textAlign: 'center' },
  cells: { flexDirection: 'row', flexWrap: 'wrap' }, cellSlot: { width: `${100 / 7}%`, padding: spacing.xs / 2 }, cell: { aspectRatio: 1, borderRadius: brandTokens.space.xxs },
  calendarPlaceholder: { minHeight: 140, justifyContent: 'center' }, pair: { flexDirection: 'row', gap: spacing.lg, paddingVertical: spacing.lg },
  half: { flex: 1, minWidth: 0 }, divider: { width: StyleSheet.hairlineWidth }, horizontalDivider: { width: '100%', height: StyleSheet.hairlineWidth },
  stacked: { flexDirection: 'column', alignItems: 'stretch' }, plot: { minHeight: 64, justifyContent: 'center' },
});
