import { useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { AppIcon, AppSheet, AppText, ListRow, useOwnlevelTheme } from '@/design-system';
import { foodUnitOptions } from './food-model';
import { unitStyles, type UnitMenuProps } from './unit-menu-shared';

export type { UnitMenuProps } from './unit-menu-shared';
/** Android/Web: the unit as a field that opens a short list. iOS uses the native menu (unit-menu.ios.tsx). */
export function UnitMenu({ value, onChange, disabled }: UnitMenuProps) {
  const { colors } = useOwnlevelTheme();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Unidad, ${value || 'sin elegir'}`} disabled={disabled} onPress={() => setOpen(true)} testID="food-unit-menu"
      style={({ pressed }) => [unitStyles.field, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: 0.7 }, disabled && { opacity: 0.45 }]}>
      <AppText style={unitStyles.value}>{value || 'Unidad'}</AppText>
      <AppIcon name="chevronDown" color={colors.textMuted} size={15} />
    </Pressable>
    {open ? <AppSheet onClose={() => setOpen(false)} closeLabel="Cerrar unidades" style={{ backgroundColor: colors.background, maxHeight: '70%' }}>
      <ScrollView contentContainerStyle={unitStyles.sheet}>
        {foodUnitOptions(value).map(unit => <ListRow key={unit} title={unit} value={unit === value ? '✓' : undefined} onPress={() => { onChange(unit); setOpen(false); }} />)}
      </ScrollView>
    </AppSheet> : null}
  </>;
}
