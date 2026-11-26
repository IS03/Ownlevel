import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMobileApi } from '@/api';
import { fetchTrainingHistoryExercises } from '@/api/training-history';
import { AppText, Button, EmptyState, ScrollScreen, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { homeDay } from '@/home/home-day';
import { ScrollHeaderScreen } from '@/navigation/scroll-header-screen';
import { useFocusedRead } from '@/training/use-read';
import { muscleRecency, recencyLabel } from './muscle-recency';

const UNAVAILABLE = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } };
const shortDate = (date: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00Z`));

/** #639 · Progreso → Músculos: when each muscle group last had sets, the longest ago first. */
export function MusclesScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const load = useCallback((signal: AbortSignal) => client ? fetchTrainingHistoryExercises(client, signal) : Promise.resolve(UNAVAILABLE), [client]);
  const { state, reload } = useFocusedRead(load);
  const today = homeDay().today;
  const rows = state.status === 'ready' ? muscleRecency(state.data) : [];
  return <ScrollHeaderScreen title="Músculos"><ScrollScreen contentContainerStyle={{ gap: spacing.lg }}>
    <AppText muted>La última vez que cada grupo tuvo series, según tus ejercicios registrados.</AppText>
    {state.status === 'loading' ? <View style={styles.list} testID="muscles-loading"><SkeletonBlock height={48} /><SkeletonBlock height={48} /><SkeletonBlock height={48} /></View>
      : state.status !== 'ready' ? <UnavailableState title="No pudimos cargar tus músculos" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
        action={<Button label="Reintentar" onPress={() => void reload()} />} />
      : !rows.length ? <EmptyState title="Todavía no hay grupos con series" description="Aparecen acá cuando completás series de ejercicios con grupo muscular." />
      : <View style={styles.list} testID="muscles-list">{rows.map((row, index) => <View key={row.group} accessible
          accessibilityLabel={`${row.label}: ${recencyLabel(row.lastDate, today)}${row.lastDate ? `, ${shortDate(row.lastDate)}` : ''}`}
          style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`muscle-${row.group}`}>
          <View style={styles.flex}>
            <AppText variant="headline">{row.label}</AppText>
            <AppText muted numeric variant="footnote">{`${row.exercises} ${row.exercises === 1 ? 'ejercicio' : 'ejercicios'}`}</AppText>
          </View>
          <View style={styles.right}>
            <AppText numeric variant="subheadline">{recencyLabel(row.lastDate, today)}</AppText>
            {row.lastDate ? <AppText muted numeric variant="footnote">{shortDate(row.lastDate)}</AppText> : null}
          </View>
        </View>)}</View>}
  </ScrollScreen></ScrollHeaderScreen>;
}
const styles = StyleSheet.create({
  list: { gap: 0 }, flex: { flex: 1 }, right: { alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: spacing.sm },
});
