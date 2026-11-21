import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AppText, GlassSurface, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';

/** Visible strip of letters at the right edge (the list leaves this room). */
export const SIDE_INDEX_WIDTH = 20;
/** Touch area: wider than the letters, so the thumb finds the column without aiming, and still clear of the rows' «+». */
const TOUCH_WIDTH = 34;
const BUBBLE = 56;

/** The present letter closest to `index` (the next one wins a tie), or null when no letter has meals. */
export function nearestPresent(letters: readonly string[], present: ReadonlySet<string>, index: number): string | null {
  for (let step = 0; step < letters.length; step += 1) {
    const after = letters[index + step], before = letters[index - step];
    if (after !== undefined && present.has(after)) return after;
    if (before !== undefined && present.has(before)) return before;
  }
  return null;
}

/** What the native gesture calls back into: the current letters and jump, and the last letter chosen in this slide. */
class Scrub {
  private letters: readonly string[] = [];
  private present: ReadonlySet<string> = new Set();
  private onJump: (letter: string) => void = () => undefined;
  private setActive: (letter: string | null) => void = () => undefined;
  private last: string | null = null;
  update(letters: readonly string[], present: ReadonlySet<string>, onJump: (letter: string) => void, setActive: (letter: string | null) => void) {
    this.letters = letters; this.present = present; this.onJump = onJump; this.setActive = setActive;
  }
  pick(at: number) {
    const letter = nearestPresent(this.letters, this.present, at);
    if (!letter || letter === this.last) return;
    this.last = letter;
    haptics.selection();
    this.setActive(letter);
    this.onJump(letter);
  }
  release() { this.last = null; this.setActive(null); }
}

/**
 * Rápido's A–Z index, scrubbed like the iOS index: touch anywhere on the column and slide; every letter crossed jumps the
 * list, with one selection tick per letter. While the finger is down the column shows its track and a bubble next to the
 * finger says the letter, so the thumb never covers what it chose. A letter without meals lands on the closest one with
 * meals. The gesture is native (Gesture Handler): the touch is read against the column itself, not the window, so a sheet
 * still sliding in never shifts the letters. Each letter stays its own button for VoiceOver.
 */
export function SideIndex({ letters, present, render, onJump }: {
  letters: string[]; present: Set<string>; render: (letter: string, active: boolean) => ReactNode; onJump: (letter: string) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  const [active, setActive] = useState<string | null>(null);
  const top = useSharedValue(0), height = useSharedValue(0), area = useSharedValue(0), touchY = useSharedValue(0), shown = useSharedValue(0), index = useSharedValue(-1);

  // The gesture is built once per alphabet: rebuilding it mid-slide (every letter re-renders the column) would cancel the
  // finger. It reaches the current meals and jump through `scrub`, refreshed after each render.
  const [scrub] = useState(() => new Scrub());
  useEffect(() => { scrub.update(letters, present, onJump, setActive); }, [scrub, letters, present, onJump]);
  const pick = useCallback((at: number) => scrub.pick(at), [scrub]);
  const release = useCallback(() => scrub.release(), [scrub]);

  const count = letters.length;
  const duration = brandTokens.motion.duration.fast;
  const gesture = useMemo(() => {
    const at = (y: number) => {
      'worklet';
      return Math.max(0, Math.min(count - 1, Math.floor((y - top.get()) / Math.max(1, height.get() / count))));
    };
    return Gesture.Pan().minDistance(0).shouldCancelWhenOutside(false)
      .onBegin(event => {
        touchY.set(event.y);
        shown.set(withTiming(1, { duration }));
        index.set(at(event.y));
        runOnJS(pick)(index.get());
      })
      .onUpdate(event => {
        touchY.set(event.y);
        const next = at(event.y);
        if (next === index.get()) return;
        index.set(next);
        runOnJS(pick)(next);
      })
      .onFinalize(() => {
        index.set(-1);
        shown.set(withTiming(0, { duration }));
        runOnJS(release)();
      });
  }, [count, duration, height, index, pick, release, shown, top, touchY]);

  const track = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const bubble = useAnimatedStyle(() => {
    const y = Math.max(0, Math.min(area.get() - BUBBLE, touchY.get() - BUBBLE / 2));
    return { opacity: shown.get(), transform: reduceMotion ? [{ translateY: y }] : [{ translateY: y }, { scale: 0.85 + 0.15 * shown.get() }] };
  });

  return <GestureDetector gesture={gesture}>
    <Animated.View style={styles.touch} onLayout={event => { area.set(event.nativeEvent.layout.height); }}
      accessibilityLabel="Índice alfabético" testID="quick-letters">
      {/* The letters keep their natural height, centred: the touch is read against where they actually are. */}
      <View style={styles.letters} onLayout={event => { top.set(event.nativeEvent.layout.y); height.set(event.nativeEvent.layout.height); }}>
        <Animated.View pointerEvents="none" style={[styles.track, { backgroundColor: colors.surface }, track]} />
        {letters.map(letter => render(letter, letter === active))}
      </View>
      <Animated.View pointerEvents="none" style={[styles.bubble, bubble]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <GlassSurface style={styles.glass} visible={active !== null}>
          <AppText numeric variant="title1" style={{ color: colors.primary }}>{active ?? ''}</AppText>
        </GlassSurface>
      </Animated.View>
    </Animated.View>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  touch: { position: 'absolute', right: 0, top: 8, bottom: 8, width: TOUCH_WIDTH, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, top: -8, bottom: -8, borderRadius: SIDE_INDEX_WIDTH / 2 },
  letters: { alignSelf: 'flex-end', marginRight: 2, width: SIDE_INDEX_WIDTH, flexShrink: 1 },
  bubble: { position: 'absolute', top: 0, right: TOUCH_WIDTH + 12, width: BUBBLE, height: BUBBLE },
  glass: { width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
