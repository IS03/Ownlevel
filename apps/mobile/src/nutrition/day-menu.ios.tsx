import { StyleSheet } from 'react-native';
import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, disabled, frame, menuIndicator, menuStyle } from '@expo/ui/swift-ui/modifiers';
import { GlassSurface, useOwnlevelTheme } from '@/design-system';
import type { NutritionDayMenuProps } from './day-menu';

export function NutritionDayMenu({ onSaved, onFoods, onPlan, onEnergy, onPhysical }: NutritionDayMenuProps) {
  const { colors, isDark } = useOwnlevelTheme();
  // The glass is the same native view as the calendar button's: SwiftUI's own glass inside a scroll trails the page.
  return <GlassSurface interactive style={styles.glass} testID="nutrition-day-menu-glass"><Host colorScheme={isDark ? 'dark' : 'light'} matchContents style={styles.host} testID="nutrition-day-menu">
    <Menu label={<Image systemName="ellipsis" color={colors.text} size={20} modifiers={[frame({ width: 44, height: 44 })]} />}
      modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden'), accessibilityLabel('Más opciones de nutrición')]}>
      <Button label="Comidas guardadas" systemImage="bookmark" onPress={onSaved} modifiers={[disabled(!onSaved)]} />
      <Button label="Alimentos" systemImage="carrot" onPress={onFoods} modifiers={[disabled(!onFoods)]} />
      <Button label="Plan nutricional" systemImage="slider.horizontal.3" onPress={onPlan} modifiers={[disabled(!onPlan)]} />
      <Button label="Energía" systemImage="flame" onPress={onEnergy} modifiers={[disabled(!onEnergy)]} />
      <Button label="Datos físicos" systemImage="figure.stand" onPress={onPhysical} modifiers={[disabled(!onPhysical)]} />
    </Menu>
  </Host></GlassSurface>;
}
const styles = StyleSheet.create({
  glass: { width: 44, height: 44, borderRadius: 999, overflow: 'hidden' }, host: { width: 44, height: 44 },
});
