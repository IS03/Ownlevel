import { useState } from 'react';
import { View } from 'react-native';
import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, monospacedDigit, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { AppText, Button, spacing, useOwnlevelTheme } from '@/design-system';
import { RoutineFormSheet } from './routine-form-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
import { formatRest } from './exercise-library-model';
export function SessionRestDuration({ onClose, onStart }: { onClose: () => void; onStart: (seconds: number) => void }) {
  const [seconds, setSeconds] = useState(60), { colors, isDark } = useOwnlevelTheme();
  return <RoutineFormSheet open pending={false} onClose={onClose}><View style={{ padding: spacing.lg, gap: spacing.md }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><AppText variant="headline" style={{ flex: 1 }}>Iniciar descanso</AppText><RoutineSheetButton label="Cerrar duración de descanso" icon="close" onPress={onClose} /></View>
    <Host colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <Picker label="Duración del descanso" selection={seconds} onSelectionChange={(value: number) => setSeconds(value)} modifiers={[pickerStyle('wheel'), frame({ maxWidth: Infinity })]}>
        {Array.from({ length: 240 }, (_, index) => (index + 1) * 15).map(value => <Text key={value} modifiers={[tag(value), font({ textStyle: 'title2' }), foregroundStyle(colors.text), monospacedDigit()]}>{formatRest(value)}</Text>)}
      </Picker>
    </Host>
    <AppText muted variant="footnote">Se usa solo para este descanso.</AppText><Button label="Iniciar descanso" onPress={() => onStart(seconds)} />
  </View></RoutineFormSheet>;
}
