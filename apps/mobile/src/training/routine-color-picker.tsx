import { Pressable, StyleSheet, View } from 'react-native';
import type { MobileRoutineColorKey } from '@/api/home';
import { MOBILE_ROUTINE_COLOR_KEYS } from '@/api/routine-color';
import { AppIcon, AppText, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { trainingRoutineCheckColor, trainingRoutineColor, trainingRoutineColorLabel } from './routine-colors';

export function RoutineColorPicker({ color, disabled, onChange }: {
  color: MobileRoutineColorKey | null; disabled: boolean; onChange: (color: MobileRoutineColorKey) => void;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  return (
    <View style={styles.group}>
      <AppText variant="headline">Color</AppText>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {[MOBILE_ROUTINE_COLOR_KEYS.slice(0, 4), MOBILE_ROUTINE_COLOR_KEYS.slice(4)].map((row, index) => (
          <View key={index} style={styles.row} testID="routine-color-row">
            {row.map(option => (
              <Pressable accessibilityLabel={trainingRoutineColorLabel(option)} accessibilityRole="radio"
                accessibilityState={{ checked: color === option, disabled }} disabled={disabled} key={option}
                onPress={() => onChange(option)} style={({ pressed }) => [styles.target, { borderColor: color === option ? colors.text : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
                <View style={[styles.swatch, { backgroundColor: trainingRoutineColor(option, isDark) }]}>
                  {color === option ? <AppIcon color={trainingRoutineCheckColor(option, isDark)} name="checkmark" size={20} /> : null}
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { alignItems: 'center', borderRadius: radius.full, height: 40, justifyContent: 'center', width: 40 },
  target: { alignItems: 'center', borderRadius: radius.full, borderWidth: 2, height: 48, justifyContent: 'center', width: 48 },
});
