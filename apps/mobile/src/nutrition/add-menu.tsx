import { NutritionGlassButton } from './day-controls';
import { showNutritionAddMenu, type NutritionAddMenuProps } from './add-menu-actions';
export { showNutritionAddMenu } from './add-menu-actions';
export function NutritionAddMenu(props: NutritionAddMenuProps) {
  return <NutritionGlassButton icon="plus" label="Agregar comida" wide onPress={props.onManual ? () => showNutritionAddMenu(props) : undefined} />;
}
