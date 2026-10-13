import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RoutineDetail } from '@/api/routine-editor';
import { AppIcon, AppText, spacing, useOwnlevelTheme } from '@/design-system';
import { exerciseIdentity } from './routine-editor-model';
import { NativeDragHandle, NativeReorderItem, NativeReorderList, NativeSwipeActions } from './session-native-interactions';

type Props = { items: RoutineDetail['items']; disabled: boolean; onOpen: (id: string) => void; onRemove: (id: string) => void;
  onCommit: (ids: string[]) => void; onDragging: (value: boolean) => void };

/** Same UI-thread reorder as the active session: hold to lift, swipe to remove, tap to open. */
export function RoutineExerciseList({ items, disabled, onOpen, onRemove, onCommit, onDragging }: Props) {
  const { colors } = useOwnlevelTheme();
  const [dragging, setDragging] = useState(false);
  const ids = items.map(item => item.routineExerciseId);
  const drag = (value: boolean) => { setDragging(value); onDragging(value); };
  const move = (id: string, offset: number) => {
    if (disabled || dragging) return;
    const next = [...ids], index = next.indexOf(id), target = index + offset;
    if (index < 0 || target < 0 || target >= next.length) return;
    next.splice(index, 1); next.splice(target, 0, id); onCommit(next);
  };
  return <View testID="routine-exercise-list">
    <NativeReorderList ids={ids} onLift={() => { if (disabled) return false; drag(true); return true; }} onCancel={() => drag(false)}
      onDrop={async next => { drag(false); if (next.join('|') !== ids.join('|')) onCommit(next); return true; }}>
      {items.map((item, index) => {
        const id = item.routineExerciseId, identity = exerciseIdentity(item.exercise);
        return <NativeReorderItem key={id} id={id} gap={0}>
          <NativeSwipeActions backgroundColor={colors.background} label={item.exercise.name} disabled={disabled || dragging}
            actions={[{ label: 'Quitar', destructive: true, onPress: () => onRemove(id) }]}>
            <NativeDragHandle testID={`exercise-row-${id}`} disabled={disabled} onTap={() => onOpen(id)} accessibilityRole="button"
              accessibilityLabel={`Editar ${item.exercise.name}`} accessibilityHint="Tocá para editar. Mantené apretado y arrastrá para mover."
              accessibilityActions={[...(index > 0 ? [{ name: 'moveUp', label: 'Mover arriba' }] : []), ...(index < items.length - 1 ? [{ name: 'moveDown', label: 'Mover abajo' }] : []), { name: 'remove', label: 'Quitar de la rutina' }]}
              onAccessibilityAction={event => { if (disabled) return; const action = event.nativeEvent.actionName; if (action === 'moveUp') move(id, -1); else if (action === 'moveDown') move(id, 1); else if (action === 'remove') onRemove(id); }}
              style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background }]}>
              <AppText muted numeric style={styles.ordinal} variant="footnote">{index + 1}</AppText>
              <View style={styles.copy}><AppText variant="headline">{item.exercise.name}</AppText>
                {identity ? <AppText muted variant="footnote">{identity}</AppText> : null}
                {!item.exercise.isActive ? <AppText muted variant="footnote">Ejercicio archivado</AppText> : null}</View>
              <AppText muted numeric variant="subheadline">{item.targets.sets.length} {item.targets.sets.length === 1 ? 'serie' : 'series'}</AppText>
              <AppIcon name="chevronRight" color={colors.textMuted} size={20} />
            </NativeDragHandle>
          </NativeSwipeActions>
        </NativeReorderItem>;
      })}
    </NativeReorderList>
  </View>;
}
const styles = StyleSheet.create({
  row: { minHeight: 76, alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.lg },
  ordinal: { width: 20, textAlign: 'center' }, copy: { flex: 1, gap: spacing.xs },
});
