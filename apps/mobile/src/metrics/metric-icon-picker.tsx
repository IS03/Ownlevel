import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppIcon, radius, sizes, spacing, pressedStyle, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';
import { metricIconGroup, metricIconGroups, metricIcons, type MetricIconGroup } from '@/home/home-metric-icons';
import { SettingsSegmented } from '@/settings/native-segmented';

const GAP = spacing.sm;
/** A cell never smaller than the touch target plus a little air, so a 44 pt glyph box fits with its selection ring. */
const MIN_CELL = sizes.touchTarget + spacing.xs;

/** The columns and cell size that fill the row edge to edge, so every row (the last too) lines up with the form's margins. */
export function iconGrid(width: number): { columns: number; cell: number } {
  const columns = Math.max(4, Math.floor((width + GAP) / (MIN_CELL + GAP)));
  return { columns, cell: Math.floor((width - GAP * (columns - 1)) / columns) };
}

type Props = {
  /** The chosen icon (null = the metric's default one). */
  value: string | null;
  /** The icon shown when nothing is chosen: the picker opens on its group. */
  fallback: AppIconName;
  disabled?: boolean;
  onChange: (icon: string | null) => void;
};

/**
 * The metric's icon (#535): grouped as Actividad, Salud and Hábitos so the catalog grows without lengthening the sheet.
 * Only a chosen icon is marked (accent ring, as a selected chip); tapping it again goes back to the default one.
 */
export function MetricIconPicker({ value, fallback, disabled = false, onChange }: Props) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const [group, setGroup] = useState<MetricIconGroup>(() => metricIconGroup(value ?? fallback));
  const [width, setWidth] = useState(0);
  const cell = width ? iconGrid(width).cell : MIN_CELL;
  const shown = metricIcons.filter(icon => icon.group === group);
  return (
    <View style={{ gap: spacing.md }}>
      <SettingsSegmented accessibilityLabel="Grupo de íconos" value={group} options={metricIconGroups} onChange={setGroup} />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Ícono de la métrica"
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}
        testID="metric-icon-grid"
      >
        {shown.map(icon => {
          const selected = value === icon.key;
          return (
            <Pressable
              key={icon.key}
              accessibilityRole="radio"
              accessibilityLabel={'Ícono: ' + icon.label}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(selected ? null : icon.key)}
              style={({ pressed }) => [
                {
                  width: cell,
                  height: Math.min(cell, MIN_CELL + spacing.sm),
                  borderRadius: radius.inner,
                  borderWidth: 2,
                  borderColor: selected ? colors.primary : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
                },
                pressedStyle(pressed && !disabled, reduced),
              ]}
              testID={'metric-icon-' + icon.key}
            >
              <AppIcon name={icon.key} size={20} color={selected ? colors.primary : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
