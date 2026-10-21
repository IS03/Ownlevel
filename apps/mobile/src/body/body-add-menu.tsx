import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, AppText, GlassSurface, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';

import type { BodyAddAction, BodyAddMenuProps } from './body-add-menu.types';

const SIZE = 56, GAP = 12, OPTION = 48;
const SPRING = brandTokens.motion.spring;

/** One option: a glass capsule that rises from the button, the nearest first (IDENTIDAD.md: glass only on floating controls). */
function Option({ action, index, open, reduced, onPick }: { action: BodyAddAction; index: number; open: SharedValue<number>; reduced: boolean; onPick: () => void }) {
  const { colors } = useOwnlevelTheme();
  // Each capsule leaves from behind the "+" and settles one row higher than the previous one.
  const rise = SIZE + GAP + index * (OPTION + GAP);
  const style = useAnimatedStyle(() => {
    const t = open.value;
    return reduced
      ? { opacity: t }
      : { opacity: Math.min(1, t * 1.6), transform: [{ translateY: (1 - t) * rise }, { scale: 0.85 + 0.15 * t }] };
  });
  return <Animated.View style={[styles.option, { bottom: rise }, style]}>
    <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={onPick} testID={`body-add-${action.key}`}
      style={({ pressed }) => pressedStyle(pressed, reduced)}>
      <GlassSurface interactive style={styles.capsule}>
        <AppIcon name={action.icon} color={colors.primary} size={20} />
        <AppText variant="headline">{action.label}</AppText>
      </GlassSurface>
    </Pressable>
  </Animated.View>;
}

/**
 * Cuerpo's floating "+": a Liquid Glass circle above the tab bar. Tapping it turns the "+" into "×" and the options
 * rise out of it as glass capsules (never on top of it); a tap outside closes. Reduce Motion: fades only.
 */
export function BodyAddMenu({ actions, disabled = false }: BodyAddMenuProps) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const insets = useSafeAreaInsets();
  const [choice, setOpen] = useState(false);
  // Disabled (a sheet is open or a write is pending) always reads as closed.
  const open = choice && !disabled;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduced ? withTiming(open ? 1 : 0, { duration: brandTokens.motion.duration.fast })
      : open ? withSpring(1, SPRING) : withTiming(0, { duration: brandTokens.motion.duration.fast });
  }, [open, progress, reduced]);
  const toggle = () => { triggerHaptic('stepperChange'); setOpen(v => !v); };
  const pick = (action: BodyAddAction) => { triggerHaptic('stepperChange'); setOpen(false); action.onPress(); };
  const icon = useAnimatedStyle(() => (reduced ? {} : { transform: [{ rotate: `${progress.value * 45}deg` }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: progress.value }));
  const bottom = insets.bottom + spacing.sm;
  // Touches only reach views inside their parent's frame: the dock is as tall as the open menu and lets the rest through.
  const height = SIZE + actions.length * (OPTION + GAP);
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="body-add">
    {/* A light veil keeps the options readable over the page; tapping it closes. */}
    <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
      <Pressable accessibilityLabel="Cerrar opciones" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
    </Animated.View>
    <View pointerEvents="box-none" style={[styles.dock, { bottom, height }]}>
      <View pointerEvents={open ? 'box-none' : 'none'} style={StyleSheet.absoluteFill} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
        {actions.map((a, i) => <Option key={a.key} action={a} index={i} open={progress} reduced={reduced} onPick={() => pick(a)} />)}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Cerrar opciones' : 'Agregar registro'} accessibilityState={{ disabled, expanded: open }}
        disabled={disabled} onPress={toggle} style={({ pressed }) => [styles.button, pressedStyle(pressed, reduced), disabled && { opacity: 0.4 }]} testID="body-add-menu">
        <View style={styles.shadow}>
          <GlassSurface interactive tint={colors.brandSubtle} style={styles.round}>
            <Animated.View style={icon}><AppIcon name="plus" color={colors.primary} size={26} /></Animated.View>
          </GlassSurface>
        </View>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.12)' },
  dock: { position: 'absolute', right: brandTokens.layout.tabBarInset, width: 300 },
  button: { position: 'absolute', right: 0, bottom: 0 },
  shadow: { borderRadius: SIZE / 2, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  round: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  option: { position: 'absolute', right: 0 },
  capsule: { minHeight: OPTION, borderRadius: OPTION / 2, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
});
