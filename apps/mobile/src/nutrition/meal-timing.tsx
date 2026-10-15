import { TextInput, View } from 'react-native';
import { AppText, useOwnlevelTheme } from '@/design-system';
import { NutritionGlassButton } from './day-controls';
import type { MealTiming as Timing } from '../../../../src/lib/mobile-api/nutrition-meal-contract';
import { mealMoments, type MealTimingProps } from './meal-timing-model';
export function MealTiming({ date, value, disabled, onChange }: MealTimingProps) {
 const { colors } = useOwnlevelTheme();
 const keys = [null, ...Object.keys(mealMoments)] as Timing['mealLabel'][];
 return <View style={{ gap: 8 }}><AppText muted>Momento</AppText><NutritionGlassButton icon="chevronDown" label={value.mealLabel ? mealMoments[value.mealLabel] : 'Sin momento'} wide onPress={disabled ? undefined : () => onChange(keys[(keys.indexOf(value.mealLabel ?? null) + 1) % keys.length], value.consumedAt)} />
 <TextInput accessibilityLabel="Hora HH:MM" placeholder="Hora (opcional)" editable={!disabled} keyboardType="numbers-and-punctuation" defaultValue={value.consumedAt ? new Date(Date.parse(value.consumedAt) - 10800000).toISOString().slice(11,16) : ''} onEndEditing={e => { const t = e.nativeEvent.text; if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) onChange(value.mealLabel ?? null, `${date}T${t}:00-03:00`); }} style={{ color: colors.text, minHeight: 48 }} />
 </View>;
}
