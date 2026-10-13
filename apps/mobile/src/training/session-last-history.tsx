import { View, StyleSheet } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { QuickSessionHistoryDto } from '@/api/active-session';
import { AppText, Button, Surface, spacing } from '@/design-system';
import { historyLoadLabel, historySetLabel, quickHistoryDate } from './active-session-model';
export function SessionLastHistory({ history, disabled, onUse, onDismiss }: { history: QuickSessionHistoryDto; disabled: boolean; onUse: () => void; onDismiss: () => void }) {
  const completed = history.sets.filter(set => set.isCompleted);
  const dismiss = <Button label="Descartar" variant="quiet" disabled={disabled} onPress={onDismiss} />;
  return <Swipeable enabled={!disabled} overshootLeft={false} overshootRight={false} renderLeftActions={() => dismiss} renderRightActions={() => dismiss} onSwipeableOpen={onDismiss}>
    <Surface><View accessible accessibilityLabel={`La última vez, ${quickHistoryDate(history.logDate)}, ${history.routineName}, ${completed.map(historySetLabel).join("; ")}`} accessibilityActions={disabled ? [] : [{ name: 'dismiss', label: 'Descartar' }, { name: 'use', label: 'Usar' }]}
      onAccessibilityAction={event => { if (!disabled) { if (event.nativeEvent.actionName === 'dismiss') onDismiss(); else if (event.nativeEvent.actionName === 'use') onUse(); } }} style={styles.row}>
      <View style={{ flex: 1 }}><AppText muted numeric variant="footnote">La última vez · {quickHistoryDate(history.logDate)} · {history.routineName}</AppText><AppText numeric variant="headline">{completed.map(historyLoadLabel).join(' · ')}</AppText></View>
      <Button label="Usar" variant="quiet" disabled={disabled} onPress={onUse} />
    </View></Surface>
  </Swipeable>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' } });
