import type { ReactElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';

import { spacing } from './tokens';
import { useReduceTransparency } from './glass';
import { useOwnlevelTheme } from './theme';

/** Blur the content beneath floating controls. Only the backing is masked, never the rows. */
export function ScrollBottomBackdrop({ inset }: { inset: number }) {
  const { colors, isDark } = useOwnlevelTheme();
  const reduced = useReduceTransparency();
  if (inset <= 0) return null;
  const height = inset + spacing.xl;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.backdrop, { height }]} testID="scroll-bottom-backdrop">
    <MaskedView style={StyleSheet.absoluteFill} maskElement={<View style={[StyleSheet.absoluteFill, {
      experimental_backgroundImage: `linear-gradient(to bottom, transparent 0px, black ${spacing.xl}px, black 100%)`,
    }]} />}>
      {Platform.OS === 'ios' && !reduced
        ? <BlurView intensity={isDark ? 80 : 75} tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'} style={StyleSheet.absoluteFill} />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />}
    </MaskedView>
  </View>;
}

/** Removing a marker leaves UIKit's automatic edge enabled. Explicitly hide only this scroll's bottom effect. */
export function ScrollBottomBoundary({ enabled, children }: { enabled: boolean; children: ReactElement }) {
  if (!enabled || Platform.OS !== 'ios' || Number.parseInt(String(Platform.Version), 10) < 26) return children;
  return <ScrollViewMarker style={styles.fill} scrollEdgeEffects={{ bottom: 'hidden' }}>{children}</ScrollViewMarker>;
}

const styles = StyleSheet.create({ backdrop: { position: 'absolute', left: 0, right: 0, bottom: 0 }, fill: { flex: 1 } });
