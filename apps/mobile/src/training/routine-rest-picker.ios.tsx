import { HStack, Host, Picker, Text, VStack } from '@expo/ui/swift-ui';
import { disabled as disable, font, foregroundStyle, frame, monospacedDigit, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import { formatRest, parseRest } from './exercise-library-model';
import { changeRest, restWheelChoices } from './routine-editor-model';
import type { RoutineRestPickerProps } from './routine-rest-picker.types';
export function RoutineRestPicker({ draft, disabled, onChange }: RoutineRestPickerProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return <Host colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ width: '100%' }}>
    <HStack spacing={12} modifiers={[frame({ maxWidth: Infinity }), disable(disabled)]}>
      {(['restMin', 'restMax'] as const).map(field => <VStack key={field} modifiers={[frame({ maxWidth: Infinity })]}>
        <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(colors.textMuted)]}>{field === 'restMin' ? 'MÍNIMO' : 'MÁXIMO'}</Text>
        <Picker label={field === 'restMin' ? 'Descanso mínimo' : 'Descanso máximo'} modifiers={[pickerStyle('wheel'), frame({ maxWidth: Infinity })]}
          selection={parseRest(draft[field], 'Descanso') ?? -1} onSelectionChange={(value: number) => onChange(changeRest(draft, field, value === -1 ? null : value))}>
          {restWheelChoices(draft, field).map(value => <Text key={value ?? 'empty'} modifiers={[tag(value ?? -1), monospacedDigit(), foregroundStyle(colors.text)]}>{value === null ? 'Sin descanso' : formatRest(value)}</Text>)}
        </Picker>
      </VStack>)}
    </HStack>
  </Host>;
}
