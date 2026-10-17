import { cloneElement, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type RefreshControlProps } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedRef, useAnimatedStyle, useScrollViewOffset } from 'react-native-reanimated';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, AppText, GlassSurface, ScrollScreen, useOwnlevelTheme } from '@/design-system';
import { CompareHeaderButton, PeriodBar, ProgressPeriodBlock, STRIP } from './period-controls';
import { CompareSheet, CustomRangeSheet } from './period-sheets';
import { rangeShortLabel } from './progress-range';
import { useProgressRange } from './progress-range-context';

const BAR = 52;
/** Scrolled distance over which the title row hands over to the compact one. */
const HANDOFF = 28;

/**
 * Every Progreso screen draws its own header, fixed at the top: the title row with Comparar and, right under it, the
 * period strip. Only the page scrolls, under both. Once it moves, the title row hands over to a compact centred one
 * that also says which period you are reading ("Este mes", "Mes anterior", "17 sep – 16 oct").
 */
export function ProgressScroll({ title, testID, refreshControl, children, compactTitle, multilineTitle = false, root = false }: {
  title: string; testID: string; refreshControl?: React.ReactElement<RefreshControlProps>; children: ReactNode; multilineTitle?: boolean; compactTitle?: string;
  /** The tab's first screen: no back button and a large title. */
  root?: boolean;
}) {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const { top } = useSafeAreaInsets();
  const { state, today } = useProgressRange();
  const [sheet, setSheet] = useState<'custom' | 'compare' | null>(null);
  const open = { onCustom: () => setSheet('custom'), onCompare: () => setSheet('compare') };
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollViewOffset(scroll);
  const header = top + BAR + STRIP;
  const full = useAnimatedStyle(() => ({ opacity: interpolate(offset.value, [0, HANDOFF * 0.6], [1, 0], Extrapolation.CLAMP) }));
  const compact = useAnimatedStyle(() => ({ opacity: interpolate(offset.value, [HANDOFF * 0.4, HANDOFF], [0, 1], Extrapolation.CLAMP) }));
  const barTitle = compactTitle ?? title;
  return <>
    <Stack.Screen options={{ title: barTitle, headerShown: false }} />
    <ScrollScreen testID={testID} scrollRef={scroll} scrollEdge edgeExtra={BAR + STRIP + 8} edgeFade={10} topInset="manual"
      // The spinner shows below the fixed header, not behind it.
      refreshControl={refreshControl ? cloneElement(refreshControl, { progressViewOffset: header }) : undefined}
      contentContainerStyle={{ paddingTop: header + 12 }}>
      {multilineTitle ? <AppText accessibilityRole="header" variant="title1">{title}</AppText> : null}
      <ProgressPeriodBlock {...open} />
      {children}
    </ScrollScreen>
    <View pointerEvents="box-none" style={[styles.header, { paddingTop: top }]}>
      <View pointerEvents="box-none" style={styles.bar}>
        {root ? null : <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={4} onPress={() => router.back()} testID="progress-back">
          <GlassSurface interactive style={styles.backButton}><AppIcon name="chevronLeft" color={colors.text} size={20} /></GlassSurface>
        </Pressable>}
        <Animated.View pointerEvents="none" style={[styles.titleSlot, full]}>
          <AppText accessibilityRole="header" numberOfLines={1} variant={root ? 'largeTitle' : 'title2'}>{multilineTitle ? barTitle : title}</AppText>
        </Animated.View>
        <CompareHeaderButton onPress={() => setSheet('compare')} />
        <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
          style={[styles.compact, compact]} testID="progress-compact-title">
          <AppText numberOfLines={1} variant="headline">{barTitle}</AppText>
          <AppText muted numberOfLines={1} numeric variant="caption">{rangeShortLabel(state, today)}</AppText>
        </Animated.View>
      </View>
      <View style={styles.stripSlot}><PeriodBar onCustom={open.onCustom} /></View>
    </View>
    {sheet === 'custom' ? <CustomRangeSheet onClose={() => setSheet(null)} /> : null}
    {sheet === 'compare' ? <CompareSheet onClose={() => setSheet(null)} /> : null}
  </>;
}
const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { height: BAR, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  titleSlot: { flex: 1 },
  backButton: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  // Centred between the back button and Comparar.
  compact: { position: 'absolute', left: 136, right: 136, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  stripSlot: { height: STRIP },
});
