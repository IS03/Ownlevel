import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  AppIcon,
  AppText,
  brandTokens,
  pressedStyle,
  useOwnlevelTheme,
  useReduceMotion,
} from '@/design-system';
import { homeMetricIcon } from '@/home/home-metric-icons';
import { triggerMetricHaptic } from '@/platform/haptics';
import type { MetricDefinition } from '@/api/metric-definitions';
import { definitionSummary } from './definitions-model';
export function dragOrder(ids: string[], id: string, index: number) {
  const next = ids.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(next.length, index)), 0, id);
  return next;
}
type Drag = {
  id: string;
  expected: string[];
  order: string[];
  origin: number;
  dy: number;
  slots: { id: string; y: number; height: number }[];
};
type Props = {
  definitions: MetricDefinition[];
  disabled: boolean;
  onOpen: (d: MetricDefinition) => void;
  onDrop: (ids: string[], expected: string[]) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDragging?: (dragging: boolean) => void;
};
export function DefinitionDragList({
  definitions,
  disabled,
  onOpen,
  onDrop,
  onMove,
  onDragging,
}: Props) {
  const [preview, setPreview] = useState<string[] | null>(null),
    [lifted, setLifted] = useState<string | null>(null);
  const layouts = useRef(new Map<string, { y: number; height: number }>()),
    active = useRef<Drag | null>(null);
  const ids = definitions.map((d) => d.id),
    ordered = preview
      ? preview
          .map((id) => definitions.find((d) => d.id === id))
          .filter((d): d is MetricDefinition => !!d)
      : definitions;
  const begin = (id: string) => {
    if (disabled || active.current) return;
    const slots = ids.map((id) => ({
      id,
      ...(layouts.current.get(id) ?? { y: 0, height: 80 }),
    }));
    active.current = {
      id,
      expected: ids,
      order: ids,
      origin: layouts.current.get(id)?.y ?? 0,
      dy: 0,
      slots,
    };
    setLifted(id);
    onDragging?.(true);
    triggerMetricHaptic();
  };
  const move = (id: string, dy: number) => {
    const d = active.current;
    if (!d || d.id !== id) return;
    d.dy = dy;
    const center =
      d.origin + dy + (d.slots.find((s) => s.id === id)?.height ?? 80) / 2;
    let index = d.slots.filter((s) => s.y + s.height / 2 < center).length;
    const original = d.expected.indexOf(id);
    if (index > original) index--;
    const order = dragOrder(d.expected, id, index);
    if (order.join() !== d.order.join()) {
      d.order = order;
      setPreview(order);
    }
  };
  const finish = (id: string, commit: boolean) => {
    const d = active.current;
    if (!d || d.id !== id) return;
    active.current = null;
    setLifted(null);
    setPreview(null);
    onDragging?.(false);
    triggerMetricHaptic();
    if (commit) onDrop(d.order, d.expected);
  };
  return (
    <View>
      {ordered.map((d, index) => (
        <DragRow
          key={d.id}
          definition={d}
          lifted={lifted === d.id}
          disabled={disabled}
          first={index === 0}
          last={index === ordered.length - 1}
          onLayout={(y, height) => layouts.current.set(d.id, { y, height })}
          offset={() => {
            const a = active.current;
            return a?.id === d.id
              ? a.origin + a.dy - (layouts.current.get(d.id)?.y ?? 0)
              : 0;
          }}
          begin={() => begin(d.id)}
          move={(dy) => move(d.id, dy)}
          finish={(commit) => finish(d.id, commit)}
          onOpen={() => onOpen(d)}
          onMove={(direction) => onMove(d.id, direction)}
        />
      ))}
    </View>
  );
}
function DragRow({
  definition: d,
  lifted,
  disabled,
  first,
  last,
  onLayout,
  offset,
  begin,
  move,
  finish,
  onOpen,
  onMove,
}: {
  definition: MetricDefinition;
  lifted: boolean;
  disabled: boolean;
  first: boolean;
  last: boolean;
  onLayout: (y: number, height: number) => void;
  offset: () => number;
  begin: () => void;
  move: (dy: number) => void;
  finish: (commit: boolean) => void;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const { colors } = useOwnlevelTheme(),
    reduced = useReduceMotion();
  const y = useSharedValue(0),
    scale = useSharedValue(1);
  const callbacks = useRef({ begin, move, finish, offset });
  useEffect(() => {
    callbacks.current = { begin, move, finish, offset };
  }, [begin, move, finish, offset]);
  const start = useCallback(() => {
    callbacks.current.begin();
    scale.set(reduced ? 1 : withSpring(1.02, brandTokens.motion.spring));
  }, [reduced, scale]);
  const update = useCallback(
    (e: { translationY: number }) => {
      callbacks.current.move(e.translationY);
      y.set(reduced ? 0 : callbacks.current.offset());
    },
    [reduced, y],
  );
  const end = useCallback(() => callbacks.current.finish(true), []);
  const finalize = useCallback(() => {
    callbacks.current.finish(false);
    y.set(reduced ? 0 : withSpring(0, brandTokens.motion.spring));
    scale.set(reduced ? 1 : withSpring(1, brandTokens.motion.spring));
  }, [reduced, scale, y]);
  // RNGH only registers these callbacks here; the refs are read later by native gesture events, never during render.
  /* eslint-disable react-hooks/refs */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('metric-drag-' + d.id)
        .enabled(!disabled && d.isActive)
        .activateAfterLongPress(300)
        .runOnJS(true)
        .onStart(start)
        .onUpdate(update)
        .onEnd(end)
        .onFinalize(finalize),
    [d.id, d.isActive, disabled, start, update, end, finalize],
  );
  /* eslint-enable react-hooks/refs */
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: scale.value }],
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(e) => {
          onLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height);
          if (lifted) y.set(reduced ? 0 : offset());
        }}
        layout={
          reduced
            ? undefined
            : LinearTransition.springify().damping(28).stiffness(240)
        }
        entering={FadeIn.duration(200)}
        style={[
          {
            zIndex: lifted ? 2 : 0,
            backgroundColor: colors.background,
            shadowColor: colors.text,
            shadowOpacity: lifted ? 0.12 : 0,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: lifted ? 4 : 0,
          },
          animated,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Editar ' + d.name}
          accessibilityState={{ disabled }}
          accessibilityHint={
            d.isActive
              ? 'Mantené apretado para arrastrar'
              : 'Abre la métrica archivada'
          }
          accessibilityActions={
            d.isActive
              ? [
                  ...(!first
                    ? [{ name: 'moveUp', label: 'Mover arriba' }]
                    : []),
                  ...(!last
                    ? [{ name: 'moveDown', label: 'Mover abajo' }]
                    : []),
                ]
              : []
          }
          onAccessibilityAction={(e) => {
            if (!disabled) {
              if (e.nativeEvent.actionName === 'moveUp' && !first) onMove(-1);
              if (e.nativeEvent.actionName === 'moveDown' && !last) onMove(1);
            }
          }}
          disabled={disabled}
          onPress={onOpen}
          style={({ pressed }) => [
            {
              minHeight: 80,
              paddingVertical: 20,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            },
            pressedStyle(pressed && !lifted, reduced),
          ]}
          testID={'metric-definition-' + d.id}
        >
          <AppIcon
            name={homeMetricIcon(d.systemKey, d.icon)}
            color={colors.textMuted}
            size={20}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="headline">{d.name}</AppText>
            <AppText muted numeric variant="footnote">
              {definitionSummary(d)}
            </AppText>
            <AppText muted variant="caption">
              {d.systemKey ? 'Sistema' : 'Propia'}
              {!d.isActive ? ' · Archivada' : ''}
              {d.hasHistory ? ' · Con historial' : ''}
            </AppText>
          </View>
          <AppIcon
            name={d.isActive ? 'dragHandle' : 'chevronRight'}
            color={colors.textMuted}
            size={20}
          />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}
