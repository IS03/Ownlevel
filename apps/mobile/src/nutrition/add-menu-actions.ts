import { ActionSheetIOS, Alert, Platform } from 'react-native';
export type NutritionAddMenuProps = { onManual?: () => void; onQuick?: () => void; onFood?: () => void; onPlate?: () => void };
export function showNutritionAddMenu({ onManual, onQuick, onFood, onPlate }: NutritionAddMenuProps) {
  if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: ['Cancelar', 'A mano', 'Rápido', 'Alimento por cantidad', 'Plato'], cancelButtonIndex: 0 }, index => [undefined, onManual, onQuick, onFood, onPlate][index]?.());
  else Alert.alert('Agregar comida', undefined, [{ text: 'A mano', onPress: onManual }, { text: 'Rápido', onPress: onQuick }, { text: 'Alimento por cantidad', onPress: onFood }, { text: 'Plato', onPress: onPlate }, { text: 'Cancelar', style: 'cancel' }]);
}
