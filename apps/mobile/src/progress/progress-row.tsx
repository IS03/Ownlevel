import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon, spacing, useOwnlevelTheme } from '@/design-system';

/** Flat rows shared by the Nutrition progress surfaces, following AreaRow / FlatRow. */
export function ProgressRow({
  children,
  label,
  onPress,
  testID,
}: {
  children: ReactNode;
  label?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors } = useOwnlevelTheme();
  const content = (
    <>
      {children}
      {onPress ? <AppIcon name="chevronRight" size={17} color={colors.textMuted} /> : null}
    </>
  );
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View
      testID={testID}
      accessible={!!label}
      accessibilityLabel={label}
      style={[styles.row, { borderColor: colors.border }]}
    >
      {content}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
