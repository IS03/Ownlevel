import { ScrollHeaderScreen } from '@/navigation/scroll-header-screen';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useMobileApi } from '@/api';
import { AppSheet, AppText, InlineUnavailable, SkeletonBlock, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { formatPct } from './comparison-change';
import { ownSpoken } from './own-model';
import { OwnMethod, WeekBars, useOwnPerformance } from './own-parts';

/**
 * Tu rendimiento (bocetos/rendimiento-tramos, R2): every routine together, a bar per week over «lo tuyo», the mean of the last four
 * weeks with sessions, and each routine's mean once it has ten measured sessions.
 */
export function OwnScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { state, data, refresh } = useOwnPerformance(client, null);
  const [method, setMethod] = useState(false);
  const scroll = (children: React.ReactNode) => <ScrollHeaderScreen title="Tu rendimiento"><ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} testID="own-screen">{children}</ScrollView></ScrollHeaderScreen>;
  if (state.status === 'loading' && !data) return scroll(<View style={styles.block}><SkeletonBlock height={64} /><SkeletonBlock height={140} /><SkeletonBlock height={160} /></View>);
  if (!data) return scroll(<InlineUnavailable message="No pudimos traer tu rendimiento." actionLabel="Reintentar" onAction={() => void refresh()} />);
  const recent = data.weeks.slice(-4).flatMap(week => week.mean === null ? [] : Array(week.measured).fill(week.mean) as number[]);
  const average = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length * 10) / 10 : null;
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}>
      <AppText muted variant="footnote" style={styles.kicker}>Últimas 12 semanas · todas las rutinas</AppText>
      {average !== null ? <View style={styles.hero} testID="own-average">
        <AppText variant="heroNumber" numeric accessibilityLabel={`${ownSpoken(average)}, promedio de las últimas 4 semanas`}>{formatPct(average)}</AppText>
        <AppText muted variant="subheadline" style={styles.heroSay}>{`promedio de\nlas últimas 4 semanas`}</AppText>
      </View> : <AppText muted testID="own-no-average">Todavía no hay sesiones con «lo tuyo» armado en las últimas 4 semanas.</AppText>}
    </View>
    <View style={styles.block}>
      <WeekBars weeks={data.weeks} label={`Rendimiento de cada semana frente a lo tuyo: ${data.weeks.map(week => week.mean === null ? 'sin sesiones medidas' : formatPct(week.mean)).join(', ')}`} />
      <AppText muted variant="footnote">Cada barra es una semana: el promedio de sus sesiones frente a lo tuyo. Hueca si tuvo una sola.</AppText>
    </View>
    {data.routines.length ? <View testID="own-routines">
      <AppText muted variant="footnote" accessibilityRole="header" style={[styles.kicker, styles.section]}>Por rutina</AppText>
      {data.routines.map(row => <View key={row.id} style={[styles.row, { borderColor: colors.border }]} accessible
        accessibilityLabel={`${row.name ?? 'Rutina'}, ${row.sessions} sesiones: ${row.mean === null ? `menos de ${data.rules.minRoutine} con lo tuyo armado` : ownSpoken(row.mean)}`}>
        <AppText style={styles.flex} numeric>{row.name ?? 'Rutina'} · {row.sessions} {row.sessions === 1 ? 'sesión' : 'sesiones'}</AppText>
        <AppText variant="headline" numeric muted={row.mean === null}>{row.mean === null ? '—' : formatPct(row.mean)}</AppText>
      </View>)}
      {data.routines.some(row => row.mean === null) ? <AppText muted variant="footnote" style={styles.section}>«—»: menos de {data.rules.minRoutine} sesiones con lo tuyo armado.</AppText> : null}
    </View> : null}
    <Pressable accessibilityRole="button" onPress={() => { haptics.selection(); setMethod(true); }} hitSlop={8} testID="own-screen-method">
      <AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Cómo se calcula</AppText>
    </Pressable>
    {method ? <AppSheet onClose={() => setMethod(false)} closeLabel="Cerrar" testID="own-screen-method-sheet" style={{ backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.sheet}><AppText variant="title2" accessibilityRole="header">Cómo se calcula</AppText><OwnMethod /></ScrollView>
    </AppSheet> : null}
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  flex: { flex: 1, flexShrink: 1 },
  kicker: { letterSpacing: 0.8, fontWeight: '600', textTransform: 'uppercase' },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, flexWrap: 'wrap' },
  heroSay: { paddingBottom: 8 },
  section: { paddingVertical: spacing.xs },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  sheet: { gap: spacing.md, padding: brandTokens.layout.screenPadding, paddingBottom: spacing.xxl },
});
