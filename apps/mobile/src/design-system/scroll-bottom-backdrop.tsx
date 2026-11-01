import type { ReactElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';

import { useOwnlevelTheme } from './theme';

/** Fixed opaque backing under the floating controls. It never fades, moves or captures taps. */
export function ScrollBottomBackdrop({ inset }: { inset: number }) {
  const { colors } = useOwnlevelTheme();
  if (inset <= 0) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.backdrop, { height: inset, backgroundColor: colors.background }]} testID="scroll-bottom-backdrop" />;
}

/** Removing a marker leaves UIKit's automatic edge enabled. Explicitly hide only this scroll's bottom effect. */
export function ScrollBottomBoundary({ enabled, children }: { enabled: boolean; children: ReactElement }) {
  if (!enabled || Platform.OS !== 'ios' || Number.parseInt(String(Platform.Version), 10) < 26) return children;
  return <ScrollViewMarker style={styles.fill} scrollEdgeEffects={{ bottom: 'hidden' }}>{children}</ScrollViewMarker>;
}

const styles = StyleSheet.create({ backdrop: { position: 'absolute', left: 0, right: 0, bottom: 0 }, fill: { flex: 1 } });
