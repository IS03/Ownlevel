import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { AppText, brandTokens, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import type { FinishWeek } from './finish-week';

// PW3 · right after the save animation, on the same champagne. The seven days appear at once (a week always has seven, so
// nothing is invented while the calendar loads); the trained days fill one after the other, today last with a ripple and
// a haptic while the count goes N-1 → N; then the week rises and shrinks as the receipt comes up from below. It never
// stays in the receipt. No calendar (unavailable or too slow) → it leaves without filling anything. Reduce Motion: fades.
const hero = brandTokens.palette.light;
const DOT = 32;
const { fast, base } = brandTokens.motion.duration;
const spring = brandTokens.motion.spring;
const APPEAR_MS = 350, STEP_MS = 70, HOLD_MS = 750, WAIT_MS = 1200;

function Day({ index, trained, today, fillAt, reduced }: { index: number; trained: boolean; today: boolean; fillAt: number | null; reduced: boolean }) {
  const pop = useSharedValue(reduced ? 1 : 0), fill = useSharedValue(0), ripple = useSharedValue(0);
  useEffect(() => { if (!reduced) pop.set(withDelay(index * 40, withSpring(1, spring))); }, [index, pop, reduced]);
  useEffect(() => {
    if (fillAt === null || (!trained && !today)) return;
    fill.set(withDelay(fillAt, reduced ? withTiming(1, { duration: fast }) : today
      ? withSequence(withSpring(1.18, { ...spring, stiffness: 320 }), withSpring(1, spring)) : withSpring(1, spring)));
    if (today && !reduced) ripple.set(withDelay(fillAt, withTiming(1, { duration: 600 })));
  }, [fill, fillAt, reduced, ripple, today, trained]);
  const outer = useAnimatedStyle(() => ({ opacity: reduced ? 1 : pop.get(), transform: [{ scale: reduced ? 1 : 0.5 + 0.5 * pop.get() }] }));
  const inner = useAnimatedStyle(() => ({ opacity: Math.min(1, fill.get()), transform: [{ scale: fill.get() }] }));
  const wave = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - ripple.get()), transform: [{ scale: 1 + 0.9 * ripple.get() }] }));
  return <Animated.View style={[styles.dot, today && styles.today, outer]}>
    {today ? <Animated.View pointerEvents="none" style={[styles.ripple, wave]} /> : null}
    <Animated.View style={[styles.fill, inner]} />
  </Animated.View>;
}

function Count({ value, bump }: { value: number; bump: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.12 * bump.get() }] }));
  return <Animated.View style={[styles.countRow, style]}>
    <AppText numeric variant="title2" style={styles.count} testID="finish-week-count">{`${value} ${value === 1 ? 'entreno' : 'entrenos'} esta semana`}</AppText>
  </Animated.View>;
}

/** week: undefined while the calendar loads, null when it is not available. */
export function FinishWeekIntro({ week, onLeave, onDone }: { week: FinishWeek | null | undefined; onLeave: () => void; onDone: () => void }) {
  const reduced = useReduceMotion();
  const leave = useSharedValue(0), label = useSharedValue(0), bump = useSharedValue(0);
  const [start, setStart] = useState<number | null>(null), [count, setCount] = useState<number | null>(null);
  const callbacks = useRef({ onLeave, onDone }), mountedAt = useRef(0), left = useRef(false);
  useEffect(() => { mountedAt.current = Date.now(); }, []);
  useEffect(() => { callbacks.current = { onLeave, onDone }; }, [onLeave, onDone]);
  const go = useCallback(() => {
    if (left.current) return;
    left.current = true; callbacks.current.onLeave();
    leave.set(withTiming(1, { duration: base }));
    setTimeout(() => callbacks.current.onDone(), base);
  }, [leave]);
  // Without a calendar in time, the intro leaves without filling anything.
  useEffect(() => {
    if (week === null) { go(); return; }
    if (week !== undefined) return;
    const timer = setTimeout(go, WAIT_MS);
    return () => clearTimeout(timer);
  }, [go, week]);
  const past = week ? week.days.filter(day => !day.today && day.sessionsBefore > 0).length : 0;
  useEffect(() => {
    if (!week) return;
    const at = reduced ? 0 : Math.max(0, APPEAR_MS - (Date.now() - mountedAt.current));
    const todayAt = at + (reduced ? fast : past * STEP_MS + 120);
    setStart(at);
    const before = week.sessions - 1;
    const timers = [
      setTimeout(() => { if (before > 0) setCount(before); label.set(withTiming(1, { duration: fast })); }, at),
      setTimeout(() => {
        setCount(week.sessions); triggerHaptic('setComplete');
        if (!reduced) bump.set(withSequence(withSpring(1, { ...spring, stiffness: 320 }), withSpring(0, spring)));
      }, todayAt),
      setTimeout(go, todayAt + HOLD_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [bump, go, label, past, reduced, week]);
  const root = useAnimatedStyle(() => ({ opacity: 1 - leave.get() }));
  const group = useAnimatedStyle(() => ({ transform: reduced ? [] : [{ translateY: -72 * leave.get() }, { scale: 1 - 0.15 * leave.get() }] }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: label.get(), transform: [{ translateY: reduced ? 0 : 8 * (1 - label.get()) }] }));
  let order = 0;
  const days = week?.days ?? Array.from({ length: 7 }, (_, index) => ({ date: String(index), today: false, sessionsBefore: 0 }));
  const accessible = count !== null ? `${count} ${count === 1 ? 'entreno' : 'entrenos'} esta semana` : 'Tu semana';
  return <Animated.View style={[StyleSheet.absoluteFill, styles.root, root]} testID="finish-week-intro">
    <Pressable accessibilityRole="button" accessibilityLabel={accessible} accessibilityHint="Tocá para seguir" onPress={go} style={styles.center}>
      <Animated.View style={[styles.group, group]}>
        <View style={styles.week}>{days.map((day, index) => {
          const trained = day.sessionsBefore > 0;
          const fillAt = start === null ? null : day.today ? start + (reduced ? fast : past * STEP_MS + 120) : trained ? start + (reduced ? 0 : order++ * STEP_MS) : null;
          return <Day key={day.date} index={index} trained={trained} today={day.today} fillAt={fillAt} reduced={reduced} />;
        })}</View>
        <Animated.View style={[styles.labelWrap, labelStyle]}>{count !== null ? <Count value={count} bump={bump} /> : <AppText variant="title2"> </AppText>}</Animated.View>
      </Animated.View>
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  root: { backgroundColor: hero.heroFrom },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  group: { alignItems: 'center', gap: brandTokens.space.md, alignSelf: 'stretch' },
  week: { flexDirection: 'row', gap: brandTokens.space.sm },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26,23,16,0.08)' },
  today: { borderWidth: 2, borderColor: hero.accent, backgroundColor: 'transparent' },
  fill: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: hero.accent },
  ripple: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, borderColor: hero.accent },
  labelWrap: { alignSelf: 'stretch', alignItems: 'center' },
  countRow: { alignSelf: 'stretch' },
  count: { color: hero.onHero, textAlign: 'center', paddingHorizontal: brandTokens.space.xl },
});
