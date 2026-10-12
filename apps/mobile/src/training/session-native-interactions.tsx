import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import Animated, { measure, runOnJS, scrollTo, useAnimatedStyle, useFrameCallback, useSharedValue, withSpring, withTiming,
  type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import { AppText, radius, sizes, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';

export const DRAG_DELAY = 400;
export const PRESS_SCALE = 0.985;
export const LIFT_SCALE = 1.018;
const spring = { damping: 24, stiffness: 300, mass: 0.7 };
type DragScroll = { ref: AnimatedRef<Animated.ScrollView>; y: SharedValue<number>; contentHeight: SharedValue<number>;
  gesture: NativeGesture; owner: SharedValue<string | null> };
type DragScrollState = Omit<DragScroll, 'gesture'>;
export const SessionDragScrollContext = createContext<DragScroll | null>(null);

export function itemTop(ids: readonly string[], heights: Record<string, number>, id: string): number {
  'worklet';
  let top = 0;
  for (const key of ids) { if (key === id) break; top += heights[key] ?? 0; }
  return top;
}
/** iOS can also activate the long-press pan from fast movement before the hold
 * elapses. That touch is a scroll: only a real hold may lift and claim it. */
export function isHoldActivation(pressedAt: number, now: number): boolean {
  'worklet';
  return now - pressedAt >= DRAG_DELAY - 40;
}
/** Gesture-callback clock (UI thread), never read during render. */
function gestureClock(): number {
  'worklet';
  return Date.now();
}
/** Read-modify-write on the UI runtime. A JS-thread `.value` read is
 * synchronous but `.set()` is only scheduled, so a batch of onLayout events
 * (mount, expand/collapse) would overwrite each other and leave items unmeasured. */
export function recordItemHeight(heights: SharedValue<Record<string, number>>, id: string, height: number) {
  heights.modify(current => { 'worklet'; return { ...current, [id]: height }; });
}
export function dragOrder(ids: readonly string[], heights: Record<string, number>, id: string, top: number): string[] {
  'worklet';
  const index = ids.indexOf(id);
  if (index < 0) return [...ids];
  // Insert the dragged HEADER/row top among the remaining slots. Using the
  // expanded card's center would require dragging it far offscreen to move up.
  const remaining = ids.filter(key => key !== id);
  let target = 0, offset = 0;
  for (const key of remaining) {
    const height = heights[key] ?? 0;
    if (top > offset + height / 2) target++;
    offset += height;
  }
  if (target === index) return [...ids];
  const next = [...ids]; next.splice(index, 1); next.splice(target, 0, id); return next;
}
type DragList = {
  order: SharedValue<string[]>; base: SharedValue<string[]>; heights: SharedValue<Record<string, number>>;
  active: SharedValue<string | null>; top: SharedValue<number>; pointer: SharedValue<number>;
  delta: SharedValue<number>; origin: SharedValue<number>; scrollStart: SharedValue<number>; settling: SharedValue<boolean>;
  scroll: DragScrollState | null; lift: (id: string) => void; finish: (ids: string[], success: boolean) => void;
};
const ListContext = createContext<DragList | null>(null);
type DragItem = { list: DragList; id: string; scale: SharedValue<number> };
const ItemContext = createContext<DragItem | null>(null);

/** Layout stays in React; only transforms, slot order and edge scrolling run per frame. */
export function NativeReorderList({ ids, children, onLift, onDrop, onCancel }: {
  ids: string[]; children: ReactNode; onLift: (id: string) => boolean;
  onDrop: (ids: string[]) => Promise<boolean>; onCancel: () => void;
}) {
  const scrollContext = useContext(SessionDragScrollContext);
  // Worklets only capture refs/shared values, never a JS Gesture instance.
  const scroll = useMemo(() => scrollContext ? { ref: scrollContext.ref, y: scrollContext.y,
    contentHeight: scrollContext.contentHeight, owner: scrollContext.owner } : null, [scrollContext]);
  const [mountOrder, setMountOrder] = useState(ids);
  // Keep native flow order stable across a confirmed reorder: the UI-thread
  // spring changes visual slots, not Yoga origin + transform at the same time.
  // Only membership changes replace/append native children.
  const layoutIds = [...mountOrder.filter(id => ids.includes(id)), ...ids.filter(id => !mountOrder.includes(id))];
  if (layoutIds.join('|') !== mountOrder.join('|')) setMountOrder(layoutIds);
  const order = useSharedValue(ids), base = useSharedValue(ids), heights = useSharedValue<Record<string, number>>({});
  const active = useSharedValue<string | null>(null), top = useSharedValue(0), pointer = useSharedValue(0);
  const delta = useSharedValue(0), origin = useSharedValue(0), scrollStart = useSharedValue(0), settling = useSharedValue(false);
  const current = useRef({ ids, layoutIds, onLift, onDrop, onCancel });
  useLayoutEffect(() => { current.current = { ids, layoutIds, onLift, onDrop, onCancel }; });
  const accepted = useRef(false);
  const signature = ids.join('|');
  const layoutSignature = layoutIds.join('|');
  useLayoutEffect(() => {
    base.set(current.current.layoutIds); order.set(current.current.ids);
  }, [signature, layoutSignature, base, order]);
  useEffect(() => () => {
    if (active.value && scroll?.owner.value === active.value) scroll.owner.set(null);
    if (accepted.current) current.current.onCancel();
  }, [active, scroll]);
  const lift = useCallback((id: string) => {
    accepted.current = current.current.onLift(id);
    if (accepted.current) haptics.selection();
    else { if (scroll?.owner.value === id) scroll.owner.set(null); active.set(null); order.set(current.current.ids); }
  }, [active, order, scroll]);
  const finish = useCallback(async (next: string[], success: boolean) => {
    if (!accepted.current || !success) {
      current.current.onCancel(); order.set(current.current.ids);
    } else {
      try {
        const confirmed = await current.current.onDrop(next);
        if (confirmed) haptics.selection();
        else order.set(current.current.ids);
      } catch { current.current.onCancel(); order.set(current.current.ids); }
    }
    accepted.current = false; settling.set(false);
  }, [order, settling]);
  useFrameCallback(frame => {
    if (!scroll || !active.value) return;
    const bounds = measure(scroll.ref); if (!bounds) return;
    const edge = 60, localY = pointer.value - bounds.pageY;
    const speed = localY < edge ? -240 * Math.min(1, (edge - localY) / edge)
      : localY > bounds.height - edge ? 240 * Math.min(1, (localY - bounds.height + edge) / edge) : 0;
    if (speed) {
      const next = Math.max(0, Math.min(Math.max(0, scroll.contentHeight.value - bounds.height),
        scroll.y.value + speed * Math.min(frame.timeSincePreviousFrame ?? 16, 32) / 1000));
      scroll.y.set(next); scrollTo(scroll.ref, 0, next, false);
    }
    top.set(origin.value + delta.value + scroll.y.value - scrollStart.value);
    order.set(dragOrder(order.value, heights.value, active.value, top.value));
  });
  const value = useMemo(() => ({ order, base, heights, active, top, pointer, delta, origin, scrollStart, settling, scroll, lift, finish }),
    [order, base, heights, active, top, pointer, delta, origin, scrollStart, settling, scroll, lift, finish]);
  const byId = new Map(Children.toArray(children).flatMap(child => isValidElement<{ id: string }>(child) ? [[child.props.id, child] as const] : []));
  // Visibility and content height must NEVER depend on asynchronous onLayout
  // coverage. Yoga lays out visible rows even before any drag measurements.
  return <ListContext.Provider value={value}><View>{layoutIds.map(id => byId.get(id))}</View></ListContext.Provider>;
}
export function NativeReorderItem({ id, children, gap = spacing.sm }: { id: string; children: ReactNode; gap?: number }) {
  const list = useContext(ListContext);
  if (!list) throw new Error('NativeReorderItem requires a list');
  return <ReorderItem list={list} id={id} gap={gap}>{children}</ReorderItem>;
}
function ReorderItem({ list, id, gap, children }: { list: DragList; id: string; gap: number; children: ReactNode }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => {
    const lifted = list.active.value === id;
    const translation = (lifted ? list.top.value : itemTop(list.order.value, list.heights.value, id)) - itemTop(list.base.value, list.heights.value, id);
    return { transform: [{ translateY: lifted ? translation : withSpring(translation, spring) }, { scale: scale.value }],
      zIndex: lifted ? 20 : 0, elevation: lifted ? 8 : 0, shadowOpacity: lifted ? 0.16 : 0,
      opacity: scale.value < 1 ? 0.94 : 1 };
  });
  const value = useMemo(() => ({ list, id, scale }), [list, id, scale]);
  return <ItemContext.Provider value={value}><Animated.View testID={`drag-item-${id}`} style={[styles.item, { paddingBottom: gap }, style]}
    onLayout={event => recordItemHeight(list.heights, id, event.nativeEvent.layout.height)}>
    {children}
  </Animated.View></ItemContext.Provider>;
}
type Swipe = { x: SharedValue<number>; width: SharedValue<number>; disabled: boolean; settled: (open: boolean) => void };
const SwipeContext = createContext<Swipe | null>(null);
export type SwipeAction = { label: string; onPress: () => void; destructive?: boolean; disabled?: boolean };
/** Swipe gestures attach to the non-editable handles/header, never to numeric inputs. */
export function NativeSwipeActions({ actions, disabled, children, label, backgroundColor }: { actions: SwipeAction[]; disabled: boolean; children: ReactNode; label: string; backgroundColor?: string }) {
  const { colors } = useOwnlevelTheme();
  const x = useSharedValue(0), width = actions.length * 76;
  const actionWidth = useSharedValue(width);
  const [open, setOpen] = useState(false);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const value = useMemo(() => ({ x, width: actionWidth, disabled, settled: setOpen }), [x, actionWidth, disabled]);
  useLayoutEffect(() => { actionWidth.set(width); }, [actionWidth, width]);
  useEffect(() => { if (disabled) x.set(withSpring(0, spring, finished => { if (finished) runOnJS(setOpen)(false); })); }, [disabled, x]);
  useEffect(() => { if (x.value < -width) x.set(withSpring(-width, spring)); }, [width, x]);
  return <SwipeContext.Provider value={value}><View style={styles.swipe}>
    <View style={styles.actions} accessibilityElementsHidden={!open || disabled} importantForAccessibility={open && !disabled ? 'auto' : 'no-hide-descendants'}>
      {actions.map(action => <Pressable key={action.label} testID={`swipe-${label}-${action.label}`} accessibilityRole="button"
        accessibilityLabel={`${action.label} · ${label}`} disabled={disabled || action.disabled || !open}
        onPress={() => { x.set(withSpring(0, spring)); setOpen(false); action.onPress(); }}
        style={[styles.action, { backgroundColor: action.destructive ? colors.danger : colors.brandSubtle, opacity: action.disabled ? 0.4 : 1 }]}>
        <AppText variant="caption" style={{ color: action.destructive ? colors.surface : colors.primary, textAlign: 'center' }}>{action.label}</AppText>
      </Pressable>)}
    </View>
    <Animated.View style={[{ backgroundColor: backgroundColor ?? colors.surface }, style]}>{children}</Animated.View>
  </View></SwipeContext.Provider>;
}
export function NativeDragHandle({ disabled, onTap, children, testID, ...props }: ViewProps & { disabled: boolean; onTap?: () => void }) {
  const item = useContext(ItemContext), swipe = useContext(SwipeContext);
  const nativeScrollGesture = useContext(SessionDragScrollContext)?.gesture;
  if (!item) throw new Error('NativeDragHandle requires an item');
  const { list, id, scale } = item;
  const swipeStart = useSharedValue(0), pressedAt = useSharedValue(0);
  const gesture = useMemo(() => {
    const press = () => { 'worklet'; if (!list.active.value) scale.set(withTiming(PRESS_SCALE, { duration: 65 })); };
    const release = () => { 'worklet'; if (list.active.value !== id) scale.set(withSpring(1, spring)); };
    const pan = Gesture.Pan().withTestId(`drag-${testID}`).enabled(!disabled).activateAfterLongPress(DRAG_DELAY).shouldCancelWhenOutside(false)
      .onBegin(() => { pressedAt.set(gestureClock()); press(); }).onStart(event => {
        if (!isHoldActivation(pressedAt.value, gestureClock())) { release(); return; }
        if (list.active.value || list.scroll?.owner.value || list.settling.value || list.base.value.some(key => !list.heights.value[key])) return;
        list.origin.set(itemTop(list.order.value, list.heights.value, id)); list.top.set(list.origin.value);
        list.delta.set(0); list.pointer.set(event.absoluteY); list.scrollStart.set(list.scroll?.y.value ?? 0);
        // Claim scrolling on the UI thread at lift, before the first vertical
        // movement can activate UIScrollView's pan. No JS/render round trip.
        list.scroll?.owner.set(id); list.active.set(id); scale.set(withSpring(LIFT_SCALE, spring)); runOnJS(list.lift)(id);
      }).onUpdate(event => {
        if (list.active.value !== id) return;
        list.pointer.set(event.absoluteY); list.delta.set(event.translationY);
        list.top.set(list.origin.value + event.translationY + (list.scroll?.y.value ?? 0) - list.scrollStart.value);
        list.order.set(dragOrder(list.order.value, list.heights.value, id, list.top.value));
      }).onFinalize((_event, success) => {
        if (list.active.value === id) {
          const next = [...list.order.value]; list.active.set(null); list.settling.set(true);
          if (list.scroll?.owner.value === id) list.scroll.owner.set(null);
          runOnJS(list.finish)(next, success);
        }
        release();
      });
    const tap = Gesture.Tap().withTestId(`tap-${testID}`).enabled(!disabled).maxDuration(DRAG_DELAY - 1).maxDistance(10)
      .onBegin(press).onEnd((_event, success) => { if (success && onTap) runOnJS(onTap)(); }).onFinalize(release);
    const horizontal = Gesture.Pan().withTestId(`swipe-${testID}`).enabled(Boolean(swipe && !swipe.disabled))
      .activeOffsetX([-14, 14]).failOffsetY([-10, 10]).onStart(() => { if (swipe) swipeStart.set(swipe.x.value); release(); })
      .onUpdate(event => { if (swipe) swipe.x.set(Math.max(-swipe.width.value, Math.min(0, swipeStart.value + event.translationX))); })
      .onEnd(() => {
        if (!swipe) return;
        const open = swipe.x.value < -42; swipe.x.set(withSpring(open ? -swipe.width.value : 0, spring)); runOnJS(swipe.settled)(open);
      }).onFinalize((_event, success) => { if (swipe && !success) swipe.x.set(withSpring(0, spring)); release(); });
    // Native scrolling and the child recognizers may observe the same touch,
    // without cancelling each other. Only a held pan disables native scrolling;
    // an ordinary vertical move fails the hold and remains normal scrolling.
    if (nativeScrollGesture) {
      pan.simultaneousWithExternalGesture(nativeScrollGesture);
      horizontal.simultaneousWithExternalGesture(nativeScrollGesture);
    }
    return Gesture.Race(pan, horizontal, tap);
  }, [disabled, testID, list, id, scale, onTap, swipe, swipeStart, pressedAt, nativeScrollGesture]);
  return <GestureDetector gesture={gesture}><Animated.View accessible {...props} testID={testID} collapsable={false}
    onAccessibilityTap={onTap} accessibilityState={{ ...props.accessibilityState, disabled }}>{children}</Animated.View></GestureDetector>;
}
const styles = StyleSheet.create({
  item: { shadowColor: '#000', shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  swipe: { overflow: 'hidden', borderRadius: radius.md }, actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  action: { width: 76, minHeight: sizes.touchTarget, paddingHorizontal: spacing.xs, justifyContent: 'center', alignItems: 'center' },
});
