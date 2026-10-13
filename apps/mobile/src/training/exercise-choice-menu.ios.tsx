import { Button, HStack, Host, Image, Menu, Spacer, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled, font, foregroundStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { brandTokens, useOwnlevelTheme } from '@/design-system';
import type { ExerciseChoiceProps } from './exercise-choice-menu';
export function ExerciseChoiceMenu({ title, value, options, disabled: blocked, onChange }: ExerciseChoiceProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const label = options.find(option => option.value === value)?.label ?? value;
  return <Host colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ width: '100%', height: brandTokens.layout.inputHeight }}>
    <Menu modifiers={[accessibilityLabel(`${title}: ${label}`), disabled(blocked), frame({ maxWidth: Infinity, height: brandTokens.layout.inputHeight, alignment: 'leading' })]} label={<HStack spacing={8} modifiers={[frame({ maxWidth: Infinity, height: brandTokens.layout.inputHeight, alignment: 'leading' })]}>
      <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(colors.text)]}>{title}</Text><Spacer />
      <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(colors.textMuted)]}>{label}</Text><Image systemName="chevron.up.chevron.down" color={colors.textMuted} size={17} />
    </HStack>}>
      {options.map(option => <Button key={option.value} label={option.label} systemImage={value === option.value ? 'checkmark' : undefined} onPress={() => onChange(option.value)} />)}
    </Menu>
  </Host>;
}
