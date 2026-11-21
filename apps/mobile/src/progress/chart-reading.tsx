import { useState, type ReactNode } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppIcon, AppText, brandTokens, motionDurations, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';

export type ChartReading = { title: string; value: string; detail: string; note?: string; placeholder?: boolean };

/** Intrinsic, measured reserve: selecting any real observation cannot move the plot, even with Dynamic Type. */
export function ChartReadout({ reading, candidates, testID, accessibilityLabel, onClear, noteTestID, noteHidden = false }: {
  reading: ChartReading; candidates: ChartReading[]; testID: string; accessibilityLabel?: string; onClear?: () => void; noteTestID?: string; noteHidden?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const sizeKey = `${width}:${fontScale}`;
  const [measured, setMeasured] = useState({ key: sizeKey, height: 0 });
  if (measured.key !== sizeKey) setMeasured({ key: sizeKey, height: 0 });
  const height = measured.key === sizeKey ? measured.height : 0;
  const fields = (item: ChartReading, measurement = false) => <View style={styles.fields}>
    <AppText numeric muted variant="caption">{item.title}</AppText>
    <AppText numeric variant={item.placeholder ? 'subheadline' : 'title1'}>{item.value}</AppText>
    <AppText numeric muted variant="footnote">{item.detail}</AppText>
    {item.note ? <AppText numeric muted variant="footnote" testID={measurement ? undefined : noteTestID} accessibilityElementsHidden={noteHidden} importantForAccessibility={noteHidden ? 'no' : 'auto'}>{item.note}</AppText> : null}
  </View>;
  return <View style={styles.block} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    <View testID={`${testID}-reserve`} style={{ minHeight: height }}>
      <View key={sizeKey} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.measurements}>
        {[reading, ...candidates].map((item, i) => <View key={i} style={styles.measure} onLayout={e => {
          const next = Math.ceil(e.nativeEvent.layout.height); setMeasured(old => old.key !== sizeKey || old.height >= next ? old : { key: sizeKey, height: next });
        }}>{fields(item, true)}</View>)}
      </View>
      <View testID={testID} accessible accessibilityLiveRegion="polite" accessibilityLabel={accessibilityLabel ?? `${reading.title}, ${reading.value}, ${reading.detail}${reading.note ? `, ${reading.note}` : ''}`}>
        <Animated.View key={`${reading.title}|${reading.value}|${reading.detail}|${reading.note ?? ''}`} entering={FadeIn.duration(motionDurations.fast)}>{fields(reading)}</Animated.View>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Quitar selección del gráfico" disabled={!onClear}
      accessibilityElementsHidden={!onClear} importantForAccessibility={onClear ? 'auto' : 'no-hide-descendants'}
      onPress={() => { haptics.selection(); onClear?.(); }} style={[styles.clear, !onClear && styles.hidden]}>
      <AppText muted variant="subheadline">Ver período completo</AppText>
    </Pressable>
  </View>;
}

/** Explicit navigation always occupies the same row; inspecting a mark never navigates. */
export function ChartOpenAction({ label, onPress, testID, accessibilityLabel }: { label: string; onPress?: () => void; testID?: string; accessibilityLabel?: string }) {
  const { colors } = useOwnlevelTheme();
  const body = <>
    <AppText variant="body" style={[styles.grow, { color: onPress ? colors.primary : colors.textMuted }]}>{label}</AppText>
    {onPress ? <AppIcon name="chevronRight" size={20} color={colors.primary} /> : null}
  </>;
  return onPress ? <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>{body}</Pressable>
    : <View testID={testID} style={styles.action} accessible accessibilityLabel={`Elegí un punto. ${label}`}>{body}</View>;
}

export function ChartExplanation({ children, label = 'Cómo se calcula' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const { colors } = useOwnlevelTheme();
  return <View style={styles.block}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }}
      onPress={() => { haptics.selection(); setOpen(v => !v); }} style={styles.action}>
      <AppIcon name="info" size={17} color={colors.textMuted} /><AppText muted variant="subheadline" style={styles.grow}>{label}</AppText>
      <AppIcon name={open ? 'chevronDown' : 'chevronRight'} size={17} color={colors.textMuted} />
    </Pressable>
    {open ? <View style={styles.block}>{children}</View> : null}
  </View>;
}
const styles = StyleSheet.create({
  block: { gap: spacing.xs }, fields: { gap: spacing.xs },
  measurements: { ...StyleSheet.absoluteFill, opacity: 0 }, measure: { position: 'absolute', left: 0, right: 0 },
  clear: { minHeight: brandTokens.layout.minTouch, alignSelf: 'flex-start', justifyContent: 'center' }, hidden: { opacity: 0 },
  action: { minHeight: brandTokens.layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, grow: { flex: 1 },
});
