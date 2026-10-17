import { requireNativeView } from 'expo';
import type { KeyboardSheetMotionProps } from './keyboard-sheet-motion';

const NativeMotion = requireNativeView<KeyboardSheetMotionProps>('OwnlevelKeyboardSheet', 'KeyboardSheetView');

export function KeyboardSheetMotion(props: KeyboardSheetMotionProps) {
  return <NativeMotion {...props} />;
}
