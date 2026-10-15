import { ActionSheetIOS, Alert, Platform } from 'react-native';
export type NutritionAddMenuProps = { onManual?: () => void; onQuick?: () => void; onFood?: () => void };
export function showNutritionAddMenu({ onManual, onQuick, onFood }: NutritionAddMenuProps) {
  if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: ['Cancelar', 'A mano', 'Rápido', 'Alimento por cantidad'], cancelButtonIndex: 0 }, index => [undefined, onManual, onQuick, onFood][index]?.());
  else Alert.alert('Agregar comida', undefined, [{ text: 'A mano', onPress: onManual }, { text: 'Rápido', onPress: onQuick }, { text: 'Alimento por cantidad', onPress: onFood }, { text: 'Cancelar', style: 'cancel' }]);
}
