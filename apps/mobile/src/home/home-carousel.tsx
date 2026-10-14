import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useReduceMotion } from '@/design-system';
import { HomePageControl } from './home-page-control';

/** Swipe and explicit buttons expose the same pages, including to VoiceOver. */
export function HomeCarousel({ minimumHeight = 176, pages }: { minimumHeight?: number; pages: { label: string; content: ReactNode }[] }) {
  const reduceMotion = useReduceMotion();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(Math.max(1, window.width - 32));
  const [page, setPage] = useState(0);
  const currentPage = useRef(0);
  const [offset] = useState(() => new Animated.Value(0));
  // Stable on the very first render: no tallest-page fallback or delayed measurements.
  // Every page fits without a nested vertical scroll. Reserve extra room at larger type
  // for the unchanged training example and wrapped nutrition labels.
  const baseHeight = Math.max(minimumHeight, window.width < 375 ? 208 : 176);
  const height = window.fontScale > 1
    ? Math.min(720, baseHeight * window.fontScale + 64 * Math.max(1, window.fontScale - 1))
    : baseHeight;
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ x: currentPage.current * width, animated: false });
  }, [width]);
  const select = useCallback((index: number) => {
    setPage(index);
    currentPage.current = index;
    scroll.current?.scrollTo({ x: index * width, animated: !reduceMotion });
  }, [width, reduceMotion]);
  const scrub = useCallback((position: number) => scroll.current?.scrollTo({ x: position * width, animated: false }), [width]);
  return (
    <View onLayout={event => {
      const next = event.nativeEvent.layout.width;
      if (next > 0 && next !== width) setWidth(next);
    }} testID="home-week-carousel">
      <Animated.ScrollView contentContainerStyle={styles.pages} decelerationRate="fast" directionalLockEnabled horizontal nestedScrollEnabled
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: offset } } }], { useNativeDriver: true })} scrollEventThrottle={16}
        onMomentumScrollEnd={event => {
          const next = Math.max(0, Math.min(pages.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
          currentPage.current = next; setPage(next);
        }}
        pagingEnabled ref={scroll} removeClippedSubviews={false} showsHorizontalScrollIndicator={false} style={{ height }} testID="home-week-pager">
        {pages.map((item, index) => <View accessibilityElementsHidden={page !== index}
          importantForAccessibility={page === index ? 'auto' : 'no-hide-descendants'} key={item.label}
          style={{ height, width }} testID={`home-week-content-${index}`}>
          {item.content}
        </View>)}
      </Animated.ScrollView>
      <View style={styles.indicators} testID="home-week-pagination">
        <HomePageControl labels={pages.map(item => item.label)} offset={offset} onScrub={scrub} onSelect={select} page={page} width={width} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pages: { alignItems: 'flex-start' },
  indicators: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
