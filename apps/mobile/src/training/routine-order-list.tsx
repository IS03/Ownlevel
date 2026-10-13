import { StyleSheet, View } from 'react-native';
import type { MobileTrainingRoutine } from '@/api/routines';
import { AppIcon, AppText, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { routineMetadata } from './routine-row';
import { trainingRoutineColor } from './routine-colors';
import { NativeDragHandle, NativeReorderItem, NativeReorderList } from './session-native-interactions';

const FALLBACK_HEIGHT = 76;
export function routineOrderAtTop(ids: readonly string[], heights: Record<string, number>, id: string, top: number): string[] {
  if (!ids.includes(id)) return [...ids];
  const remaining = ids.filter(key => key !== id);
  let index = 0, offset = 0;
  for (const key of remaining) {
    const height = heights[key] ?? FALLBACK_HEIGHT;
    if (top > offset + height / 2) index++;
    offset += height;
  }
  remaining.splice(index, 0, id);
  return remaining;
}
type Props = {
  routines: MobileTrainingRoutine[]; ids: string[]; disabled: boolean;
  onChange: (ids: string[]) => void; onDragging: (dragging: boolean) => void;
};

/** Same UI-thread reorder as the active session: slots, lift and edge scroll never wait on React. */
export function RoutineOrderList({ routines, ids, disabled, onChange, onDragging }: Props) {
  const { colors, isDark } = useOwnlevelTheme();
  const move = (id: string, direction: number) => {
    if (disabled) return;
    const next = [...ids], index = next.indexOf(id), target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    next.splice(index, 1); next.splice(target, 0, id); onChange(next);
  };
  return <View testID="routine-order-list">
    <NativeReorderList ids={ids} onLift={() => { if (disabled) return false; onDragging(true); return true; }}
      onDrop={async next => { onChange(next); onDragging(false); return true; }} onCancel={() => onDragging(false)}>
      {ids.map((id, index) => {
        const routine = routines.find(row => row.id === id);
        if (!routine) return null;
        return <NativeReorderItem key={id} id={id} gap={0}>
          <View testID={`order-row-${id}`} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderTopWidth: index ? StyleSheet.hairlineWidth : 0 }]}>
            {routine.color ? <View style={[styles.strip, { backgroundColor: trainingRoutineColor(routine.color, isDark) }]} /> : null}
            <View style={styles.copy}><AppText numberOfLines={2} variant="headline">{routine.name}</AppText>
              <AppText muted numeric variant="subheadline">{routineMetadata(routine)}</AppText></View>
            <NativeDragHandle testID={`order-drag-${id}`} holdDelay={120} disabled={disabled} accessibilityLabel={`Ordenar ${routine.name}`} accessibilityRole="adjustable"
              accessibilityValue={{ min: 1, max: ids.length, now: index + 1 }} accessibilityHint="Mantené y arrastrá la manija, o usá las acciones para mover la rutina."
              accessibilityActions={[{ name: 'increment', label: 'Mover abajo' }, { name: 'decrement', label: 'Mover arriba' }]}
              onAccessibilityAction={event => { const action = event.nativeEvent.actionName; if (action === 'increment') move(id, 1); else if (action === 'decrement') move(id, -1); }}
              style={styles.handle}>
              <AppIcon color={colors.textMuted} name="dragHandle" size={20} />
            </NativeDragHandle>
          </View>
        </NativeReorderItem>;
      })}
    </NativeReorderList>
  </View>;
}
const styles = StyleSheet.create({
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  handle: { alignItems: 'center', justifyContent: 'center', height: 48, width: 48 },
  row: { alignItems: 'center', borderRadius: radius.inner, flexDirection: 'row', gap: spacing.md, minHeight: FALLBACK_HEIGHT, padding: brandTokens.layout.cardPadding },
  strip: { borderRadius: radius.full, height: brandTokens.layout.rowHeight, width: 4 },
});
