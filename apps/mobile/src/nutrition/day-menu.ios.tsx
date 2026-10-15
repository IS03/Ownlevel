import { StyleSheet } from 'react-native';
import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled, frame, glassEffect } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { NutritionDayMenuProps } from './day-menu';

export function NutritionDayMenu({ onSaved, onFoods, onPlan }: NutritionDayMenuProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return <Host colorScheme={isDark ? 'dark' : 'light'} matchContents style={styles.host} testID="nutrition-day-menu">
    <Menu label={<Image systemName="ellipsis" color={colors.text} size={20}
      modifiers={[frame({ width: 44, height: 44 }), glassEffect({ glass: { variant: 'regular' }, shape: 'circle' })]} />}
      modifiers={[accessibilityLabel('Más opciones de nutrición')]}>
      <Button label="Comidas guardadas" systemImage="bookmark" onPress={onSaved} modifiers={[disabled(!onSaved)]} />
      <Button label="Alimentos" systemImage="carrot" onPress={onFoods} modifiers={[disabled(!onFoods)]} />
      <Button label="Plan nutricional" systemImage="slider.horizontal.3" onPress={onPlan} modifiers={[disabled(!onPlan)]} />
    </Menu>
  </Host>;
}
const styles = StyleSheet.create({ host: { width: 44, height: 44 } });
