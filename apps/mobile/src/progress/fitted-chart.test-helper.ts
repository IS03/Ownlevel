import type { ReactTestInstance } from 'react-test-renderer';
import { fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
/** Tap the rendered date coordinate on the plot's real interaction surface. */
export function pressFittedMark(mark: ReactTestInstance) {
  let plot = mark.parent;
  while (plot && !String(plot.props.testID ?? '').endsWith('-plot')) plot = plot.parent;
  if (!plot) throw new Error('Mark has no fitted plot');
  const style = StyleSheet.flatten(mark.props.style);
  fireEvent.press(plot, {nativeEvent:{locationX:style.left + style.width / 2}});
}
