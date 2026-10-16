import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useMobileAuth } from '@/auth';
import { brandTokens, useReduceMotion } from '@/design-system';
import { type EntryMotion } from './artwork';
import { ENTRY_SPREAD_MS, ENTRY_FADE_MS, ENTRY_STAIRS_MS, ENTRY_SUCCESS_MS } from './motion-model';
import { EntryView } from './view';

type EntryPresentation = EntryMotion & { registerEntry: (mounted: boolean) => void };
const EntryMotionContext = createContext<EntryPresentation | null>(null);
const { base } = brandTokens.motion.duration;

/** Keeps only presentation alive across Stack.Protected unmounting the signed-out route. */
export function EntryTransitionProvider({ children }: PropsWithChildren) {
  const { state } = useMobileAuth();
  const reduced = useReduceMotion();
  const level = useSharedValue(0), arrival = useSharedValue(0), spread = useSharedValue(0), opacity = useSharedValue(1);
  const status = state.status;
  const [presentation, setPresentation] = useState({ status, attempted: status === 'SIGNING_IN' });
  const [entryMounted, registerEntry] = useState(false);
  if (presentation.status !== status) {
    setPresentation({ status, attempted: status === 'SIGNING_IN' || (status === 'SIGNED_IN' && presentation.attempted) });
  }
  const complete = presentation.attempted && status === 'SIGNED_IN';
  const boot = status === 'BOOTSTRAPPING' || (!entryMounted && (status === 'SIGNED_OUT' || (status === 'TRANSIENT_ERROR' && !state.session)));
  const motion = useMemo(() => ({ level, arrival, spread, reduced, registerEntry }), [arrival, spread, level, reduced]);
  const finish = useCallback(() => setPresentation(previous => ({ ...previous, attempted: false })), []);

  useEffect(() => {
    if (status === 'SIGNED_IN') return;
    cancelAnimation(spread);
    cancelAnimation(arrival);
    cancelAnimation(opacity);
    spread.set(0);
    arrival.set(0);
    opacity.set(1);
    if (status === 'SIGNING_IN') {
      level.set(reduced ? 0 : withTiming(1, { duration: base }));
    } else {
      level.set(reduced ? 0 : withTiming(0, { duration: base }));
    }
  }, [arrival, spread, level, opacity, reduced, status]);

  useEffect(() => {
    if (!complete) return;
    // Waiting has moved only six points. Full-height bars begin only after SIGNED_IN.
    if (reduced) {
      level.set(0);
      arrival.set(0);
      spread.set(0);
      opacity.set(withTiming(0, { duration: ENTRY_FADE_MS, reduceMotion: ReduceMotion.Never }));
    } else {
      arrival.set(withTiming(1, { duration: ENTRY_STAIRS_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
      // Closing the gaps overlaps the last part of the rise; there is no separate color cover.
      spread.set(withDelay(ENTRY_STAIRS_MS - ENTRY_SPREAD_MS, withTiming(1, { duration: ENTRY_SPREAD_MS, reduceMotion: ReduceMotion.Never }), ReduceMotion.Never));
      opacity.set(withDelay(ENTRY_STAIRS_MS, withTiming(0, { duration: ENTRY_FADE_MS, reduceMotion: ReduceMotion.Never }), ReduceMotion.Never));
    }
    // This timer only retires an already-faded overlay; auth and navigation never wait for it.
    const timer = setTimeout(finish, reduced ? ENTRY_FADE_MS : ENTRY_SUCCESS_MS);
    return () => {
      clearTimeout(timer);
      cancelAnimation(level);
      cancelAnimation(arrival);
      cancelAnimation(spread);
      cancelAnimation(opacity);
    };
  }, [arrival, complete, spread, finish, level, opacity, reduced]);

  useEffect(() => () => {
    cancelAnimation(level);
    cancelAnimation(arrival);
    cancelAnimation(spread);
    cancelAnimation(opacity);
  }, [arrival, spread, level, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const overlay = boot || complete;
  return <EntryMotionContext.Provider value={motion}>
    <View style={styles.root}>
      <View style={styles.root} accessibilityElementsHidden={overlay} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {overlay ? <Animated.View style={[StyleSheet.absoluteFill, fade]} testID={boot ? 'entry-bootstrap' : 'entry-success-transition'}>
        <EntryView mode={boot ? 'bootstrapping' : 'complete'} motion={motion} />
      </Animated.View> : null}
    </View>
  </EntryMotionContext.Provider>;
}

export function useEntryMotion(): EntryPresentation {
  const value = useContext(EntryMotionContext);
  if (!value) throw new Error('useEntryMotion must be used inside EntryTransitionProvider');
  return value;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
