import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { MobileApiClient } from '@/api/client';
import { homeDay } from '@/home/home-day';
import { prepareHome } from '@/home/shared-home-read';
import { useMobileAuth } from '@/auth';
import { brandTokens, useReduceMotion } from '@/design-system';
import { type EntryMotion } from './artwork';
import { ENTRY_SPREAD_MS, ENTRY_FADE_MS, ENTRY_STAIRS_MS, ENTRY_SUCCESS_MS } from './motion-model';
import { EntryView } from './view';
import { useNativeSplash } from './use-native-splash';
import { FIRST_DATA_HOLD_MS, markHomeRevealed, markRestored } from './first-data';

type EntryPresentation = EntryMotion & { registerEntry: (mounted: boolean) => void };
const EntryMotionContext = createContext<EntryPresentation | null>(null);
const StartupHomeContext = createContext(false);
export const useStartupHomePending = () => useContext(StartupHomeContext);
const { base } = brandTokens.motion.duration;

/** Keeps only presentation alive across Stack.Protected unmounting the signed-out route. */
export function EntryTransitionProvider({ children, client }: PropsWithChildren<{ client?: MobileApiClient | null }>) {
  const { state } = useMobileAuth();
  const reduced = useReduceMotion();
  const level = useSharedValue(0), arrival = useSharedValue(0), spread = useSharedValue(0), opacity = useSharedValue(1);
  const status = state.status;
  const [presentation, setPresentation] = useState({ status, attempted: status === 'SIGNING_IN' });
  const [entryMounted, registerEntry] = useState(false);
  if (presentation.status !== status) {
    setPresentation({ status, attempted: status === 'SIGNING_IN' || (status === 'SIGNED_IN' && presentation.attempted) });
  }
  const [startup, setStartup] = useState(() => status === 'BOOTSTRAPPING' || status === 'SIGNED_IN' ? 'pending' : 'done');
  if (startup !== 'done' && status !== 'BOOTSTRAPPING' && (status !== 'SIGNED_IN' || !client)) {
    setStartup('done');
  }
  const [entryLaidOut, setEntryLaidOut] = useState(false);
  const nativeHandoff = client !== undefined && !entryLaidOut;
  const hideSplash = useNativeSplash(entryLaidOut);
  useEffect(hideSplash, [hideSplash]);

  useEffect(() => {
    if (status === 'BOOTSTRAPPING') return;
    markRestored();
    if (status !== 'SIGNED_IN' || startup !== 'pending' || !client) return;
    let active = true;
    const started = Date.now();
    // Reserve time for the exit fade so its last frame also fits in the startup budget.
    const timer = setTimeout(() => { active = false; setStartup('fade'); }, FIRST_DATA_HOLD_MS - ENTRY_FADE_MS);
    void prepareHome(client, homeDay().today).finally(() => {
      if (!active) return;
      const fullTransitionFits = Date.now() - started + ENTRY_SUCCESS_MS <= FIRST_DATA_HOLD_MS;
      setStartup(fullTransitionFits ? 'ready' : 'fade');
    });
    return () => { active = false; clearTimeout(timer); };
  }, [client, startup, status]);

  const startupWaiting = startup === 'pending' && status === 'SIGNED_IN';
  const startupComplete = status === 'SIGNED_IN' && (startup === 'ready' || startup === 'fade');
  const complete = startupComplete || (presentation.attempted && status === 'SIGNED_IN');
  const fadeOnly = reduced || startup === 'fade';
  const boot = status === 'BOOTSTRAPPING' || (!entryMounted && (status === 'SIGNED_OUT' || (status === 'TRANSIENT_ERROR' && !state.session)));
  const motion = useMemo(() => ({ level, arrival, spread, reduced, registerEntry }), [arrival, spread, level, reduced]);
  const finish = useCallback(() => {
    if (startupComplete) { markHomeRevealed(); setStartup('done'); }
    setPresentation(previous => ({ ...previous, attempted: false }));
  }, [startupComplete]);

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
    if (fadeOnly) {
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
    const timer = setTimeout(finish, fadeOnly ? ENTRY_FADE_MS : ENTRY_SUCCESS_MS);
    return () => {
      clearTimeout(timer);
      cancelAnimation(level);
      cancelAnimation(arrival);
      cancelAnimation(spread);
      cancelAnimation(opacity);
    };
  }, [arrival, complete, fadeOnly, spread, finish, level, opacity]);

  useEffect(() => () => {
    cancelAnimation(level);
    cancelAnimation(arrival);
    cancelAnimation(spread);
    cancelAnimation(opacity);
  }, [arrival, spread, level, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const waiting = boot || startupWaiting || nativeHandoff;
  const startupArtwork = nativeHandoff || startup === 'pending' || startupComplete;
  const overlay = waiting || complete;
  return <EntryMotionContext.Provider value={motion}>
    <View style={styles.root}>
      <View style={styles.root} accessibilityElementsHidden={overlay} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'}>
        <StartupHomeContext.Provider value={startupWaiting}>{children}</StartupHomeContext.Provider>
      </View>
      {overlay ? <Animated.View style={[StyleSheet.absoluteFill, fade]} accessibilityViewIsModal onLayout={() => setEntryLaidOut(true)}
        testID={waiting ? 'entry-bootstrap' : 'entry-success-transition'}>
        <EntryView mode={waiting ? 'bootstrapping' : 'complete'} motion={motion}
          startup={startupArtwork} />
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
