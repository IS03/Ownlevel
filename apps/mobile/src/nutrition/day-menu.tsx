import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, AppText, type AppIconName, useOwnlevelTheme } from '@/design-system';
import { NutritionGlassButton } from './day-controls';

export type NutritionDayMenuProps = { onSaved?: () => void; onFoods?: () => void; onPlan?: () => void; onEnergy?: () => void; onPhysical?: () => void };
/** Native Menu on iOS; a labelled dismissible menu on other platforms. */
export function NutritionDayMenu({ onSaved, onFoods, onPlan, onEnergy, onPhysical }: NutritionDayMenuProps) {
  const [open, setOpen] = useState(false);
  const { colors } = useOwnlevelTheme();
  const items: { label: string; icon: AppIconName; action?: () => void }[] = [
    { label: 'Comidas guardadas', icon: 'book', action: onSaved }, { label: 'Alimentos', icon: 'nutrition', action: onFoods },
    { label: 'Plan nutricional', icon: 'settings', action: onPlan },
    { label: 'Energía', icon: 'settings', action: onEnergy }, { label: 'Datos físicos', icon: 'settings', action: onPhysical },
  ];
  return <>
    <NutritionGlassButton icon="more" label="Más opciones de nutrición" onPress={() => setOpen(true)} />
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={styles.modal}>
        <Pressable accessibilityLabel="Cerrar menú" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {items.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityState={{ disabled: !item.action }} disabled={!item.action}
            onPress={() => { setOpen(false); item.action?.(); }} style={[styles.row, { borderBottomColor: colors.border }, !item.action && { opacity: 0.45 }]}>
            <AppText variant="subheadline">{item.label}</AppText><AppIcon name={item.icon} color={colors.textMuted} size={20} />
          </Pressable>)}
        </View>
      </SafeAreaView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  modal: { flex: 1, alignItems: 'flex-end', padding: 16, backgroundColor: 'rgba(0,0,0,0.12)' },
  menu: { marginTop: 56, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, minWidth: 248 },
  row: { flexDirection: 'row', gap: 24, minHeight: 50, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
});
