import { useContext, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type RefreshControlProps } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Stack } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements/Header/HeaderHeightContext';
import { GlassSurface, ScrollScreen, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { CompareHeaderButton, ProgressPeriodBlock } from './period-controls';
import { CompareSheet, CustomRangeSheet } from './period-sheets';

/**
 * Every Progreso screen (R1–R5): native large title that moves into the bar on scroll, "Comparar" in the header,
 * and the period block. Once the block reaches the bar, a pinned copy appears right below it on glass (R2).
 * (ScrollView sticky headers stick behind a large-title bar, under its content inset, so they can't be used here.)
 */
export function ProgressScroll({ title, testID, refreshControl, children }: {
  title: string; testID: string; refreshControl?: React.ReactElement<RefreshControlProps>; children: ReactNode;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const [sheet, setSheet] = useState<'custom' | 'compare' | null>(null);
  const [pinned, setPinned] = useState(false);
  const block = useRef<View>(null);
  const open = { onCustom: () => setSheet('custom'), onCompare: () => setSheet('compare') };
  // The block's top edge in the window, measured as you scroll: the pinned copy covers it as soon as it reaches the bar.
  const check = () => block.current?.measureInWindow((_x, y) => {
    const next = y < headerHeight;
    setPinned(prev => prev === next ? prev : next);
  });
  return <>
    <Stack.Screen options={{
      title, headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text },
      headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background }, headerLargeStyle: { backgroundColor: 'transparent' },
      headerRight: () => <CompareHeaderButton onPress={() => setSheet('compare')} />,
    }} />
    <ScrollScreen testID={testID} refreshControl={refreshControl} scrollEventThrottle={32} onScroll={check}>
      <View ref={block} collapsable={false}><ProgressPeriodBlock {...open} /></View>
      {children}
    </ScrollScreen>
    {pinned ? <Animated.View entering={FadeIn.duration(reduced ? 0 : 150)} exiting={FadeOut.duration(reduced ? 0 : 150)}
      style={[styles.pinned, { top: headerHeight }]} testID="progress-period-pinned">
      <GlassSurface style={StyleSheet.absoluteFill} />
      <View style={styles.pinnedContent}><ProgressPeriodBlock {...open} /></View>
    </Animated.View> : null}
    {sheet === 'custom' ? <CustomRangeSheet onClose={() => setSheet(null)} /> : null}
    {sheet === 'compare' ? <CompareSheet onClose={() => setSheet(null)} /> : null}
  </>;
}
const styles = StyleSheet.create({
  pinned: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  pinnedContent: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
});
