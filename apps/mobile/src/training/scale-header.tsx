import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, brandTokens } from '@/design-system';

/**
 * #514: the one line every finish question starts with (Energía, Fatiga, Rendimiento, Dolor): same type, weight, row height and
 * gap to its control. What was chosen follows once, muted («Energía · Baja»); an unanswered question shows no state at all
 * (never a made-up answer). `children` is an optional trailing shortcut («Sin dolor») that must not make its row taller.
 */
export function ScaleHeader({ label, state, children }: { label: string; state?: string | null; children?: ReactNode }) {
  return <View style={styles.row} testID="scale-header">
    <AppText variant="subheadline" style={styles.label}>{label}{state ? <AppText muted variant="subheadline" style={styles.state}>{` · ${state}`}</AppText> : null}</AppText>
    {children}
  </View>;
}
/** Rows and gaps shared by the four questions, so the rhythm is one rule instead of four. */
export const scaleStyles = StyleSheet.create({ scale: { gap: brandTokens.space.xs }, ends: { flexDirection: 'row', gap: brandTokens.space.xs, paddingHorizontal: brandTokens.space.xs } });
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: brandTokens.space.sm, minHeight: 32 },
  label: { flexShrink: 1, fontWeight: '600' }, state: { fontWeight: '400' },
});
