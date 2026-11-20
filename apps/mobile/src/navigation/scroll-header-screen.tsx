import { cloneElement, useContext, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type RefreshControlProps, type ScrollViewProps } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { AppIcon, AppText, GlassSurface, ScrollEdgeBlur, ScrollScreen, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';

/** Floating controls/soft scroll edge shared with Progreso, including virtualized readers. The route layout hides its native bar. */
export function ScrollHeaderScreen({ title, children }: { title: string; children: ReactElement<ScrollViewProps> }) {
  const router = useRouter(), { colors } = useOwnlevelTheme(), insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const { fontScale } = useWindowDimensions();
  const minimum = (brandTokens.layout.minTouch + 2 * spacing.xs) * Math.max(1, fontScale);
  const [measured, setMeasured] = useState(0), [scrolled, setScrolled] = useState(false);
  const barHeight = Math.max(minimum, measured), headerHeight = insets.top + barHeight;
  const content = StyleSheet.flatten(children.props.contentContainerStyle) ?? {};
  const paddingTop = content.paddingTop ?? content.paddingVertical ?? content.padding ?? brandTokens.layout.screenPadding;
  const managed = children.type === ScrollScreen;
  const refresh = children.props.refreshControl as ReactElement<RefreshControlProps> | undefined;
  return <View style={styles.screen}>
    {cloneElement(children, {
      ...(managed ? { topInset: 'manual' } : {}),
      contentInsetAdjustmentBehavior: 'never',
      automaticallyAdjustContentInsets: false,
      contentInset: managed ? children.props.contentInset : { ...children.props.contentInset, bottom: (children.props.contentInset?.bottom ?? 0) + insets.bottom },
      contentContainerStyle: [children.props.contentContainerStyle, { paddingTop: headerHeight + (typeof paddingTop === 'number' ? paddingTop : brandTokens.layout.screenPadding) }],
      scrollEventThrottle: 16,
      onScroll: event => {
        const next = event.nativeEvent.contentOffset.y > spacing.xs;
        if (next !== scrolled) setScrolled(next);
        children.props.onScroll?.(event);
      },
      ...(refresh ? { refreshControl: cloneElement(refresh, { progressViewOffset: headerHeight }) } : {}),
    })}
    <ScrollEdgeBlur visible={scrolled} height={headerHeight + spacing.sm} fade={spacing.md} testID="detail-scroll-edge" />
    <View testID="detail-header" pointerEvents="box-none" style={[styles.header, { paddingTop: insets.top }]}>
      <View testID="detail-header-bar" pointerEvents="box-none" style={[styles.bar, { minHeight: minimum }]} onLayout={event => setMeasured(event.nativeEvent.layout.height)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" testID="detail-header-back" onPress={() => {
          if (router.canGoBack?.()) router.back(); else router.replace('/(tabs)/progress');
        }}>
          <GlassSurface interactive style={styles.back}><AppIcon name="chevronLeft" color={colors.text} size={20} /></GlassSurface>
        </Pressable>
        <AppText accessibilityRole="header" variant="title2" style={styles.title}>{title}</AppText>
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: brandTokens.layout.screenPadding, paddingVertical: spacing.xs },
  title: { flex: 1 },
  back: { width: brandTokens.layout.minTouch, height: brandTokens.layout.minTouch, borderRadius: radius.full, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
