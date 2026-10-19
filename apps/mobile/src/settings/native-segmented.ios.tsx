import { Host, Picker, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  controlSize,
  disabled as nativeDisabled,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { SettingsSegmentedProps } from './native-segmented';
export function SettingsSegmented<T extends string>({
  accessibilityLabel: label,
  value,
  options,
  onChange,
  disabled = false,
}: SettingsSegmentedProps<T>) {
  const { isDark } = useOwnlevelTheme();
  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      matchContents={{ vertical: true }}
      // Inside a scroll view the hosting view otherwise applies the bars' safe area to its content, drawing the control
      // away from the space React Native reserved for it (it changed with the scroll position).
      ignoreSafeArea="all"
      style={{ width: '100%' }}
    >
      <Picker
        selection={value}
        onSelectionChange={(next) => {
          if (!disabled && next !== value) onChange(next as T);
        }}
        modifiers={[
          pickerStyle('segmented'),
          controlSize('large'),
          accessibilityLabel(label),
          nativeDisabled(disabled),
        ]}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
