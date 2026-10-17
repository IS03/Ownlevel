import { View, type ViewProps } from 'react-native';

export type KeyboardSheetMotionProps = ViewProps & {
  sheetHeight: number;
  bottomInset: number;
  presented: boolean;
  closing: boolean;
  reduceMotion: boolean;
  onClosed: () => void;
};

/** Only iOS numeric metric forms opt into native keyboard motion. */
export function KeyboardSheetMotion({ children, style }: KeyboardSheetMotionProps) {
  return <View style={style}>{children}</View>;
}
