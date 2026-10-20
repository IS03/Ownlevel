import { useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText, brandTokens, useOwnlevelTheme } from '@/design-system';
import { KindPicker } from './kind-picker';
import type { KindPickerProps } from './kind-picker.types';
import { kindLabel } from './stages-model';

// Below this content width, long type labels need a separate line.
const minimumInlineWidth = 320;

export function StageKindField({ readOnly = false, ...props }: KindPickerProps & {
  readOnly?: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const stacked = Platform.OS !== 'ios' || fontScale > 1.3 || (width > 0 && width < minimumInlineWidth);
  return (
    <View style={styles.field} testID="stage-kind-field" onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <View testID="stage-kind-row" style={[styles.row, stacked && styles.stacked]}>
        <AppText variant="headline" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">Tipo</AppText>
        <View style={stacked ? styles.fullWidth : styles.value}>
          {readOnly ? (
            <View style={{ minHeight: brandTokens.layout.minTouch, justifyContent: 'center' }}>
              <AppText accessibilityLabel="Tipo de plan" accessibilityValue={{ text: kindLabel(props.value) }}
                style={{ color: colors.primary, textAlign: stacked ? 'left' : 'right' }}>
                {kindLabel(props.value)}
              </AppText>
            </View>
          ) : <KindPicker {...props} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: brandTokens.space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.md, minHeight: brandTokens.layout.minTouch },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: brandTokens.space.xs },
  value: { flex: 1, minWidth: 0 },
  fullWidth: { width: '100%' },
});
