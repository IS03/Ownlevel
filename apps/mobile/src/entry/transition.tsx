import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useMobileAuth } from '@/auth';
import { brandTokens, useReduceMotion } from '@/design-system';
import { STAIR_END, type EntryMotion } from './artwork';
import { EntryView } from './view';

type EntryPresentation = EntryMotion & { registerEntry: (mounted: boolean) => void };
const EntryMotionContext = createContext<EntryPresentation | null>(null);
const { fast, base } = brandTokens.motion.duration;

/** Keeps only presentation alive across Stack.Protected unmounting the signed-out route. */
export function EntryTransitionProvider({ children }: PropsWithChildren) {
  const { state } = useMobileAuth();
  const reduced = useReduceMotion();
  const level = useSharedValue(0), cover = useSharedValue(0), opacity = useSharedValue(1);
  const status = state.status;
  const [presentation, setPresentation] = useState({ status, attempted: status === 'SIGNING_IN' });
  const [entryMounted, registerEntry] = useState(false);
  if (presentation.status !== status) {
    setPresentation({ status, attempted: status === 'SIGNING_IN' || (status === 'SIGNED_IN' && presentation.attempted) });
  }
  const complete = presentation.attempted && status === 'SIGNED_IN';
  const boot = status === 'BOOTSTRAPPING' || (!entryMounted && (status === 'SIGNED_OUT' || (status === 'TRANSIENT_ERROR' && !state.session)));
  const motion = useMemo(() => ({ level, cover, reduced, registerEntry }), [cover, level, reduced]);
  const finish = useCallback(() => setPresentation(previous => ({ ...previous, attempted: false })), []);

  useEffect(() => {
    if (status === 'SIGNED_IN') return;
    cancelAnimation(cover);
    cancelAnimation(opacity);
    cover.set(0);
    opacity.set(1);
    if (status === 'SIGNING_IN') {
      level.set(reduced ? 0 : withTiming(STAIR_END, { duration: STAIR_END * fast, easing: Easing.linear }));
    } else {
      level.set(reduced ? 0 : withTiming(0, { duration: base }));
    }
  }, [cover, level, opacity, reduced, status]);

  useEffect(() => {
    if (!complete) return;
    const finishStairs = reduced ? 0 : base;
    level.set(reduced ? 0 : withTiming(STAIR_END, { duration: base }));
    cover.set(withDelay(finishStairs, withTiming(1, {
      duration: reduced ? fast : base, reduceMotion: reduced ? ReduceMotion.Never : ReduceMotion.System,
    }), reduced ? ReduceMotion.Never : ReduceMotion.System));
    const coveredAt = finishStairs + (reduced ? fast : base);
    opacity.set(withDelay(coveredAt, withTiming(0, { duration: base, reduceMotion: ReduceMotion.Never }), ReduceMotion.Never));
    // This timer only retires an already-faded overlay; auth and navigation never wait for it.
    const timer = setTimeout(finish, coveredAt + base);
    return () => {
      clearTimeout(timer);
      cancelAnimation(level);
      cancelAnimation(cover);
      cancelAnimation(opacity);
    };
  }, [complete, cover, finish, level, opacity, reduced]);

  useEffect(() => () => {
    cancelAnimation(level);
    cancelAnimation(cover);
    cancelAnimation(opacity);
  }, [cover, level, opacity]);

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
