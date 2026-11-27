import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AppIcon, GlassSurface, brandTokens, pressedStyle, radius, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';
export function RoutineSheetButton({ label, icon, onPress, disabled = false, accent = false, pending = false, testID }: {
  label: string; icon: AppIconName; onPress: () => void; disabled?: boolean; accent?: boolean; pending?: boolean; testID?: string;
}) {
  const { colors } = useOwnlevelTheme(), reduceMotion = useReduceMotion();
  return <GlassSurface interactive style={styles.round}>
    <Pressable testID={testID} accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.round, disabled && { opacity: 0.4 }, pressedStyle(pressed, reduceMotion)]}>
      {pending ? <ActivityIndicator color={colors.primary} /> : <AppIcon name={icon} color={accent ? colors.primary : colors.text} size={20} />}
    </Pressable>
  </GlassSurface>;
}
const styles = StyleSheet.create({ round: { alignItems: 'center', borderRadius: radius.full, height: brandTokens.layout.minTouch, justifyContent: 'center', width: brandTokens.layout.minTouch } });
