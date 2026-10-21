import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { NutritionReport } from '@/api/nutrition-report';
import { AppText, Heading, spacing, useOwnlevelTheme } from '@/design-system';
import { formatValue } from './progress-format';
import { periodHeading } from './progress-range';
import { useProgressRange } from './progress-range-context';

const short = (date: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '')
    .replace('sept', 'sep');
function points(report: NutritionReport, daily: boolean) {
  return daily
    ? [...report.days]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          start: d.date,
          end: d.date,
          value: d.hasNutrition ? d.nutrients.calories.value : null,
          partial: d.nutrients.calories.status === 'partial',
          today: d.isToday,
        }))
    : report.evolution.map((b) => ({
        start: b.start,
        end: b.end,
        value: b.metrics.calories.value,
        partial: b.metrics.calories.partialDays > 0,
        today: b.includesToday,
      }));
}
export function NutritionChart({ report, reference }: { report: NutritionReport; reference?: NutritionReport }) {
  const { colors } = useOwnlevelTheme(),
    router = useRouter();
  const { compareOn, compareText, state, today } = useProgressRange();
  const [width, setWidth] = useState(300);
  const daily = report.range.days <= 31,
    a = points(report, daily),
    b = reference ? points(reference, daily) : [];
  const target = report.summary.metrics.targetCalories.value,
    max = Math.max(1, target ?? 0, ...a.map((p) => p.value ?? 0), ...b.map((p) => p.value ?? 0));
  const n = Math.max(a.length, b.length),
    step = Math.ceil(n / 5);
  const labeled = (i: number) => n <= 6 || i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2);
  const currentLabel = periodHeading(state, today).replace(/^Tus? /, '');
  return (
    <View style={styles.section}>
      <Heading level={2}>Calorías por {daily ? 'día' : 'bloque'}</Heading>
      {!daily ? (
        <AppText muted variant="caption">
          Cada barra es el promedio del bloque, sobre sus días con dato.
        </AppText>
      ) : null}
      <View
        testID="nutrition-progress-chart"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={styles.chart}
      >
        {Array.from({ length: n }, (_, i) => (
          <View key={i} style={styles.slot}>
            <View style={[styles.pair, n > 31 && { gap: 0, paddingHorizontal: 0 }]}>
              {[...(compareOn ? [{ p: b[i], ref: true }] : []), { p: a[i], ref: false }].map(({ p, ref }) => {
                const missing = !p || p.value === null,
                  known = !ref || !!reference;
                const label = `${p ? short(p.start) : `Posición ${i + 1}`}${ref ? `, ${compareText}` : ''}, ${!known ? 'comparación no disponible' : missing ? 'sin registro' : `${formatValue(p.value, 'kcal')}${p.partial ? ', suma parcial' : ''}`}${p?.today ? ', hoy en curso' : ''}`;
                const mark = missing ? null : (
                  <View
                    style={{
                      width: '100%',
                      height: p.value === 0 ? 1 : (150 * p.value!) / max,
                      backgroundColor: p.value === 0 ? colors.border : ref ? colors.textMuted : colors.primary,
                      opacity: p.today || ref ? 0.4 : 1,
                    }}
                  />
                );
                const testID = `nutrition-chart-${ref ? 'reference' : 'current'}-${p?.start ?? i}-${missing ? 'gap' : 'bar'}`;
                return p && p.start === p.end ? (
                  <Pressable
                    key={String(ref)}
                    testID={testID}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityHint="Abre el día en Nutrición"
                    style={styles.bar}
                    onPress={() => router.push({ pathname: '/(tabs)/nutrition', params: { date: p.start } })}
                  >
                    {mark}
                  </Pressable>
                ) : (
                  <View key={String(ref)} testID={testID} accessible accessibilityLabel={label} style={styles.bar}>
                    {mark}
                  </View>
                );
              })}
            </View>
            <AppText
              numeric
              muted
              variant="caption"
              numberOfLines={1}
              style={[styles.date, { width: Math.max(44, width / 5) }]}
            >
              {labeled(i) && (a[i] || b[i]) ? short((a[i] ?? b[i]).start) : ''}
            </AppText>
          </View>
        ))}
        {target !== null ? (
          <View
            testID="nutrition-progress-target"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.target, { top: 150 * (1 - target / max), borderColor: colors.text }]}
          />
        ) : null}
      </View>
      {/* One legend line, only with what this chart actually shows. */}
      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {target !== null ? (
          <View style={styles.legendItem}>
            <View style={[styles.dash, { borderColor: colors.text }]} />
            <AppText numeric muted variant="caption">objetivo {formatValue(target, null, 'integer')}</AppText>
          </View>
        ) : null}
        {compareOn ? (
          <AppText muted variant="caption">champagne {currentLabel} · gris {compareText}</AppText>
        ) : null}
        {a.some((p) => p.today) ? <AppText muted variant="caption">clara: hoy, en curso</AppText> : null}
        {a.some((p) => p.value === null && !p.today) ? <AppText muted variant="caption">hueco: sin registro</AppText> : null}
      </View>
      {a.some((p) => p.partial) ? (
        <AppText muted variant="caption">Las sumas parciales incluyen solo los nutrientes conocidos.</AppText>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  chart: { minHeight: 182, flexDirection: 'row' },
  slot: { flex: 1, minWidth: 0, alignItems: 'center' },
  pair: { height: 150, flexDirection: 'row', gap: 2, width: '100%', paddingHorizontal: 1 },
  bar: { flex: 1, minWidth: 0, height: 150, justifyContent: 'flex-end' },
  date: { position: 'absolute', top: 150, marginTop: spacing.sm, textAlign: 'center', alignSelf: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dash: { width: 14, borderTopWidth: 1, borderStyle: 'dashed', opacity: 0.6 },
  target: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.6,
    zIndex: 1,
    pointerEvents: 'none',
  },
});
