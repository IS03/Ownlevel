import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, GlassSurface, motionDurations, radius, spacing, useOwnlevelTheme } from '@/design-system';
export function ExerciseNotice({ message, error, undo, disabled, bottomOffset = 0 }: { message: string; error?: boolean; undo?: () => void; disabled: boolean; bottomOffset?: number }) {
  const insets = useSafeAreaInsets(), { colors } = useOwnlevelTheme();
  return <Animated.View entering={FadeIn.duration(motionDurations.fast)} exiting={FadeOut.duration(motionDurations.fast)} style={[styles.toast, { bottom: insets.bottom + spacing.sm + bottomOffset }]}>
    <GlassSurface style={styles.surface}><AppText accessibilityRole={error ? 'alert' : undefined} variant="subheadline" style={{ flex: 1 }}>{message}</AppText>
      {undo ? <Pressable accessibilityRole="button" accessibilityLabel="Deshacer" disabled={disabled} onPress={undo} style={styles.undo}><AppText variant="headline" style={{ color: colors.primary }}>Deshacer</AppText></Pressable> : null}
    </GlassSurface></Animated.View>;
}
const styles = StyleSheet.create({ toast: { position: 'absolute', bottom: 0, left: spacing.lg, right: spacing.lg }, surface: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', borderRadius: radius.card, padding: spacing.md }, undo: { minHeight: 44, justifyContent: 'center' } });
