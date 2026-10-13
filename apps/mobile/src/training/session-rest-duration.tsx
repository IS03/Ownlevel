import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, TextField, spacing } from '@/design-system';
import { RoutineFormSheet } from './routine-form-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
export function SessionRestDuration({ onClose, onStart }: { onClose: () => void; onStart: (seconds: number) => void }) {
  const [value, setValue] = useState('60'), seconds = Number(value);
  const valid = /^\d+$/.test(value) && seconds > 0 && seconds <= 3600;
  return <RoutineFormSheet open pending={false} onClose={onClose}><View style={{ padding: spacing.lg, gap: spacing.md }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><AppText variant="headline" style={{ flex: 1 }}>Iniciar descanso</AppText><RoutineSheetButton label="Cerrar duración de descanso" icon="close" onPress={onClose} /></View>
    <TextField numeric label="Duración en segundos" keyboardType="number-pad" value={value} onChangeText={setValue} maxLength={4} />
    <AppText muted variant="footnote">Elegí entre 1 y 3600 segundos. Se usa solo para este descanso.</AppText>
    <Button label="Iniciar descanso" disabled={!valid} onPress={() => { if (valid) onStart(seconds); }} />
  </View></RoutineFormSheet>;
}
