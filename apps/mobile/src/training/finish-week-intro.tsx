import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { AppText, brandTokens, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import type { FinishWeek } from './finish-week';

// PW3 · right after the save animation, on the same champagne: the week, today fills, "N entrenos esta semana", and the
// week leaves. It never stays in the receipt. Reduce Motion: fades only. A tap skips it.
const hero = brandTokens.palette.light;
const DOT = 32;
const { fast, base } = brandTokens.motion.duration;

function Day({ trained, today, fill }: { trained: boolean; today: boolean; fill: SharedValue<number> }) {
  const inner = useAnimatedStyle(() => ({ transform: [{ scale: fill.get() }], opacity: fill.get() }));
  if (!today) return <View style={[styles.dot, { backgroundColor: trained ? hero.accent : 'rgba(26,23,16,0.12)' }]} />;
  return <View style={[styles.dot, styles.today, { backgroundColor: trained ? hero.accent : 'transparent' }]}>
    <Animated.View style={[styles.fill, inner]} />
  </View>;
}

export function FinishWeekIntro({ week, onDone }: { week: FinishWeek; onDone: () => void }) {
  const reduced = useReduceMotion();
  const appear = useSharedValue(0), fill = useSharedValue(0), leave = useSharedValue(0);
  const [filled, setFilled] = useState(false);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    appear.set(withTiming(1, { duration: fast }));
    const fillAt = reduced ? fast : 500, leaveAt = reduced ? 1000 : 1300;
    const timers = [
      setTimeout(() => {
        setFilled(true); triggerHaptic('setComplete');
        fill.set(reduced ? withTiming(1, { duration: fast }) : withSpring(1, brandTokens.motion.spring));
      }, fillAt),
      setTimeout(() => leave.set(withTiming(1, { duration: base })), leaveAt),
      setTimeout(() => done.current(), leaveAt + base),
    ];
    return () => timers.forEach(clearTimeout);
  }, [appear, fill, leave, reduced]);
  const root = useAnimatedStyle(() => ({ opacity: 1 - leave.get() }));
  const row = useAnimatedStyle(() => ({ opacity: appear.get(), transform: [{ translateY: reduced ? 0 : -48 * leave.get() }] }));
  const label = useAnimatedStyle(() => ({ opacity: fill.get(), transform: [{ translateY: reduced ? 0 : 8 * (1 - fill.get()) - 48 * leave.get() }] }));
  const count = `${week.sessions} ${week.sessions === 1 ? 'entreno' : 'entrenos'} esta semana`;
  return <Animated.View style={[StyleSheet.absoluteFill, styles.root, root]} testID="finish-week-intro">
    <Pressable accessibilityRole="button" accessibilityLabel={count} accessibilityHint="Tocá para seguir" onPress={() => done.current()} style={styles.center}>
      <Animated.View style={[styles.week, row]}>
        {week.days.map(day => <Day key={day.date} today={day.today} trained={day.sessionsBefore > 0} fill={fill} />)}
      </Animated.View>
      <Animated.View style={label}>
        <AppText numeric variant="title2" style={styles.count} testID="finish-week-count">{filled ? count : ' '}</AppText>
      </Animated.View>
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  root: { backgroundColor: hero.heroFrom },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: brandTokens.space.md },
  week: { flexDirection: 'row', gap: brandTokens.space.sm },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 2, borderColor: hero.accent },
  fill: { width: DOT - 4, height: DOT - 4, borderRadius: (DOT - 4) / 2, backgroundColor: hero.accent },
  count: { color: hero.onHero },
});
