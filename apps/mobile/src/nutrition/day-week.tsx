import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import { useMobileApi } from '@/api';
import type { ReportDailyRow } from '@/api/nutrition-report';
import { AppText, Button, useOwnlevelTheme } from '@/design-system';
import { displayNutritionDate } from './day-format';
import { dayRings, nutritionWeek, reportRings } from './day-home-model';
import { readingLabel } from './day-summary';
import { NutritionRings } from './day-rings';
import { useNutritionReportResource } from './report-resource';

const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export function NutritionWeek({ date, today, data, onSelect, refreshRevision = 0 }: { refreshRevision?: number; date: string; today: string; data?: MobileNutritionDayResponse; onSelect: (date: string) => void }) {
  const dates = nutritionWeek(date);
  return dates[0] > today ? <WeekDays date={date} dates={dates} onSelect={onSelect} today={today} data={data} />
    : <ReadWeek refreshRevision={refreshRevision} date={date} dates={dates} onSelect={onSelect} today={today} data={data} />;
}
function ReadWeek(props: { refreshRevision: number; date: string; today: string; dates: string[]; data?: MobileNutritionDayResponse; onSelect: (date: string) => void }) {
  const { client } = useMobileApi();
  const { state, refresh } = useNutritionReportResource(client, { period: 'custom', from: props.dates[0], to: props.dates[6] < props.today ? props.dates[6] : props.today });
  const { refreshRevision } = props;
  useEffect(() => { if (refreshRevision > 0) void refresh(); }, [refreshRevision, refresh]);
  // Failed refreshes stay explicit; another week's readings never cross the resource scope.
  const report = state.status === 'ready' ? state.current.data : state.status === 'unavailable' ? state.previous?.data : undefined;
  const failed = state.status !== 'ready' && state.status !== 'loading';
  return <View style={styles.section}>
    <WeekDays {...props} rows={report?.days} unavailable={failed} loading={state.status === 'loading'} />
    {failed ? <View><AppText muted variant="caption">{report ? 'Semana sin actualizar. Última lectura.' : 'Semana no disponible.'}</AppText>
      <Button variant="quiet" label="Reintentar semana" onPress={() => void refresh()} /></View> : null}
  </View>;
}
function WeekDays({ date, dates, today, data, rows, unavailable, loading, onSelect }: {
  date: string; dates: string[]; today: string; data?: MobileNutritionDayResponse; rows?: ReportDailyRow[]; unavailable?: boolean; loading?: boolean;
} & { onSelect: (date: string) => void }) {
  const { colors } = useOwnlevelTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}><View style={styles.week} testID="nutrition-week">
    {dates.map((day, i) => {
      const row = rows?.find(d => d.date === day);
      const selected = day === date;
      const readings = selected && data ? dayRings(data) : reportRings(row);
      const status = day > today ? 'Fecha futura' : selected && data ? data.nutrition.status === 'unavailable' ? 'No disponible' : data.nutrition.data.dayState === 'missing' ? 'Sin día registrado' : null
        : unavailable ? 'No disponible' : loading ? 'Cargando' : row?.hasNutrition ? null : 'Sin día registrado';
      return <WeekDay key={day} day={day} index={i} selected={selected} today={today} readings={readings} status={status} colors={colors} onSelect={onSelect} />;
    })}
  </View></ScrollView>;
}
function WeekDay({ day, index, selected, today, readings, status, colors, onSelect }: {
  day: string; index: number; selected: boolean; today: string; readings: ReturnType<typeof dayRings>; status: string | null;
  colors: ReturnType<typeof useOwnlevelTheme>['colors']; onSelect: (date: string) => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }}
    accessibilityLabel={`${displayNutritionDate(day)}${day === today ? ', hoy' : ''}. ${status ?? `Calorías ${readingLabel(readings.calories, 'kcal')}. Proteína ${readingLabel(readings.protein, 'g')}`}`}
    onPress={() => onSelect(day)} style={[styles.day, selected && { backgroundColor: colors.brandSubtle }]} testID={`nutrition-week-${day}`}>
    <AppText muted={!selected} variant="caption">{weekdays[index]}</AppText>
    <NutritionRings readings={readings} size={32} testID={`nutrition-week-rings-${day}`} />
    <AppText numeric variant="caption" style={{ fontWeight: selected ? '700' : '400', color: selected ? colors.text : colors.textMuted }}>{Number(day.slice(8))}</AppText>
  </Pressable>;
}
const styles = StyleSheet.create({
  scroll: { flexGrow: 1 }, section: { gap: 4 }, week: { flex: 1, minWidth: 308, flexDirection: 'row', justifyContent: 'space-between', gap: 0 },
  day: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12 },
});
