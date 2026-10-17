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
/** Scrolled distance over which the title shrinks into the compact bar. */
const SHRINK = 44;
const SMALL = 17;

/**
 * Every Progreso screen draws its own header: the title row with Comparar fixed at the top and, right under it, the
 * period strip opening the page. The strip scrolls away with the page; the title bar stays (with the blur Inicio
 * uses). Scrolling, the title never moves sideways: it shrinks in place on the left, and the period you are reading
 * fades in under it ("Este mes", "Mes anterior", "17 sep – 16 oct").
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
  const header = top + BAR;
  const big = root ? 34 : 22;
  // Scaled from the left edge, so the title stays where it is and only gets smaller.
  const titleStyle = useAnimatedStyle(() => {
    const t = interpolate(offset.value, [0, SHRINK], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY: -8 * t }, { scale: 1 - (1 - SMALL / big) * t }] };
  });
  const rangeStyle = useAnimatedStyle(() => ({ opacity: interpolate(offset.value, [SHRINK * 0.5, SHRINK], [0, 1], Extrapolation.CLAMP) }));
  const barTitle = compactTitle ?? title;
  return <>
    <Stack.Screen options={{ title: barTitle, headerShown: false }} />
    <ScrollScreen testID={testID} scrollRef={scroll} scrollEdge edgeExtra={BAR + 8} edgeFade={10} topInset="manual"
      // The spinner shows below the fixed header, not behind it.
      refreshControl={refreshControl ? cloneElement(refreshControl, { progressViewOffset: header }) : undefined}
      contentContainerStyle={{ paddingTop: header }}>
      {/* The strip opens the page and scrolls away with it; only the title bar stays. */}
      <View style={styles.stripSlot}><PeriodBar onCustom={open.onCustom} /></View>
      {multilineTitle ? <AppText accessibilityRole="header" variant="title1">{title}</AppText> : null}
      <ProgressPeriodBlock {...open} />
      {children}
    </ScrollScreen>
    <View pointerEvents="box-none" style={[styles.header, { paddingTop: top }]}>
      <View pointerEvents="box-none" style={styles.bar}>
        {root ? null : <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={4} onPress={() => router.back()} testID="progress-back">
          <GlassSurface interactive style={styles.backButton}><AppIcon name="chevronLeft" color={colors.text} size={20} /></GlassSurface>
        </Pressable>}
        <View pointerEvents="none" style={styles.titleSlot}>
          <Animated.View style={[styles.title, titleStyle]}>
            <AppText accessibilityRole="header" numberOfLines={1} variant={root ? 'largeTitle' : 'title2'}>{multilineTitle ? barTitle : title}</AppText>
          </Animated.View>
          <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={[styles.rangeUnder, rangeStyle]} testID="progress-compact-range">
            <AppText muted numberOfLines={1} numeric variant="caption">{rangeShortLabel(state, today)}</AppText>
          </Animated.View>
        </View>
        <CompareHeaderButton onPress={() => setSheet('compare')} />
      </View>
    </View>
    {sheet === 'custom' ? <CustomRangeSheet onClose={() => setSheet(null)} /> : null}
    {sheet === 'compare' ? <CompareSheet onClose={() => setSheet(null)} /> : null}
  </>;
}
const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { height: BAR, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  titleSlot: { flex: 1, height: BAR, justifyContent: 'center' },
  title: { transformOrigin: 'left center' },
  rangeUnder: { position: 'absolute', left: 0, right: 0, top: BAR / 2 + 6 },
  backButton: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  // Edge to edge inside the padded page.
  stripSlot: { height: STRIP, marginHorizontal: -16 },
});
