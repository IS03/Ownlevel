import { SegmentedControl, type SelectionOption } from '@/design-system';
export type ExerciseSegmentedProps<T extends string> = { accessibilityLabel: string; value: T; options: readonly SelectionOption<T>[]; onChange: (value: T) => void };
/** Android/Web fallback: the brand segmented control. iOS uses the native one (Liquid Glass on 26). */
export function ExerciseSegmented<T extends string>(props: ExerciseSegmentedProps<T>) {
  return <SegmentedControl {...props} />;
}
