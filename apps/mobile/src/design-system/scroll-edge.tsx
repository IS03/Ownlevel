import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from './brand';
import { useReduceTransparency } from './glass';
import { useOwnlevelTheme } from './theme';

// Strongest at the very top (under the clock), clear where content becomes readable again.
const fadeMask = (solid: number) => `linear-gradient(to bottom, black 0%, black ${Math.round(solid * 100)}%, transparent 100%)`;

/**
 * The top bar on scroll (IDENTIDAD.md § Vidrio): content passing under the status bar blurs progressively
 * instead of meeting a hard, pale band. iOS blurs it; Android and Reduce Transparency fade into the background.
 */
export function ScrollEdgeBlur({ visible, height, fade, testID }: {
  visible: boolean; height: number; testID?: string;
  /** Length of the soft bottom edge; by default the lower 45 %. A header with its own bar keeps the whole bar solid. */
  fade?: number;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  const reduceTransparency = useReduceTransparency();
  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => { shown.set(withTiming(visible ? 1 : 0, { duration: motion.duration.fast })); }, [shown, visible]);
  const appear = useAnimatedStyle(() => ({ opacity: shown.value }));
  const blur = Platform.OS === 'ios' && !reduceTransparency;
  return <Animated.View pointerEvents="none" style={[styles.edge, { height }, appear]} testID={testID}>
    <MaskedView style={StyleSheet.absoluteFill} maskElement={<View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: fadeMask(fade === undefined ? 0.55 : Math.max(0, 1 - fade / height)) }]} />}>
      {blur ? <BlurView intensity={isDark ? 80 : 75} tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'} style={StyleSheet.absoluteFill} /> : null}
      {/* A wash of the page colour keeps the clock legible over bright content, and is the whole effect without blur. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: blur ? 0.35 : 0.94 }]} />
    </MaskedView>
  </Animated.View>;
}

const styles = StyleSheet.create({ edge: { position: 'absolute', top: 0, left: 0, right: 0 } });
