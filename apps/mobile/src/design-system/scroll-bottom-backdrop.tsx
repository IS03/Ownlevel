import { StyleSheet, View } from 'react-native';
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

const styles = StyleSheet.create({ backdrop: { position: 'absolute', left: 0, right: 0, bottom: 0 } });
