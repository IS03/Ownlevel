import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, spacing } from '@/design-system';
import { isNutritionDate } from '@/api/nutrition-day';

/**
 * A point inspected on a portada spark, carried to the deep chart of its area: the interval, the value the spark
 * showed and its readout. Only route params: no global state, no read. The detail decides whether it holds the same
 * datum (same dates, measure and aggregation); otherwise it says where the reader came from and selects nothing.
 */
export type PortadaPoint = { start: string; end: string; value: number | null; text: string };

export const portadaPointParams = (p: PortadaPoint): Record<string, string> =>
  ({ point: `${p.start}~${p.end}`, pointValue: p.value === null ? '' : String(p.value), pointText: p.text });

export function usePortadaPoint(): PortadaPoint | null {
  const params = useLocalSearchParams<{ point?: string; pointValue?: string; pointText?: string }>();
  const [start, end] = typeof params.point === 'string' ? params.point.split('~') : [];
  if (!isNutritionDate(start) || !isNutritionDate(end) || start > end || typeof params.pointText !== 'string') return null;
  const value = params.pointValue === '' || params.pointValue === undefined ? null : Number(params.pointValue);
  return { start, end, value: value === null || Number.isFinite(value) ? value : null, text: params.pointText };
}

/** Same value as the spark (both come from the same confirmed rows); a tolerance only for float formatting. */
export const sameValue = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) < 1e-6;

/**
 * Where the reader came from. `matched`: the chart below has that same datum selected. Otherwise the reason why no
 * datum is selected, never another one in its place.
 */
export function PortadaPointNote({ point, matched, reason }: { point: PortadaPoint; matched: boolean; reason?: string }) {
  return <View style={styles.note} testID="portada-point-note" accessible
    accessibilityLabel={`Desde la portada: ${point.text}. ${matched ? 'Seleccionado en el gráfico.' : reason ?? 'No hay un dato equivalente en este gráfico.'}`}>
    <AppText muted numeric variant="footnote">Desde la portada · {point.text}</AppText>
    <AppText muted variant="footnote">{matched ? 'Es el mismo dato: quedó seleccionado en el gráfico.' : reason ?? 'Este gráfico no tiene ese mismo dato: no seleccionamos otro en su lugar.'}</AppText>
  </View>;
}
const styles = StyleSheet.create({ note: { gap: spacing.xs } });
