import { NutritionToast } from './nutrition-toast';
import type { MealNotice } from './use-meal-notice';
export function MealAddedNotice({ notice, disabled, pending, onUndo, onClose }: { notice: MealNotice; disabled: boolean; pending: boolean; onUndo: () => void; onClose: () => void }) {
  return <NutritionToast testID="nutrition-meal-notice" message={pending ? 'Deshaciendo…' : notice.message} state={pending ? 'pending' : 'info'}
    action={{ label: 'Deshacer', accessibilityLabel: 'Deshacer comida agregada', disabled, onPress: onUndo }} onClose={onClose} closeLabel="Cerrar aviso de comida" />;
}
