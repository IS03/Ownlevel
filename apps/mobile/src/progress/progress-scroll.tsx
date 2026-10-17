import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type RefreshControlProps } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedRef, useAnimatedStyle, useScrollViewOffset, useSharedValue } from 'react-native-reanimated';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, AppText, GlassSurface, ScrollScreen, useOwnlevelTheme } from '@/design-system';
import { CompareHeaderButton, PeriodBar, ProgressPeriodBlock } from './period-controls';
import { CompareSheet, CustomRangeSheet } from './period-sheets';

const BAR = 44;

/**
 * Every Progreso screen: a header of its own instead of the native large title.
 * - The large title sits on the bar's line (Progreso, next to Comparar); in a pushed screen, right under the back button.
 * - Scrolling, it slides under the status bar's blur and a small title fades into the bar, like a native large title.
 * - The period strip follows the scroll and pins right under the bar, moved on the UI thread (no second copy, no jump).
 */
export function ProgressScroll({ title, testID, refreshControl, children, compactTitle, root = false }: {
  title: string; testID: string; refreshControl?: React.ReactElement<RefreshControlProps>; children: ReactNode; multilineTitle?: boolean; compactTitle?: string;
  /** The tab's first screen: no back button, and the title shares the bar's line with Comparar. */
  root?: boolean;
}) {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const { top } = useSafeAreaInsets();
  const back = !root;
  const [sheet, setSheet] = useState<'custom' | 'compare' | null>(null);
  const open = { onCustom: () => setSheet('custom'), onCompare: () => setSheet('compare') };
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollViewOffset(scroll);
  const stripY = useSharedValue(0), titleBottom = useSharedValue(BAR);
  // The content pads itself under the status bar (manual inset), so the offset is the scrolled distance.
  const sticky = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(0, offset.value + top + BAR - stripY.value) }] }));
  // The small title arrives once the large one has gone: under the bar in a pushed screen, under the clock on the root.
  const hidden = root ? 8 : BAR;
  const small = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value + top, [titleBottom.value - hidden - 16, titleBottom.value - hidden], [0, 1], Extrapolation.CLAMP),
  }));
  return <>
    <Stack.Screen options={{ title: compactTitle ?? title, headerShown: false }} />
    <ScrollScreen testID={testID} refreshControl={refreshControl} scrollRef={scroll} scrollEdge edgeExtra={BAR + 6} edgeFade={14} topInset="manual"
      contentContainerStyle={{ paddingTop: top + (back ? BAR : 0) }}>
      <View onLayout={e => { titleBottom.set(e.nativeEvent.layout.y + e.nativeEvent.layout.height); }}
        style={[styles.titleRow, !back && styles.titleBesideCompare]}>
        <AppText accessibilityRole="header" variant="largeTitle">{title}</AppText>
      </View>
      <Animated.View onLayout={e => { stripY.set(e.nativeEvent.layout.y); }} style={[styles.sticky, sticky]}>
        <PeriodBar onCustom={open.onCustom} />
      </Animated.View>
      <ProgressPeriodBlock {...open} />
      {children}
    </ScrollScreen>
    <View pointerEvents="box-none" style={[styles.bar, { paddingTop: top, height: top + BAR }]}>
      {back ? <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={4} onPress={() => router.back()} testID="progress-back">
        <GlassSurface interactive style={styles.backButton}><AppIcon name="chevronLeft" color={colors.text} size={20} /></GlassSurface>
      </Pressable> : <View />}
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
        style={[styles.smallTitle, { top }, small]}>
        <AppText numberOfLines={1} variant="headline">{compactTitle ?? title}</AppText>
      </Animated.View>
      <CompareHeaderButton onPress={() => setSheet('compare')} />
    </View>
    {sheet === 'custom' ? <CustomRangeSheet onClose={() => setSheet(null)} /> : null}
    {sheet === 'compare' ? <CompareSheet onClose={() => setSheet(null)} /> : null}
  </>;
}
const styles = StyleSheet.create({
  titleRow: { minHeight: BAR, justifyContent: 'center' },
  // Room for Comparar, which sits on this same line in the bar.
  titleBesideCompare: { paddingRight: 136 },
  sticky: { zIndex: 10 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  smallTitle: { position: 'absolute', left: 136, right: 136, height: BAR, alignItems: 'center', justifyContent: 'center' },
});
