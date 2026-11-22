import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { layout, motion, palette } from './brand';
import { GlassSurface } from './glass';
import { pressedStyle, useReduceMotion } from './motion';
import { AppText } from './primitives';
import { radius, spacing } from './tokens';
import { useOwnlevelTheme } from './theme';

// Selection controls: neutral at rest, accentSoft + accent outline when selected.
// No green/red meaning; selection never encodes good/bad.

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** radio = one of a group (default); toggle = independent on/off. */
  kind?: 'radio' | 'toggle';
};

/** Chip: height 34, radius 10 (IDENTIDAD.md § Sistema). */
export function Chip({ accessibilityLabel, disabled = false, kind = 'radio', label, onPress, selected }: ChipProps) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={kind === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      hitSlop={(layout.minTouch - layout.chipHeight) / 2}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
          borderColor: selected ? colors.primary : 'transparent',
        },
        disabled && styles.disabled,
        pressedStyle(pressed && !disabled, reduceMotion),
      ]}
    >
      <AppText style={selected ? styles.selectedText : null} variant="subheadline">{label}</AppText>
    </Pressable>
  );
}

export type SelectionOption<T extends string> = { value: T; label: string };

type GroupProps<T extends string> = {
  accessibilityLabel: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: readonly SelectionOption<T>[];
  value: T | null;
};

/** Single choice as chips (wraps on small screens). */
export function ChipGroup<T extends string>({ accessibilityLabel, disabled, onChange, options, value }: GroupProps<T>) {
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="radiogroup" style={styles.group}>
      {options.map(option => (
        <Chip key={option.value} disabled={disabled} label={option.label} onPress={() => onChange(option.value)} selected={option.value === value} />
      ))}
    </View>
  );
}

/** Single choice among 2–4 short options in one line (e.g. Sistema / Claro / Oscuro). */
/** The track is glass too, tinted with the raised sand (light) or raised grey (dark) at 55 %, so it still reads as a track. */
const trackTint = (hex: string) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},0.55)`;
/**
 * The selection is a Liquid Glass thumb (glass is for controls only) that slides to the chosen option with the brand
 * spring; with Reduce Motion it moves at once. Without Liquid Glass (older iOS, Reduce Transparency, Android) the thumb is
 * the brand surface, as before. The thumb sits by percentage, so the first frame already shows the selection (no measuring).
 */
export function SegmentedControl<T extends string>({ accessibilityLabel, disabled = false, onChange, options, value }: GroupProps<T>) {
  const { colors, isDark } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const index = options.findIndex(option => option.value === value);
  const share = 100 / Math.max(1, options.length);
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="radiogroup" style={disabled && styles.disabled}>
    <GlassSurface style={styles.segmented} tint={trackTint(palette[isDark ? 'dark' : 'light'].elevated)}>
      <View style={styles.segmentRow}>
        {index >= 0 ? (
          <Animated.View layout={reduced ? undefined : LinearTransition.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness).mass(motion.spring.mass)}
            pointerEvents="none" style={[styles.thumb, { left: `${index * share}%`, width: `${share}%` }]} testID="segmented-thumb">
            <GlassSurface style={[styles.thumbGlass, { borderColor: colors.fieldBorder }]} />
          </Animated.View>
        ) : null}
        {options.map(option => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => { if (!selected) onChange(option.value); }}
              style={styles.segment}
            >
              <AppText muted={!selected} style={selected ? styles.selectedText : null} variant="subheadline">{option.label}</AppText>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: radius.chip,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: layout.chipHeight,
    paddingHorizontal: spacing.md,
  },
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segmented: { borderRadius: radius.pill, padding: spacing.xs },
  segmentRow: { flexDirection: 'row' },
  thumb: { position: 'absolute', top: 0, bottom: 0 },
  thumbGlass: { flex: 1, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  segment: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: layout.minTouch - spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  selectedText: { fontWeight: '600' },
  disabled: { opacity: 0.45 },
});
