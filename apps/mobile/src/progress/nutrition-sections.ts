export const NUTRITION_SECTIONS = {
  protein: 'Proteína', targets: 'Tus objetivos', macros: 'Tus macros', balance: 'Balance estimado',
  days: 'Día por día', coverage: 'Qué datos hay',
} as const;
export type NutritionSection = keyof typeof NUTRITION_SECTIONS;
export function nutritionSection(value: unknown): NutritionSection | null {
  return typeof value === 'string' && Object.hasOwn(NUTRITION_SECTIONS, value) ? value as NutritionSection : null;
}
