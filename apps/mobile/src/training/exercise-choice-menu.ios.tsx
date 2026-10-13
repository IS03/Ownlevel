import { Button, HStack, Host, Image, Menu, Spacer, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled, font, foregroundStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { brandTokens, useOwnlevelTheme } from '@/design-system';
import type { ExerciseChoiceProps } from './exercise-choice-menu';
/** Settings-style row: only the value is the menu label, so the glass morph never carries the title. */
export function ExerciseChoiceMenu({ title, value, options, disabled: blocked, onChange }: ExerciseChoiceProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const label = options.find(option => option.value === value)?.label ?? value;
  return <Host colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ width: '100%', height: brandTokens.layout.inputHeight }}>
    <HStack spacing={8} modifiers={[frame({ maxWidth: Infinity, height: brandTokens.layout.inputHeight })]}>
      <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(colors.text)]}>{title}</Text>
      {/* The label fills the row, trailing-aligned: a new value never resizes the menu, so it can't slide. */}
      <Menu modifiers={[accessibilityLabel(`${title}: ${label}`), disabled(blocked)]} label={<HStack spacing={6} modifiers={[frame({ maxWidth: Infinity, alignment: 'trailing' })]}>
        <Spacer minLength={0} /><Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(colors.textMuted)]}>{label}</Text><Image systemName="chevron.up.chevron.down" color={colors.textMuted} size={15} />
      </HStack>}>
        {options.map(option => <Button key={option.value} label={option.label} systemImage={value === option.value ? 'checkmark' : undefined} onPress={() => onChange(option.value)} />)}
      </Menu>
    </HStack>
  </Host>;
}
