import { TextInput, View } from 'react-native';
import { AppText, useOwnlevelTheme } from '@/design-system';
import { NutritionGlassButton } from './day-controls';
import type { MealTiming as Timing } from '../../../../src/lib/mobile-api/nutrition-meal-contract';
import { mealMoments, mealTimingPresentation, type MealTimingProps } from './meal-timing-model';
export function MealTiming({ date, value, reference, disabled, onChange }: MealTimingProps) {
 const { colors } = useOwnlevelTheme();
 const keys = [null, ...Object.keys(mealMoments)] as Timing['mealLabel'][];
 const shown = mealTimingPresentation(date, value, reference);
 return <View style={{ gap: 8 }}><AppText muted>Momento</AppText><NutritionGlassButton icon="chevronDown" label={shown.moment} wide onPress={disabled ? undefined : () => onChange(keys[(keys.indexOf(value.mealLabel ?? null) + 1) % keys.length], value.consumedAt)} />
 <TextInput accessibilityLabel="Hora HH:MM" placeholder="Hora (opcional)" editable={!disabled} keyboardType="numbers-and-punctuation" key={shown.clock ?? 'unknown'} defaultValue={shown.clock ?? ''} onEndEditing={e => { const t = e.nativeEvent.text; if (t !== shown.clock && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) onChange(value.mealLabel ?? null, `${date}T${t}:00-03:00`); }} style={{ color: colors.text, minHeight: 48 }} />
 </View>;
}
