import type { ReactTestInstance } from 'react-test-renderer';
import { fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
/** Tap the rendered date coordinate on the plot's real interaction surface. */
export function pressFittedMark(mark: ReactTestInstance) {
  let plot = mark.parent;
  while (plot && !String(plot.props.testID ?? '').endsWith('-plot')) plot = plot.parent;
  if (!plot) throw new Error('Mark has no fitted plot');
  const style = StyleSheet.flatten(mark.props.style);
  const marks = plot.findAll(n => typeof n.type === 'string' && n.props.accessibilityState?.selected !== undefined && n.props.testID);
  // Some legacy fixtures include observations outside their declared window. They overlap
  // at the boundary; VoiceOver still exposes each observation independently.
  const overlapping = marks.filter(n => StyleSheet.flatten(n.props.style)?.left === style.left);
  if (overlapping.length > 1) {
    const target = marks.findIndex(n => n.props.testID === mark.props.testID);
    const current = marks.findIndex(n => n.props.accessibilityState.selected);
    const delta = target - current;
    for (let i = 0; i < Math.abs(delta); i++) fireEvent(plot, 'accessibilityAction', {nativeEvent:{actionName:delta > 0?'increment':'decrement'}});
    return;
  }
  fireEvent.press(plot, {nativeEvent:{locationX:style.left + style.width / 2}});
}
