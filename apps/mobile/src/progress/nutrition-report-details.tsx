import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  REPORT_METRICS,
  REPORT_NUTRIENTS,
  type NutritionReport,
  type ReportMetric,
  type ReportStatistic,
} from '@/api/nutrition-report';
import { AppText, Button, Heading, spacing } from '@/design-system';
import { displayNutritionDate } from '@/nutrition/day-format';
import { formatDelta, formatValue } from './progress-format';
import { ProgressRow } from './progress-row';

const LABEL: Record<ReportMetric, string> = {
  calories: 'Calorías',
  targetCalories: 'Objetivo',
  targetDeviation: 'Diferencia con el objetivo',
  expenditure: 'Gasto estimado',
  balance: 'Balance del día',
  protein: 'Proteína',
  targetProtein: 'Objetivo de proteína',
  carbs: 'Carbohidratos',
  fat: 'Grasas',
};
const unit = (metric: ReportMetric) => (['protein', 'targetProtein', 'carbs', 'fat'].includes(metric) ? 'g' : 'kcal');
// Differences carry their sign; every amount is whole kcal or grams, as on the rest of the screen.
const SIGNED: ReportMetric[] = ['targetDeviation', 'balance'];
const shown = (value: number | null, u: string, signed = false) =>
  value === null ? '—' : signed ? formatDelta(Math.round(value), u, 'integer') : formatValue(value, u, 'integer');
const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
const denominator = (s: ReportStatistic) =>
  `${days(s.denominator)} con dato${s.partialDays ? ` · ${s.partialDays} con suma parcial` : ''}`;
/** "jueves 1 oct": short enough for a row, with the weekday that makes the day recognizable. */
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(',', '')
    .replace('.', '')
    .replace('sept', 'sep');
function DetailRow({ title, value, detail }: { title: string; value?: string; detail?: string }) {
  return (
    <ProgressRow label={`${title}${value ? `, ${value}` : ''}${detail ? `, ${detail}` : ''}`}>
      <View style={styles.grow}>
        <AppText>{title}</AppText>
        {detail ? (
          <AppText numeric muted variant="caption">
            {detail}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText numeric variant="label" style={styles.value}>
          {value}
        </AppText>
      ) : null}
    </ProgressRow>
  );
}

/** All information from report-screen remains available, including partial coverage, daily rows and each bucket's metrics. */
export function NutritionReportDetails({
  report,
  onDate,
}: {
  report: NutritionReport;
  onDate: (date: string) => void;
}) {
  const [daily, setDaily] = useState(false),
    [blocks, setBlocks] = useState(false);
  const { summary: s, coverage: c } = report;
  const base = s.metrics.calories.denominator;
  const gaps = REPORT_NUTRIENTS.filter((k) => c.nutrients[k].partialDays || c.nutrients[k].unknownDays);
  return (
    <>
      <View style={styles.section} testID="nutrition-progress-detail">
        <Heading level={2}>Promedio por día</Heading>
        <AppText muted numeric variant="caption">
          Sobre {days(base)} terminados con dato. El objetivo y el gasto son los de cada día.
        </AppText>
        {REPORT_METRICS.map((k) => (
          <DetailRow
            key={k}
            title={LABEL[k]}
            value={shown(s.metrics[k].value, unit(k), SIGNED.includes(k))}
            detail={s.metrics[k].denominator !== base || s.metrics[k].partialDays ? denominator(s.metrics[k]) : undefined}
          />
        ))}
      </View>
      <View style={styles.section} testID="nutrition-progress-days">
        <Heading level={2}>Tus días</Heading>
        <DetailRow
          title="Días con registro"
          value={`${c.registeredDays} de ${report.range.days}`}
          detail={`${c.completedRegisteredDays} de ${c.finalizedDays} días terminados${c.missingDays ? ` · ${days(c.missingDays)} sin registro` : ''}`}
        />
        <DetailRow
          title="Proteína cumplida"
          value={`${s.proteinHitDays} de ${s.proteinComparableDays}`}
          detail="Días terminados con proteína y objetivo conocidos"
        />
        <DetailRow
          title="Respecto del objetivo"
          detail={`${s.belowTargetDays} por debajo · ${s.exactTargetDays} iguales · ${s.aboveTargetDays} por encima`}
        />
        <DetailRow
          title="Balance"
          detail={`${s.deficitDays} con déficit · ${s.neutralDays} neutros · ${s.surplusDays} con superávit`}
        />
        <DetailRow
          title="Balance acumulado"
          value={shown(s.accumulatedBalance.value, 'kcal', true)}
          detail={s.accumulatedBalance.denominator !== base || s.accumulatedBalance.partialDays ? denominator(s.accumulatedBalance) : undefined}
        />
        {s.goalStages.length ? <DetailRow title={s.goalStages.length === 1 ? 'Etapa' : 'Etapas'} value={s.goalStages.join(', ')} /> : null}
      </View>
      <View style={styles.section} testID="nutrition-progress-coverage">
        <Heading level={2}>Cobertura</Heading>
        {/* Complete days need one line; only nutrients with partial or unknown days get their own row. */}
        {gaps.length ? (
          gaps.map((k) => (
            <DetailRow
              key={k}
              title={LABEL[k]}
              value={`${c.nutrients[k].knownDays} con dato`}
              detail={`${c.nutrients[k].partialDays} parciales · ${c.nutrients[k].unknownDays} desconocidos`}
            />
          ))
        ) : (
          <AppText muted numeric variant="footnote">
            Todos los días con registro tienen calorías, proteína, carbos y grasas.
          </AppText>
        )}
        <AppText muted numeric variant="caption">
          {c.todayRegistered ? 'Hoy tiene datos en curso.' : 'Hoy, si aparece, sigue en curso.'}
          {gaps.some((k) => c.nutrients[k].partialDays) ? ' Una suma parcial solo incluye los nutrientes conocidos.' : ''}
        </AppText>
      </View>
      <View style={styles.section}>
        <Heading level={2}>Días destacados</Heading>
        {report.highlights.length ? (
          report.highlights.map((h) => (
            <ProgressRow
              key={h.kind}
              label={`${h.title}, ${displayNutritionDate(h.date)}`}
              onPress={() => onDate(h.date)}
            >
              <View style={styles.grow}>
                <AppText>{h.title}</AppText>
                <AppText muted numeric variant="caption">
                  {dayLabel(h.date)}
                </AppText>
              </View>
            </ProgressRow>
          ))
        ) : (
          <AppText muted>No hay días finalizados comparables.</AppText>
        )}
      </View>
      <View style={styles.section}>
        <Button
          variant="quiet"
          label={blocks ? 'Ocultar detalle por bloques' : 'Ver detalle por bloques'}
          onPress={() => setBlocks((v) => !v)}
        />
        {blocks
          ? report.evolution.map((b) => (
              <View key={b.start} style={styles.section}>
                <Heading level={2}>
                  {displayNutritionDate(b.start)}
                  {b.start !== b.end ? ` — ${displayNutritionDate(b.end)}` : ''}
                  {b.includesToday ? ' · hoy en curso' : ''}
                </Heading>
                {REPORT_METRICS.map((k) => (
                  <DetailRow
                    key={k}
                    title={LABEL[k]}
                    value={shown(b.metrics[k].value, unit(k), SIGNED.includes(k))}
                    detail={denominator(b.metrics[k])}
                  />
                ))}
              </View>
            ))
          : null}
        <Heading level={2}>Detalle diario</Heading>
        <Button
          variant="quiet"
          label={daily ? 'Ocultar detalle diario' : `Ver los ${report.days.length} días`}
          onPress={() => setDaily((v) => !v)}
        />
        {daily
          ? [...report.days]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((d) => {
                const nutrient = (k: 'calories' | 'protein' | 'carbs' | 'fat') =>
                  `${LABEL[k]} ${shown(d.nutrients[k].value, unit(k))}${d.nutrients[k].status === 'partial' ? ' (parcial)' : ''}`;
                const lines = d.hasNutrition
                  ? [
                      d.imported ? 'Resumen histórico importado' : null,
                      nutrient('calories'),
                      `Diferencia ${shown(d.targetDeviationKcal, 'kcal', true)} · Balance ${shown(d.energyBalanceKcal, 'kcal', true)}`,
                      `${nutrient('protein')} · Objetivo ${shown(d.targetProteinG, 'g')}`,
                      `${nutrient('carbs')} · ${nutrient('fat')}`,
                    ].filter(Boolean)
                  : ['Sin registro nutricional'];
                lines.push(
                  `Objetivo ${shown(d.targetCalories, 'kcal')} · Gasto estimado ${shown(d.expenditureKcal, 'kcal')}`,
                );
                return (
                  <ProgressRow
                    key={d.date}
                    label={`${displayNutritionDate(d.date)}${d.isToday ? ', en curso' : ''}, ${lines.join(', ')}`}
                    onPress={() => onDate(d.date)}
                  >
                    <View style={styles.grow}>
                      <AppText variant="label">
                        {displayNutritionDate(d.date)}
                        {d.isToday ? ' · en curso' : ''}
                      </AppText>
                      {lines.map((line, i) => (
                        <AppText key={i} numeric muted variant="caption">
                          {line}
                        </AppText>
                      ))}
                    </View>
                  </ProgressRow>
                );
              })
          : null}
      </View>
    </>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  grow: { flex: 1, gap: spacing.xs },
  value: { flexShrink: 1, textAlign: 'right', maxWidth: '45%' },
});
