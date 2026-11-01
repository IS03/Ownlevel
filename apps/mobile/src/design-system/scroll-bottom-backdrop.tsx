import type { ReactElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import MaskedView from '@react-native-masked-view/masked-view';

import { spacing } from './tokens';
import { useReduceTransparency } from './glass';
import { useOwnlevelTheme } from './theme';

/** Fixed spatial wash behind the glass. Only this backing is masked, never the scroll or its rows. */
export function ScrollBottomBackdrop({ inset }: { inset: number }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceTransparency();
  if (inset <= 0) return null;
  const height = inset + spacing.xl;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.backdrop, { height }]} testID="scroll-bottom-backdrop">
    <MaskedView style={StyleSheet.absoluteFill} maskElement={<View style={[StyleSheet.absoluteFill, {
      experimental_backgroundImage: `linear-gradient(to bottom, transparent 0px, black ${spacing.xl}px, black 100%)`,
    }]} />}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: reduced ? 1 : 0.96 }]} />
    </MaskedView>
  </View>;
}

/** Removing a marker leaves UIKit's automatic edge enabled. Explicitly hide only this scroll's bottom effect. */
export function ScrollBottomBoundary({ enabled, children }: { enabled: boolean; children: ReactElement }) {
  if (!enabled || Platform.OS !== 'ios' || Number.parseInt(String(Platform.Version), 10) < 26) return children;
  return <ScrollViewMarker style={styles.fill} scrollEdgeEffects={{ bottom: 'hidden' }}>{children}</ScrollViewMarker>;
}

const styles = StyleSheet.create({ backdrop: { position: 'absolute', left: 0, right: 0, bottom: 0 }, fill: { flex: 1 } });
