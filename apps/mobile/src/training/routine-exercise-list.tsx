import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ReduceMotion } from 'react-native-reanimated';
import type { RoutineDetail } from '@/api/routine-editor';
import { AppIcon, AppText, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { palette } from '@/design-system/brand';
import { exerciseIdentity } from './routine-editor-model';
import { routineOrderAtTop } from './routine-order-list';

type Props = { items: RoutineDetail['items']; disabled: boolean; onOpen: (id: string) => void; onRemove: (id: string) => void;
  onCommit: (ids: string[]) => void; onDragging: (value: boolean) => void; scrollAtEdge: (pointer: number) => number };
type Drag = { id: string; original: string[]; top: number; dy: number; scroll: number; pointer: number };
function topOf(ids: string[], heights: Record<string, number>, id: string) { let top = 0; for (const key of ids) { if (key === id) break; top += heights[key] ?? 76; } return top; }
export function RoutineExerciseList(props: Props) {
  const { colors } = useOwnlevelTheme();
  const latest = useRef(props); useLayoutEffect(() => { latest.current = props; });
  const [mountIds] = useState(() => props.items.map(item => item.routineExerciseId));
  const [order, setOrder] = useState(mountIds), orderRef = useRef(order), heights = useRef<Record<string, number>>({});
  const [measuredHeights, setHeights] = useState<Record<string, number>>({});
  const drag = useRef<Drag | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lifted, setLifted] = useState<{ id: string; top: number } | null>(null);
  const callbacks = useMemo(() => {
    const move = () => {
      const current = drag.current; if (!current) return;
      const top = current.top + current.dy + current.scroll;
      const ids = routineOrderAtTop(orderRef.current, heights.current, current.id, top);
      orderRef.current = ids; setOrder(ids); setLifted({ id: current.id, top });
    };
    return {
      begin: (id: string, pointer: number) => {
        if (latest.current.disabled || drag.current) return;
        drag.current = { id, pointer, original: [...orderRef.current], top: topOf(orderRef.current, heights.current, id), dy: 0, scroll: 0 };
        setLifted({ id, top: drag.current.top }); latest.current.onDragging(true);
        timer.current = setInterval(() => { const current = drag.current; if (!current) return; const delta = latest.current.scrollAtEdge(current.pointer); if (delta) { current.scroll += delta; move(); } }, 16);
      },
      move: (id: string, dy: number, pointer: number) => { if (drag.current?.id !== id) return; drag.current.dy = dy; drag.current.pointer = pointer; move(); },
      finish: (id: string, success: boolean) => {
        const current = drag.current; if (!current || current.id !== id) return;
        if (timer.current) { clearInterval(timer.current); timer.current = null; }
        drag.current = null;
        if (success && orderRef.current.join('|') !== current.original.join('|')) latest.current.onCommit(orderRef.current);
        else { orderRef.current = current.original; setOrder(current.original); }
        setLifted(null); latest.current.onDragging(false);
      },
      accessibleMove: (id: string, offset: number) => {
        if (latest.current.disabled || drag.current) return;
        const ids = [...orderRef.current], index = ids.indexOf(id), target = index + offset;
        if (index < 0 || target < 0 || target >= ids.length) return;
        ids.splice(index, 1); ids.splice(target, 0, id); orderRef.current = ids; setOrder(ids); latest.current.onCommit(ids);
      },
    };
  }, []);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  return <View testID="routine-exercise-list">
    {mountIds.map(id => {
      const item = props.items.find(candidate => candidate.routineExerciseId === id); if (!item) return null;
      const index = order.indexOf(id), translation = (lifted?.id === id ? lifted.top : topOf(order, measuredHeights, id)) - topOf(mountIds, measuredHeights, id);
      return <View key={id} onLayout={event => { const height = event.nativeEvent.layout.height; if (height > 0) { heights.current[id] = height; setHeights(old => old[id] === height ? old : { ...old, [id]: height }); } }}
        style={[{ transform: [{ translateY: translation }], zIndex: lifted?.id === id ? 10 : 0, backgroundColor: lifted?.id === id ? colors.surface : colors.background }, lifted?.id === id && styles.lift]}>
        <ExerciseRow lifted={lifted?.id === id} callbacks={callbacks} disabled={props.disabled} dragging={Boolean(lifted)} item={item} index={index} count={order.length} onOpen={props.onOpen} onRemove={props.onRemove} />
      </View>;
    })}
  </View>;
}
function ExerciseRow({ callbacks, disabled, dragging, lifted, item, index, count, onOpen, onRemove }: {
  callbacks: { begin: (id: string, y: number) => void; move: (id: string, dy: number, y: number) => void; finish: (id: string, success: boolean) => void; accessibleMove: (id: string, offset: number) => void };
  disabled: boolean; dragging: boolean; lifted: boolean; item: RoutineDetail['items'][number]; index: number; count: number; onOpen: (id: string) => void; onRemove: (id: string) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const id = item.routineExerciseId;
  const swipe = useRef<SwipeableMethods>(null);
  useEffect(() => { if (dragging) swipe.current?.reset(); }, [dragging]);
  const pan = useMemo(() => Gesture.Pan().enabled(!disabled).activateAfterLongPress(350).runOnJS(true).withTestId(`exercise-drag-${id}`)
    .onStart(event => callbacks.begin(id, event.absoluteY)).onUpdate(event => callbacks.move(id, event.translationY, event.absoluteY))
    .onFinalize((_event, success) => callbacks.finish(id, success)), [callbacks, disabled, id]);
  return <GestureDetector gesture={pan}>
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <Swipeable ref={swipe} containerStyle={{ borderRadius: lifted ? radius.inner : 0 }} enabled={!disabled && !dragging} overshootRight={false} childrenContainerStyle={{ backgroundColor: lifted ? colors.surface : colors.background }}
        animationOptions={{ ...brandTokens.motion.spring, reduceMotion: ReduceMotion.System }}
        renderRightActions={() => <Pressable accessibilityLabel={`Quitar ${item.exercise.name}`} accessibilityRole="button" disabled={disabled || dragging}
          onPress={() => onRemove(id)} style={[styles.remove, { backgroundColor: colors.danger }]}><AppIcon name="trash" color={colors.onPrimary} size={20} /><AppText variant="footnote" style={{ color: colors.onPrimary }}>Quitar</AppText></Pressable>}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${item.exercise.name}`} accessibilityState={{ disabled }} disabled={disabled} onPress={() => { if (!dragging) onOpen(id); }}
          onLongPress={() => swipe.current?.reset()} delayLongPress={350} accessibilityHint="Tocá para editar. Mantené apretado y arrastrá para mover."
          accessibilityActions={[...(index > 0 ? [{ name: 'moveUp', label: 'Mover arriba' }] : []), ...(index < count - 1 ? [{ name: 'moveDown', label: 'Mover abajo' }] : []), { name: 'remove', label: 'Quitar de la rutina' }]}
          onAccessibilityAction={event => { if (disabled) return; const action = event.nativeEvent.actionName; if (action === 'moveUp') callbacks.accessibleMove(id, -1); else if (action === 'moveDown') callbacks.accessibleMove(id, 1); else if (action === 'remove') onRemove(id); }}
          style={styles.row}>
          <AppText muted numeric style={styles.ordinal} variant="footnote">{index + 1}</AppText>
          <View style={styles.copy}><AppText variant="headline">{item.exercise.name}</AppText>
            {exerciseIdentity(item.exercise) ? <AppText muted variant="footnote">{exerciseIdentity(item.exercise)}</AppText> : null}
            {!item.exercise.isActive ? <AppText muted variant="footnote">Ejercicio archivado</AppText> : null}</View>
          <AppText muted numeric variant="subheadline">{item.targets.sets.length} {item.targets.sets.length === 1 ? 'serie' : 'series'}</AppText>
          <AppIcon name="chevronRight" color={colors.textMuted} size={20} />
        </Pressable>
      </Swipeable>
    </View>
  </GestureDetector>;
}
const styles = StyleSheet.create({ row: { minHeight: 76, alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.lg }, ordinal: { width: 20, textAlign: 'center' }, copy: { flex: 1, gap: spacing.xs }, remove: { minWidth: 88, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md }, lift: { borderRadius: radius.inner, elevation: 8, shadowColor: palette.dark.bg, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 8 } });
