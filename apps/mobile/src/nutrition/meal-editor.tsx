import { ManualMealEntry } from './manual-meal-entry';
import type { MealController, MealEditorState } from './meal-controller';

/** Create, repeat and edit share the "Cargar a mano" screen (bocetos A4 and D3). */
export function MealEditor(props: { controller: MealController; state: MealEditorState }) {
  return props.state.editor ? <ManualMealEntry {...props} /> : null;
}
