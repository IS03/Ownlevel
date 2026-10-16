import { SegmentedControl, type SelectionOption } from '@/design-system';
export type SettingsSegmentedProps<T extends string> = {
  accessibilityLabel: string;
  value: T;
  options: readonly SelectionOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
};
export function SettingsSegmented<T extends string>(props: SettingsSegmentedProps<T>) {
  return <SegmentedControl {...props} />;
}
