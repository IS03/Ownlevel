import { useState } from 'react';
import { NutritionMonthSheet } from './day-calendar';
import { Pressable } from 'react-native';
import { AppIcon, AppText, GlassSurface, useOwnlevelTheme } from '@/design-system';
import { displayNutritionDate, nutritionToday } from './day-format';
export function MealDateControl({ date, onChange, disabled }: { date: string; onChange: (date: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { colors } = useOwnlevelTheme();
  return <><Pressable accessibilityRole="button" accessibilityLabel={`Destino: ${date === nutritionToday() ? 'Hoy' : displayNutritionDate(date)}`} disabled={disabled} onPress={() => setOpen(true)} accessibilityState={{ disabled }}>
    <GlassSurface interactive style={{ minHeight: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, opacity: disabled ? 0.4 : 1 }}><AppText numeric variant="footnote">{date === nutritionToday() ? 'Hoy' : `${date.slice(8)}/${date.slice(5,7)}`}</AppText><AppIcon name="chevronDown" color={colors.textMuted} size={17} /></GlassSurface>
    </Pressable>
    {open ? <NutritionMonthSheet date={date} today={nutritionToday()} onClose={() => setOpen(false)} onSelect={next => { onChange(next); setOpen(false); }} /> : null}
  </>;
}
