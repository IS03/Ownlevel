import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInLeft } from 'react-native-reanimated';
import { AppIcon, AppText, GlassSurface, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { restCountdownLabel } from './use-rest-countdown';
import type { SessionNavigation } from './use-session-navigation';

/** UIKit supplies the accessory's Liquid Glass, safe area, height and transition. */
export function SessionRestAccessory({ navigation }: { navigation: SessionNavigation }) {
  const { colors } = useOwnlevelTheme();
  if (!navigation.timer || !navigation.showRest) return null;
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`Descanso de ${navigation.timer.exerciseName}: ${restCountdownLabel(navigation.seconds)}. Volver a la rutina en curso`}
    onPress={navigation.openSession} style={styles.timer} testID="session-rest-accessory">
    <AppIcon name="clock" size={17} color={colors.primary} />
    <AppText numeric variant="label" style={{ color: colors.primary }}>{restCountdownLabel(navigation.seconds)}</AppText>
    <AppText muted numberOfLines={1} variant="caption" style={styles.flex}>· {navigation.timer.exerciseName}</AppText>
  </Pressable>;
}

/** Older iOS/Android keep a single glass control above their existing system bar. */
export function SessionReturnDock({ navigation }: { navigation: SessionNavigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  if (!navigation.session || navigation.inSession || navigation.keyboardVisible) return null;
  return <Animated.View testID="session-return-dock" pointerEvents="box-none"
    entering={reduceMotion ? undefined : FadeInLeft.duration(brandTokens.motion.duration.base).withInitialValues({ opacity: 1 })}
    style={[styles.dock, { bottom: insets.bottom + brandTokens.layout.tabBarHeight + spacing.sm }]}>
    <View pointerEvents="box-none" style={styles.row}>
      {navigation.showRest ? <GlassSurface interactive style={styles.timerGlass}><SessionRestAccessory navigation={navigation} /></GlassSurface> : <View style={styles.flex} pointerEvents="none" />}
      <Pressable accessibilityRole="button" accessibilityLabel={`Volver a la rutina en curso: ${navigation.session.name}`}
        accessibilityHint={navigation.unavailable ? 'Última sesión conocida. Abrila para comprobar su estado.' : 'Continuá la sesión que dejaste en curso.'}
        onPress={navigation.openSession} style={({ pressed }) => pressedStyle(pressed, reduceMotion)}>
        <GlassSurface interactive style={styles.circle}><AppIcon name="dumbbell" size={24} color={colors.primary} /></GlassSurface>
      </Pressable>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, flex: { flex: 1 },
  timerGlass: { flex: 1, borderRadius: brandTokens.radius.full, overflow: 'hidden' },
  timer: { minHeight: brandTokens.layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  circle: { width: brandTokens.layout.buttonHeight, height: brandTokens.layout.buttonHeight, borderRadius: brandTokens.radius.full, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
