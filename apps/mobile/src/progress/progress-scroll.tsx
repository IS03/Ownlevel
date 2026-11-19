import { cloneElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type RefreshControlProps } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedRef, useAnimatedStyle, useScrollViewOffset } from 'react-native-reanimated';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, AppText, GlassSurface, ScrollScreen, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { CompareHeaderButton, CompareChip, PeriodCaption, PeriodBar, ProgressPeriodBlock, STRIP } from './period-controls';
import { CompareSheet, CustomRangeSheet } from './period-sheets';
import { daysBetween, isCurrentProgressRange, progressRange, rangeShortLabel, shortRange } from './progress-range';
import { useProgressRange } from './progress-range-context';
import type { DateRange } from './progress-range';
const BUTTON_NAMES = { week: 'Esta semana', '2w': '2 semanas', '3w': '3 semanas', month: 'Este mes', '3m': '3 meses', '6m': '6 meses', year: 'Este año' } as const;

const BAR = 52;
/** Scrolled distance over which the title shrinks into the compact bar. */
const SHRINK = 44;
const SMALL = 21;

/**
 * Every Progreso screen draws its own header: the title row with Comparar fixed at the top and, right under it, the
 * period strip opening the page. The strip scrolls away with the page; the title bar stays (with the blur Inicio
 * uses). Scrolling, the title never moves sideways: it shrinks in place on the left, and the period you are reading
 * fades in under it ("Este mes", "Mes anterior", "17 sep – 16 oct").
 */
export function ProgressScroll({ title, testID, refreshControl, children, compactTitle, multilineTitle = false, root = false, periodControls = true, compactPeriod = true, comparisonControls = true, periodPickerTestID = 'progress-period-picker', openSheet = null, sheetProposal = null, onSheetOpened, initialScrollPosition, onScrollPosition }: {
  title: string; testID: string; refreshControl?: React.ReactElement<RefreshControlProps>; children: ReactNode; multilineTitle?: boolean; compactTitle?: string;
  /** The tab's first screen: no back button and a large title. */
  root?: boolean; comparisonControls?: boolean; periodControls?: boolean; compactPeriod?: boolean; periodPickerTestID?: string;
  /** #519 · A sheet asked for by the route (the portada's «Comparar períodos»): opened once, then the route forgets it. */
  openSheet?: 'compare' | null; onSheetOpened?: () => void;
  /** The period that sheet proposes as A (applied only on confirmation). */
  sheetProposal?: DateRange | null;
  /** Restore the reading position when this focused reader remounts after a detail. */
  initialScrollPosition?: number; onScrollPosition?: (position: number) => void;
}) {
  const router = useRouter(),reduced=useReduceMotion();
  const { colors } = useOwnlevelTheme();
  const { top } = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  // Keep the full title at narrow widths too, before accessibility text sizes are reached.
  const compactLarge = compactPeriod && (fontScale > 1.15 || width < 375);
  // The fixed header must make room for Dynamic Type, including accessibility sizes.
  const barHeight = BAR * Math.max(1, fontScale) * (compactPeriod && fontScale > 1.3 ? 1.5 : 1);
  const { state, today, compareOn } = useProgressRange();
  const periodDays = daysBetween(progressRange(state, today).start, progressRange(state, today).end);
  // The button names the period the way the menu offers it ("Este mes", "Mes anterior"); a custom range says how many days.
  const periodLabel = state.unit === 'custom' ? `${periodDays} ${periodDays === 1 ? 'día' : 'días'}`
    : isCurrentProgressRange(state, today) ? BUTTON_NAMES[state.unit] : rangeShortLabel(state, today);
  const [sheet, setSheet] = useState<'custom' | 'compare' | null>(openSheet);
  const [proposal, setProposal] = useState<DateRange | null>(openSheet ? sheetProposal : null);
  // Also when the screen was already in the stack and the portada asks again.
  const [asked, setAsked] = useState(openSheet);
  if (asked !== openSheet) { setAsked(openSheet); if (openSheet) { setSheet(openSheet); setProposal(sheetProposal); } }
  // Once per request: the route drops the parameter; a new callback identity alone never asks again.
  const sheetOpened = useRef(onSheetOpened);
  useEffect(() => { sheetOpened.current = onSheetOpened; });
  useEffect(() => { if (openSheet) sheetOpened.current?.(); }, [openSheet]);
  const [pulled, setPulled] = useState(false);
  const refreshing = !!refreshControl?.props.refreshing;
  // The pull ends with its read; the next silent read starts with the spinner hidden again.
  const [wasRefreshing, setWasRefreshing] = useState(refreshing);
  if (wasRefreshing !== refreshing) { setWasRefreshing(refreshing); if (!refreshing && pulled) setPulled(false); }
  const open = { onCustom: () => setSheet('custom'), onCompare: () => { setProposal(null); setSheet('compare'); } };
  const [initialOffset] = useState(initialScrollPosition ?? 0);
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollViewOffset(scroll);
  const header = top + barHeight;
  const big = root ? 34 : 22;
  // Scaled from the left edge, so the title stays where it is and only gets smaller.
  const titleStyle = useAnimatedStyle(() => {
    const t = reduced?0:interpolate(offset.value, [0, SHRINK], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY: -8 * t }, { scale: 1 - (1 - SMALL / big) * t }] };
  });
  const rangeStyle = useAnimatedStyle(() => ({ opacity: interpolate(offset.value, [SHRINK * 0.5, SHRINK], [0, 1], Extrapolation.CLAMP) }));
  const barTitle = compactTitle ?? title;
  return <>
    <Stack.Screen options={{ title: barTitle, headerShown: false }} />
    <ScrollScreen testID={testID} scrollRef={scroll} scrollEdge edgeExtra={barHeight + 8} edgeFade={10} topInset="manual"
      // The spinner shows below the fixed header, not behind it.
      refreshControl={refreshControl ? cloneElement(refreshControl, {
        progressViewOffset: header,
        // Only a pull shows the spinner: the silent re-reads on focus/foreground must never push the page down.
        refreshing: pulled && refreshControl.props.refreshing,
        onRefresh: () => { setPulled(true); refreshControl.props.onRefresh?.(); },
      }) : undefined}
      contentOffset={initialScrollPosition === undefined ? undefined : { x: 0, y: initialOffset }}
      onScrollEndDrag={onScrollPosition ? event => onScrollPosition(event.nativeEvent.contentOffset.y) : undefined}
      onMomentumScrollEnd={onScrollPosition ? event => onScrollPosition(event.nativeEvent.contentOffset.y) : undefined}
      contentContainerStyle={{ paddingTop: header }}>
      {/* The strip opens the page and scrolls away with it; only the title bar stays. */}
      {periodControls && !compactPeriod?<View style={styles.stripSlot}><PeriodBar onCustom={open.onCustom} /></View>:null}
      {multilineTitle ? <AppText accessibilityRole="header" variant="title1" style={styles.multilineTitle}>{title}</AppText> : null}
      {periodControls ? compactPeriod ? <View style={styles.compactPeriod}>
        <View style={[{ flex: 1 }, compactLarge && { flexBasis: '100%' }]}><PeriodCaption compact onCustom={open.onCustom} /></View>
        {compactLarge ? <Pressable testID={periodPickerTestID} accessibilityRole="button" accessibilityLabel={`Elegir período de ${title.toLocaleLowerCase('es-AR')}`} onPress={open.onCustom}>
          <GlassSurface interactive style={styles.periodButton}><AppText numeric variant="subheadline">{periodLabel}</AppText><AppIcon name="chevronDown" color={colors.textMuted} size={17} /></GlassSurface>
        </Pressable> : null}
        {comparisonControls ? <CompareHeaderButton onPress={open.onCompare} /> : null}
        {comparisonControls && compareOn ? <View style={{flexBasis: '100%'}}><CompareChip onOpen={open.onCompare} /></View> : null}
      </View> : <ProgressPeriodBlock {...open} /> : null}
      {children}
      {/* The floating tab bar sits over the end of the page: the last row always scrolls clear of it. */}
      <View style={styles.tabRoom} />
    </ScrollScreen>
    <View pointerEvents="box-none" style={[styles.header, { paddingTop: top }]}>
      <View pointerEvents="box-none" style={[styles.bar, { height: barHeight }]}>
        {root ? null : <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={4} onPress={() => router.back()} testID="progress-back">
          <GlassSurface interactive style={styles.backButton}><AppIcon name="chevronLeft" color={colors.text} size={20} /></GlassSurface>
        </Pressable>}
        <View pointerEvents="none" style={[styles.titleSlot, { height: barHeight }]}>
          <Animated.View style={[styles.title, titleStyle]}>
            <AppText accessibilityRole="header" numberOfLines={compactPeriod && fontScale > 1.3 ? undefined : 1} variant={root ? 'largeTitle' : 'title2'}>{multilineTitle ? barTitle : title}</AppText>
          </Animated.View>
          {periodControls && !compactLarge?<Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={[styles.rangeUnder, { top: barHeight / 2 + 6 * fontScale }, rangeStyle]} testID="progress-compact-range">
            <AppText muted numberOfLines={1} numeric variant="caption">{shortRange(progressRange(state, today), today)}</AppText>
          </Animated.View>:null}
        </View>
        {periodControls ? compactPeriod ? compactLarge ? null : <Pressable testID={periodPickerTestID} accessibilityRole="button" accessibilityLabel={`Elegir período de ${title.toLocaleLowerCase('es-AR')}`} onPress={open.onCustom}>
          <GlassSurface interactive style={styles.periodButton}><AppText numeric variant="subheadline">{periodLabel}</AppText><AppIcon name="chevronDown" color={colors.textMuted} size={17} /></GlassSurface>
        </Pressable> : <CompareHeaderButton onPress={open.onCompare} /> : null}
      </View>
    </View>
    {sheet === 'custom' ? <CustomRangeSheet shortPreset={compactPeriod} onClose={() => setSheet(null)} /> : null}
    {comparisonControls && sheet === 'compare' ? <CompareSheet proposal={proposal} onClose={() => { setSheet(null); setProposal(null); }} /> : null}
  </>;
}
const styles = StyleSheet.create({
  // A long question under the bar keeps its own air instead of touching it.
  multilineTitle: { paddingTop: spacing.md },
  tabRoom: { height: 72 },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { height: BAR, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  titleSlot: { flex: 1, height: BAR, justifyContent: 'center' },
  title: { transformOrigin: 'left center' },
  rangeUnder: { position: 'absolute', left: 0, right: 0, top: BAR / 2 + 6 },
  backButton: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  // Edge to edge inside the padded page.
  stripSlot: { height: STRIP, marginHorizontal: -16 },
  compactPeriod: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  periodButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
