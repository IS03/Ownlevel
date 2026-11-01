import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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

/** The floating Liquid Glass tab bar exists from iOS 26; older systems keep the fixed backdrop. */
export function glassTabBarAvailable() {
  return Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;
}

/** Opacity left to content under the bar: shapes for the glass to refract, never readable text (#348). */
export const CONTENT_UNDER_BAR_OPACITY = 0.03;
const CONTENT_FADE_HEIGHT = spacing.xl + spacing.sm;

/**
 * Fades only the scrolling content as it reaches the floating tab bar (#348): rows keep their size and position (no
 * blur, stacking or smear), the screen background and glow stay behind the glass, and content under the buttons is
 * left at CONTENT_UNDER_BAR_OPACITY. The mask is fixed to the viewport; touches, insets and the last row are unchanged.
 */
export function BottomContentFade({ enabled, inset, children }: PropsWithChildren<{ enabled: boolean; inset: number }>) {
  if (!enabled || inset <= 0) return <>{children}</>;
  const faint = `rgba(0,0,0,${CONTENT_UNDER_BAR_OPACITY})`;
  return <MaskedView style={styles.fill} testID="scroll-bottom-content-fade" maskElement={<View style={[StyleSheet.absoluteFill, {
    experimental_backgroundImage: `linear-gradient(to top, ${faint} 0px, ${faint} ${inset}px, black ${inset + CONTENT_FADE_HEIGHT}px, black 100%)`,
  }]} />}>{children}</MaskedView>;
}

const styles = StyleSheet.create({ backdrop: { position: 'absolute', left: 0, right: 0, bottom: 0 }, fill: { flex: 1 } });
