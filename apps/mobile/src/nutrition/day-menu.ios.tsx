import { StyleSheet, View } from 'react-native';
import { Button, Host, HStack, Menu, Spacer } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, contentShape, disabled, frame, menuIndicator, menuStyle, shapes } from '@expo/ui/swift-ui/modifiers';
import { AppIcon, GlassSurface, useOwnlevelTheme } from '@/design-system';
import type { NutritionDayMenuProps } from './day-menu';

export function NutritionDayMenu({ onSaved, onFoods, onPlan, onEnergy, onPhysical }: NutritionDayMenuProps) {
  const { colors, isDark } = useOwnlevelTheme();
  // Glass and glyph are React Native, like the calendar button: a SwiftUI host inside a scroll trails the page, so
  // the native menu sits over the glass (beside it, not inside) and its empty label only takes the tap.
  return <View style={styles.wrap}>
    <GlassSurface interactive style={styles.glass} testID="nutrition-day-menu-glass">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.icon}>
        <AppIcon name="more" color={colors.text} size={20} />
      </View>
    </GlassSurface>
    <Host colorScheme={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} testID="nutrition-day-menu">
      <Menu label={<HStack modifiers={[frame({ width: 44, height: 44 }), contentShape(shapes.rectangle())]}><Spacer minLength={0} /></HStack>}
        modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden'), accessibilityLabel('Más opciones de nutrición')]}>
        <Button label="Comidas guardadas" systemImage="bookmark" onPress={onSaved} modifiers={[disabled(!onSaved)]} />
        <Button label="Alimentos" systemImage="carrot" onPress={onFoods} modifiers={[disabled(!onFoods)]} />
        <Button label="Plan nutricional" systemImage="slider.horizontal.3" onPress={onPlan} modifiers={[disabled(!onPlan)]} />
        <Button label="Energía" systemImage="flame" onPress={onEnergy} modifiers={[disabled(!onEnergy)]} />
        <Button label="Datos físicos" systemImage="figure.stand" onPress={onPhysical} modifiers={[disabled(!onPhysical)]} />
      </Menu>
    </Host>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { width: 44, height: 44 }, glass: { width: 44, height: 44, borderRadius: 999, overflow: 'hidden' },
  icon: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
