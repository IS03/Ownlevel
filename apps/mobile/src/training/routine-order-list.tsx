import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { MobileTrainingRoutine } from '@/api/routines';
import { AppIcon, AppText, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { palette } from '@/design-system/brand';
import { routineMetadata } from './routine-row';
import { trainingRoutineColor } from './routine-colors';

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
function topOf(ids: readonly string[], heights: Record<string, number>, id: string) {
  let top = 0;
  for (const key of ids) { if (key === id) break; top += heights[key] ?? FALLBACK_HEIGHT; }
  return top;
}

type Props = {
  routines: MobileTrainingRoutine[]; ids: string[]; disabled: boolean;
  onChange: (ids: string[]) => void; onDragging: (dragging: boolean) => void;
  scrollAtEdge: (absoluteY: number) => number;
};
type Drag = { id: string; original: string[]; top: number; dy: number; scroll: number; pointer: number };

/** Fixed native children + JS slot positions keep the active gesture mounted while rows move. */
export function RoutineOrderList(props: Props) {
  const { colors, isDark } = useOwnlevelTheme();
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const [mountIds] = useState(props.ids);
  const heights = useRef<Record<string, number>>({});
  const [layoutHeights, setLayoutHeights] = useState<Record<string, number>>({});
  const ids = useRef(props.ids);
  useLayoutEffect(() => { ids.current = props.ids; }, [props.ids]);
  const drag = useRef<Drag | null>(null);
  const [lifted, setLifted] = useState<{ id: string; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbacks = useMemo(() => {
    const move = () => {
      const current = drag.current;
      if (!current) return;
      const top = current.top + current.dy + current.scroll;
      const next = routineOrderAtTop(ids.current, heights.current, current.id, top);
      if (next.join('|') !== ids.current.join('|')) { ids.current = next; latest.current.onChange(next); }
      setLifted({ id: current.id, top });
    };
    const finish = (id: string, success: boolean) => {
      if (drag.current?.id !== id) return;
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      const current = drag.current;
      if (!current) return;
      if (!success) { ids.current = current.original; latest.current.onChange(current.original); }
      drag.current = null; setLifted(null); latest.current.onDragging(false);
    };
    return {
      begin: (id: string, absoluteY: number) => {
        if (latest.current.disabled || drag.current) return;
        drag.current = { id, original: [...ids.current], top: topOf(ids.current, heights.current, id), dy: 0, scroll: 0, pointer: absoluteY };
        setLifted({ id, top: drag.current.top }); latest.current.onDragging(true);
        timer.current = setInterval(() => {
          const current = drag.current;
          if (!current) return;
          const delta = latest.current.scrollAtEdge(current.pointer);
          if (delta) { current.scroll += delta; move(); }
        }, 16);
      },
      move: (id: string, dy: number, absoluteY: number) => {
        if (drag.current?.id !== id) return;
        drag.current.dy = dy; drag.current.pointer = absoluteY; move();
      },
      finish,
      accessibleMove: (id: string, direction: number) => {
        if (latest.current.disabled || drag.current) return;
        const next = [...ids.current], index = next.indexOf(id), target = index + direction;
        if (index < 0 || target < 0 || target >= next.length) return;
        next.splice(index, 1); next.splice(target, 0, id); ids.current = next; latest.current.onChange(next);
      },
    };
  }, []);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const measured = (id: string, height: number) => { if (height > 0) { heights.current[id] = height; setLayoutHeights(previous => previous[id] === height ? previous : { ...previous, [id]: height }); } };
  return <View testID="routine-order-list">
    {mountIds.map(id => {
      const routine = props.routines.find(row => row.id === id);
      if (!routine) return null;
      const translation = (lifted?.id === id ? lifted.top : topOf(props.ids, layoutHeights, id)) - topOf(mountIds, layoutHeights, id);
      const index = props.ids.indexOf(id);
      return <View key={id} onLayout={event => measured(id, event.nativeEvent.layout.height)} testID={`order-row-${id}`}
        style={[{ transform: [{ translateY: translation }], zIndex: lifted?.id === id ? 10 : 0 }, lifted?.id === id && styles.lift]}>
        <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderTopWidth: index ? StyleSheet.hairlineWidth : 0 }]}>
          {routine.color ? <View style={[styles.strip, { backgroundColor: trainingRoutineColor(routine.color, isDark) }]} /> : null}
          <View style={styles.copy}><AppText numberOfLines={2} variant="headline">{routine.name}</AppText>
            <AppText muted numeric variant="subheadline">{routineMetadata(routine)}</AppText></View>
          <OrderHandle disabled={props.disabled} id={id} name={routine.name} index={index} count={props.ids.length} callbacks={callbacks} />
        </View>
      </View>;
    })}
  </View>;
}
function OrderHandle({ disabled, id, name, index, count, callbacks }: {
  disabled: boolean; id: string; name: string; index: number; count: number;
  callbacks: { begin: (id: string, y: number) => void; move: (id: string, dy: number, y: number) => void;
    finish: (id: string, success: boolean) => void; accessibleMove: (id: string, direction: number) => void };
}) {
  const { colors } = useOwnlevelTheme();
  const gesture = useMemo(() => Gesture.Pan().withTestId(`order-drag-${id}`).enabled(!disabled).minDistance(2).runOnJS(true)
    .onStart(event => callbacks.begin(id, event.absoluteY))
    .onUpdate(event => callbacks.move(id, event.translationY, event.absoluteY))
    .onFinalize((_event, success) => callbacks.finish(id, success)), [callbacks, disabled, id]);
  return <GestureDetector gesture={gesture}><View accessible accessibilityLabel={`Ordenar ${name}`} accessibilityRole="adjustable"
    accessibilityState={{ disabled }} accessibilityValue={{ min: 1, max: count, now: index + 1 }}
    accessibilityHint="Arrastrá la manija o usá las acciones para mover la rutina."
    accessibilityActions={[{ name: 'increment', label: 'Mover abajo' }, { name: 'decrement', label: 'Mover arriba' }]}
    onAccessibilityAction={event => { const action = event.nativeEvent.actionName; if (action === 'increment') callbacks.accessibleMove(id, 1); else if (action === 'decrement') callbacks.accessibleMove(id, -1); }} style={styles.handle}>
    <AppIcon color={colors.textMuted} name="dragHandle" size={20} />
  </View></GestureDetector>;
}
const styles = StyleSheet.create({
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  handle: { alignItems: 'center', justifyContent: 'center', height: 48, width: 48 },
  lift: { elevation: 8, shadowColor: palette.dark.bg, shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.16, shadowRadius: 8 },
  row: { alignItems: 'center', borderRadius: radius.inner, flexDirection: 'row', gap: spacing.md, minHeight: FALLBACK_HEIGHT, padding: brandTokens.layout.cardPadding },
  strip: { borderRadius: radius.full, height: brandTokens.layout.rowHeight, width: 4 },
});
