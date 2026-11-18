import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppIcon, AppText, radius, sizes, spacing, pressedStyle, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';
import { metricIconGroups, metricIcons } from '@/home/home-metric-icons';

const GAP = spacing.sm;
/** Round cells of about 40 pt, eight to a row on a phone; each keeps a 44 pt touch area through its hit slop. */
const MIN_CELL = 38;
const SLOP = Math.max(0, Math.ceil((sizes.touchTarget - MIN_CELL) / 2));

/** The columns and cell size that fill the row edge to edge, so every row (the last too) lines up with the form's margins. */
export function iconGrid(width: number): { columns: number; cell: number } {
  const columns = Math.max(4, Math.floor((width + GAP) / (MIN_CELL + GAP)));
  return { columns, cell: Math.floor((width - GAP * (columns - 1)) / columns) };
}

type Props = {
  /** The chosen icon (null = the metric's default one). */
  value: string | null;
  /** The icon shown when nothing is chosen. */
  fallback: AppIconName;
  disabled?: boolean;
  onChange: (icon: string | null) => void;
};

/**
 * The metric's icon (#535): every icon in one grid of round cells, under its group name (Actividad, Salud, Hábitos), so the
 * chosen one is always in sight (tabs used to hide it). Only a chosen icon is filled in the accent; tapping it again goes
 * back to the default one, which shows as a ring.
 */
export function MetricIconPicker({ value, fallback, disabled = false, onChange }: Props) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const [width, setWidth] = useState(0);
  const cell = width ? iconGrid(width).cell : MIN_CELL;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Ícono de la métrica" onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={{ gap: spacing.md }} testID="metric-icon-grid">
      {metricIconGroups.map(group => (
        <View key={group.value} style={{ gap: spacing.sm }}>
          <AppText muted variant="caption" style={{ letterSpacing: 0.4, textTransform: 'uppercase' }}>{group.label}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {metricIcons.filter(icon => icon.group === group.value).map(icon => {
              const selected = value === icon.key, isDefault = value === null && icon.key === fallback;
              return (
                <Pressable
                  key={icon.key}
                  accessibilityRole="radio"
                  accessibilityLabel={'Ícono: ' + icon.label}
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  hitSlop={SLOP}
                  onPress={() => onChange(selected ? null : icon.key)}
                  style={({ pressed }) => [
                    {
                      width: cell,
                      height: cell,
                      borderRadius: radius.full,
                      borderWidth: 1.5,
                      borderColor: isDefault ? colors.primary : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? colors.primary : colors.surfaceRaised,
                    },
                    pressedStyle(pressed && !disabled, reduced),
                  ]}
                  testID={'metric-icon-' + icon.key}
                >
                  <AppIcon name={icon.key} size={18} color={selected ? colors.onPrimary : isDefault ? colors.primary : colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
