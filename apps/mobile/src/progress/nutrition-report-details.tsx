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
import { formatValue } from './progress-format';
import { ProgressRow } from './progress-row';

const LABEL: Record<ReportMetric, string> = {
  calories: 'Calorías',
  targetCalories: 'Objetivo histórico',
  targetDeviation: 'Diferencia contra objetivo',
  expenditure: 'Gasto estimado histórico',
  balance: 'Balance del día',
  protein: 'Proteína',
  targetProtein: 'Objetivo histórico de proteína',
  carbs: 'Carbohidratos',
  fat: 'Grasas',
};
const unit = (metric: ReportMetric) => (['protein', 'targetProtein', 'carbs', 'fat'].includes(metric) ? 'g' : 'kcal');
const shown = (value: number | null, u: string) => (value === null ? '—' : formatValue(value, u));
const denominator = (s: ReportStatistic) =>
  `${s.denominator} días con dato${s.partialDays ? ` · ${s.partialDays} con suma parcial` : ''}`;
function DetailRow({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <ProgressRow label={`${title}, ${value}${detail ? `, ${detail}` : ''}`}>
      <View style={styles.grow}>
        <AppText>{title}</AppText>
        {detail ? (
          <AppText numeric muted variant="caption">
            {detail}
          </AppText>
        ) : null}
      </View>
      <AppText numeric variant="label" style={styles.value}>
        {value}
      </AppText>
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
  return (
    <>
      <View style={styles.section} testID="nutrition-progress-detail">
        <Heading level={2}>Detalle</Heading>
        <AppText muted variant="caption">
          Promedios sobre días finalizados con datos. Hoy queda fuera del resumen.
        </AppText>
        <DetailRow
          title="Días con registro"
          value={`${c.registeredDays} de ${report.range.days} días`}
          detail={`${c.completedRegisteredDays} de ${c.finalizedDays} días finalizados con registro`}
        />
        <DetailRow
          title="Proteína cumplida"
          value={`${s.proteinHitDays} de ${s.proteinComparableDays} días`}
          detail="Días finalizados con proteína y objetivo conocidos"
        />
        <DetailRow
          title="Balance acumulado"
          value={shown(s.accumulatedBalance.value, 'kcal')}
          detail={denominator(s.accumulatedBalance)}
        />
        {REPORT_METRICS.map((k) => (
          <DetailRow
            key={k}
            title={`${LABEL[k]} promedio`}
            value={shown(s.metrics[k].value, unit(k))}
            detail={denominator(s.metrics[k])}
          />
        ))}
        <ProgressRow
          label={`Objetivo, ${s.belowTargetDays} días por debajo, ${s.exactTargetDays} iguales, ${s.aboveTargetDays} por encima`}
        >
          <View style={styles.grow}>
            <AppText>Respecto del objetivo</AppText>
            <AppText numeric muted variant="caption">
              {s.belowTargetDays} por debajo · {s.exactTargetDays} iguales · {s.aboveTargetDays} por encima
            </AppText>
          </View>
        </ProgressRow>
        <ProgressRow
          label={`Balance, ${s.deficitDays} días de déficit, ${s.neutralDays} neutros, ${s.surplusDays} de superávit`}
        >
          <View style={styles.grow}>
            <AppText>Balance</AppText>
            <AppText numeric muted variant="caption">
              {s.deficitDays} déficit · {s.neutralDays} neutros · {s.surplusDays} superávit
            </AppText>
          </View>
        </ProgressRow>
        {s.goalStages.length ? (
          <ProgressRow>
            <AppText>Etapas: {s.goalStages.join(', ')}</AppText>
          </ProgressRow>
        ) : null}
      </View>
      <View style={styles.section}>
        <Heading level={2}>Cobertura</Heading>
        <AppText numeric muted>
          {c.missingDays} días sin registro.{' '}
          {c.todayRegistered ? 'Hoy tiene datos en curso.' : 'Hoy, si aparece, sigue en curso.'}
        </AppText>
        {REPORT_NUTRIENTS.map((k) => (
          <DetailRow
            key={k}
            title={LABEL[k]}
            value={`${c.nutrients[k].knownDays} días con dato`}
            detail={`${c.nutrients[k].partialDays} parciales · ${c.nutrients[k].unknownDays} desconocidos`}
          />
        ))}
        <AppText muted variant="caption">
          Una suma parcial solo incluye nutrientes conocidos; no representa necesariamente el total. Cada promedio
          muestra su propio denominador.
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
                <AppText muted variant="caption">
                  {displayNutritionDate(h.date)}
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
                    value={shown(b.metrics[k].value, unit(k))}
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
                      `Diferencia ${shown(d.targetDeviationKcal, 'kcal')} · Balance ${shown(d.energyBalanceKcal, 'kcal')}`,
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
