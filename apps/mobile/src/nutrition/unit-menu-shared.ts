import { StyleSheet } from 'react-native';
import { spacing } from '@/design-system';

export type UnitMenuProps = { value: string; onChange: (unit: string) => void; disabled?: boolean };
/** Same height, radius and fill as the other fields of the food editor. */
export const unitStyles = StyleSheet.create({
  field: { minHeight: 48, borderRadius: 12, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  value: { flex: 1 },
  sheet: { padding: spacing.lg, gap: spacing.xs },
});
