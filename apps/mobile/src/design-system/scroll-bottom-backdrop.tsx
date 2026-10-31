import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import MaskedView from '@react-native-masked-view/masked-view';

import { spacing } from './tokens';
import { useOwnlevelTheme } from './theme';

/** Fixed backing for a floating tab bar: fade the approaching row, then fully hide it under the controls.
 * It never follows scroll offset or animates at the end of the list. UIKit still owns the content insets. */
export function ScrollBottomBackdrop({ inset }: { inset: number }) {
  const { colors } = useOwnlevelTheme();
  if (inset <= 0) return null;
  const height = inset + spacing.xl;
  const solid = spacing.xl / height * 100;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.backdrop, { height }]} testID="scroll-bottom-backdrop">
    <MaskedView style={StyleSheet.absoluteFill} maskElement={<View style={[StyleSheet.absoluteFill, {
      experimental_backgroundImage: `linear-gradient(to bottom, transparent 0%, black ${solid}%, black 100%)`,
    }]} />}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
    </MaskedView>
  </View>;
}

/** UIKit's scroll edge effect under the native tab bar exists from iOS 26. */
export function nativeBottomEdgeAvailable() {
  return Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;
}

/**
 * Registers the scroll view with the native tab so iOS applies its soft bottom edge effect (#348): text is blurred
 * and faded under the bar while the glass keeps refracting real content. No own layer, no change to insets.
 * Uses react-native-screens' experimental marker (4.26.2, pinned by the lockfile); off renders the child as is.
 */
export function NativeBottomEdge({ enabled, children }: PropsWithChildren<{ enabled: boolean }>) {
  if (!enabled) return <>{children}</>;
  return <ScrollViewMarker style={styles.fill} scrollEdgeEffects={{ bottom: 'soft' }}>{children as NonNullable<typeof children>}</ScrollViewMarker>;
}

const styles = StyleSheet.create({ backdrop: { position: 'absolute', left: 0, right: 0, bottom: 0 }, fill: { flex: 1 } });
