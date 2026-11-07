import { StyleSheet, View } from 'react-native';
import type { FeelingOutcomeSummary } from '@/api/performance-insights';
import { AppText, spacing } from '@/design-system';
import { FactRow } from './insights-screen';
import { asideRows, outcomeTitle, priorRows, scopeText } from './feelings-model';

/** Shared presentation; it never reads, averages or searches for an association. */
export function FeelingOutcomeSections({ outcomes, prefix = 'feelings' }: { outcomes: readonly FeelingOutcomeSummary[]; prefix?: string }) {
  return <>{outcomes.map(summary => <View key={summary.kind} testID={`${prefix}-${summary.kind}`}>
    <AppText variant="headline" accessibilityRole="header">{outcomeTitle(summary)}</AppText>
    <AppText muted variant="footnote" numeric style={styles.note}>{scopeText(summary)}</AppText>
    {priorRows(summary).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} spoken={row.spoken} />)}
    {asideRows(summary).length ? <>
      <AppText muted variant="footnote" style={styles.section} accessibilityRole="header">Fuera de estas cuentas</AppText>
      {asideRows(summary).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} />)}
    </> : null}
  </View>)}</>;
}
const styles = StyleSheet.create({ note: { paddingVertical: spacing.xs }, section: { paddingTop: spacing.sm, paddingBottom: spacing.xs } });
