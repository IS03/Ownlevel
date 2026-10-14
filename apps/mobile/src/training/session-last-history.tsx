import { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { QuickSessionHistoryDto } from '@/api/active-session';
import { AppText, Button, Surface, brandTokens, spacing } from '@/design-system';
import { historyLoadLabel, historySetLabel, quickHistoryDate } from './active-session-model';
/** Swipe either way past the threshold and the card slides off and dismisses itself; no button to tap. */
export function SessionLastHistory({ history, disabled, onUse, onDismiss }: { history: QuickSessionHistoryDto; disabled: boolean; onUse: () => void; onDismiss: () => void }) {
  const completed = history.sets.filter(set => set.isCompleted);
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const pan = useMemo(() => Gesture.Pan().enabled(!disabled).activeOffsetX([-12, 12]).failOffsetY([-10, 10])
    .onUpdate(event => { x.set(event.translationX); })
    .onEnd(event => {
      if (Math.abs(event.translationX) > width * 0.3 || Math.abs(event.velocityX) > 800) {
        const sign = (event.translationX || event.velocityX) < 0 ? -1 : 1;
        x.set(withTiming(sign * width, { duration: brandTokens.motion.duration.fast }, done => { if (done) runOnJS(onDismiss)(); }));
      } else x.set(withSpring(0, brandTokens.motion.spring));
    }), [disabled, width, x, onDismiss]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], opacity: 1 - Math.min(0.6, Math.abs(x.value) / width) }));
  return <GestureDetector gesture={pan}><Animated.View style={style}>
    <Surface><View accessible accessibilityLabel={`La última vez, ${quickHistoryDate(history.logDate)}, ${history.routineName}, ${completed.map(historySetLabel).join("; ")}`} accessibilityActions={disabled ? [] : [{ name: 'dismiss', label: 'Descartar' }, { name: 'use', label: 'Usar' }]}
      onAccessibilityAction={event => { if (!disabled) { if (event.nativeEvent.actionName === 'dismiss') onDismiss(); else if (event.nativeEvent.actionName === 'use') onUse(); } }} style={styles.row}>
      <View style={{ flex: 1 }}><AppText muted numeric variant="footnote">La última vez · {quickHistoryDate(history.logDate)} · {history.routineName}</AppText><AppText numeric variant="headline">{completed.map(historyLoadLabel).join(' · ')}</AppText></View>
      <Button label="Usar" variant="quiet" disabled={disabled} onPress={onUse} />
    </View></Surface>
  </Animated.View></GestureDetector>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' } });
