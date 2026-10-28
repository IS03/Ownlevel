import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, controlSize, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { ExerciseSegmentedProps } from './exercise-segmented';
/** Native segmented picker: the selection slides with the system animation. */
export function ExerciseSegmented<T extends string>({ accessibilityLabel: label, value, options, onChange }: ExerciseSegmentedProps<T>) {
  const { isDark } = useOwnlevelTheme();
  // Inside scroll views the host must ignore the bars' safe area: mounted under the tab bar or the home indicator,
  // SwiftUI otherwise draws the control shifted up over the content above (e.g. «Desglose» in Progreso).
  return <Host colorScheme={isDark ? 'dark' : 'light'} ignoreSafeArea="all" matchContents={{ vertical: true }} style={{ width: '100%' }}>
    <Picker selection={value} onSelectionChange={next => { if (next !== value) onChange(next as T); }} modifiers={[pickerStyle('segmented'), controlSize('large'), accessibilityLabel(label)]}>
      {options.map(option => <Text key={option.value} modifiers={[tag(option.value)]}>{option.label}</Text>)}
    </Picker>
  </Host>;
}
