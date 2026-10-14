import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { Circle, GlassEffectContainer, Grid, HStack, Host, Image, Picker, Rectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  Animation, accessibilityAddTraits, accessibilityLabel, animation, clipShape, contentShape, fixedSize, font, foregroundStyle, frame, glassEffect, monospacedDigit,
  onGeometryChange, onTapGesture, padding, pickerStyle, shapes, strokeBorder, tag,
} from '@expo/ui/swift-ui/modifiers';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import { useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { WEEKDAY_LETTERS } from '@/home/home-day';

import { shiftHubMonth } from './training-hub-data';
import { HUB_WEEKDAY_NAMES, hubMonthName } from './training-hub-dashboard';
import type { HubDayMark, HubMonthCell } from './training-hub-model';
import { TrainingWeekCalendarRN, WEEK_CALENDAR_RADIUS } from './training-week-calendar-rn';
import { MONTH_NAMES, monthKey, type TrainingWeekCalendarProps } from './training-week-calendar.types';

const FILL = 10_000; // maxWidth that fills the row (SwiftUI's .infinity)
const MONTH_ROWS = 6;
// Six-week month (letters row + 48 pt weeks, 2 pt gaps): only for the first-open estimate.
const MONTH_AREA = 18 + 2 + MONTH_ROWS * 48 + (MONTH_ROWS - 1) * 2;
// A bit longer than the close animation (0.35 s).
const CLOSE_HOLD_MS = 450;
// Before the first measure: the strip, and the month below it (top padding, header, spacing, grid).
const COLLAPSED_FALLBACK = 106;
const MONTH_EXTRA = 16 + 44 + 8 + MONTH_AREA;
// Any glass taller than this is the open month (the strip uses fixed font sizes, about 106 pt).
const OPEN_THRESHOLD = 250;

function liquidGlass(): boolean {
  try { return isGlassEffectAPIAvailable() && isLiquidGlassAvailable(); } catch { return false; }
}

function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(value => { if (alive) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduced);
    return () => { alive = false; subscription?.remove(); };
  }, []);
  return reduced;
}

const alpha = (hex: string, value: number) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${value})`;

type Palette = { halo: string; onPrimary: string; primary: string; text: string; textMuted: string; background: string; intensity?: readonly string[] };
/** History: a level paints the circle with the intensity scale; 3–4 are strong enough for the background color as text. */
const levelFill = (palette: Palette, level?: number) => palette.intensity && level ? palette.intensity[level]! : null;
const levelText = (palette: Palette, level: number | undefined, future: boolean) => future ? palette.textMuted : level && level >= 3 ? palette.background : palette.text;

/** One day of the strip: letter over a 40 pt circle (filled = trained; ring = today; halo = today trained). */
function StripDay({ index, mark, palette, selected }: { index: number; mark: HubDayMark; palette: Palette; selected: boolean }) {
  const { future, isToday, trained } = mark;
  if (palette.intensity) {
    const fill = levelFill(palette, mark.level), ring = selected ? palette.text : isToday ? palette.primary : null;
    return (
      <VStack modifiers={[frame({ maxWidth: FILL })]} spacing={8}>
        <Text modifiers={[font({ size: 13, weight: isToday ? 'bold' : 'regular' }), foregroundStyle(isToday ? palette.text : palette.textMuted)]}>{WEEKDAY_LETTERS[index]}</Text>
        <ZStack modifiers={[frame({ height: 46, width: 46 })]}>
          {fill ? <Circle modifiers={[foregroundStyle(fill), frame({ height: 40, width: 40 })]} /> : null}
          {ring ? <Circle modifiers={[strokeBorder({ color: ring, shape: 'circle', style: { lineWidth: 2 } }), frame({ height: 40, width: 40 })]} /> : null}
          <Text modifiers={[font({ size: 17, weight: 'semibold' }), monospacedDigit(), foregroundStyle(levelText(palette, mark.level, future))]}>{String(Number(mark.date.slice(8)))}</Text>
        </ZStack>
      </VStack>
    );
  }
  const number = Number(mark.date.slice(8));
  const numberColor = trained ? palette.onPrimary : future ? palette.textMuted : palette.text;
  return (
    <VStack modifiers={[frame({ maxWidth: FILL })]} spacing={8}>
      <Text modifiers={[font({ size: 13, weight: isToday ? 'bold' : 'regular' }), foregroundStyle(isToday ? palette.text : palette.textMuted)]}>{WEEKDAY_LETTERS[index]}</Text>
      <ZStack modifiers={[frame({ height: 46, width: 46 })]}>
        {isToday && trained ? <Circle modifiers={[strokeBorder({ color: palette.halo, shape: 'circle', style: { lineWidth: 3 } }), frame({ height: 46, width: 46 })]} /> : null}
        {trained ? <Circle modifiers={[foregroundStyle(palette.primary), frame({ height: 40, width: 40 })]} /> :
          isToday ? <Circle modifiers={[strokeBorder({ color: palette.text, shape: 'circle', style: { lineWidth: 2 } }), frame({ height: 40, width: 40 })]} /> : null}
        <Text modifiers={[font({ size: 17, weight: isToday && !trained ? 'bold' : 'semibold' }), monospacedDigit(), foregroundStyle(numberColor)]}>{String(number)}</Text>
      </ZStack>
    </VStack>
  );
}

function MonthDay({ cell, ready, onOpenDay, palette, weekday, selected }: {
  cell: HubMonthCell; ready: boolean; onOpenDay: (date: string) => void; palette: Palette; weekday: number; selected: boolean;
}) {
  if (palette.intensity) {
    const fill = levelFill(palette, cell.level), ring = selected ? palette.text : cell.isToday ? palette.primary : null;
    const label = `${HUB_WEEKDAY_NAMES[weekday]} ${cell.day}${cell.isToday ? ', hoy' : ''}${cell.future ? '' : `, ${!ready ? 'actividad no disponible' : cell.level ? `intensidad ${cell.level} de 4` : 'sin entrenamiento'}`}`;
    const tap = cell.future ? [] : [contentShape(shapes.rectangle()), onTapGesture(() => onOpenDay(cell.date)), accessibilityAddTraits(['isButton'])];
    return (
      <ZStack modifiers={[frame({ height: 48, maxWidth: FILL }), ...tap, accessibilityLabel(label)]}>
        {fill ? <Circle modifiers={[foregroundStyle(fill), frame({ height: 40, width: 40 })]} /> : null}
        {ring ? <Circle modifiers={[strokeBorder({ color: ring, shape: 'circle', style: { lineWidth: 2 } }), frame({ height: 40, width: 40 })]} /> : null}
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), monospacedDigit(), foregroundStyle(levelText(palette, cell.level, cell.future))]}>{String(cell.day)}</Text>
      </ZStack>
    );
  }
  const label = `${HUB_WEEKDAY_NAMES[weekday]} ${cell.day}${cell.isToday ? ', hoy' : ''}${cell.future ? '' : `, ${!ready ? 'actividad no disponible' : cell.trained ? 'entrenaste' : 'sin entrenamiento'}`}`;
  const tap = cell.future ? [] : [contentShape(shapes.rectangle()), onTapGesture(() => onOpenDay(cell.date)), accessibilityAddTraits(['isButton'])];
  return (
    <VStack modifiers={[frame({ height: 48, maxWidth: FILL }), ...tap, accessibilityLabel(label)]} spacing={3}>
      <ZStack modifiers={[frame({ height: 36, width: 36 })]}>
        {cell.isToday ? <Circle modifiers={[foregroundStyle(palette.primary), frame({ height: 36, width: 36 })]} /> : null}
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), monospacedDigit(),
          foregroundStyle(cell.isToday ? palette.onPrimary : cell.future ? palette.textMuted : palette.text)]}>{String(cell.day)}</Text>
      </ZStack>
      <Circle modifiers={[foregroundStyle(cell.trained && !cell.isToday ? palette.primary : 'clear'), frame({ height: 4, width: 4 })]} />
    </VStack>
  );
}

/**
 * iOS 26: the pinned week strip and the month are one SwiftUI view with native Liquid Glass.
 * Expanding animates the same glass shape (SwiftUI animation), so the strip grows into the
 * month instead of a second panel appearing. Older iOS or Reduce Transparency: the React
 * Native version on the brand surface.
 */
export function TrainingWeekCalendar(props: TrainingWeekCalendarProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  const reduceTransparency = useReduceTransparency();
  const { expanded, marks, month, monthCells, monthStatus, onCollapse, onCollapsedHeight, onExpand, onMonth, onOpenDay, years, intensity, selected = null } = props;
  // The month/year wheel always starts closed when the calendar opens again.
  const [picking, setPicking] = useState(false);
  const [wasExpanded, setWasExpanded] = useState(expanded);
  // React Native sizes the host, never the content: a host that follows the content arrives a
  // frame late, and SwiftUI centers content that doesn't match it (the "preload" jump). The host
  // grows before the glass opens and shrinks only after the close animation; SwiftUI's container
  // always takes exactly the host's height and keeps the glass at the top.
  const [glass, setGlass] = useState<{ collapsed: number | null; open: number | null }>({ collapsed: null, open: null });
  const [closing, setClosing] = useState(false);
  if (wasExpanded !== expanded) {
    setWasExpanded(expanded);
    setPicking(false);
    setClosing(!expanded);
  }
  useEffect(() => {
    if (!closing) return undefined;
    const timer = setTimeout(() => setClosing(false), CLOSE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [closing]);
  if (!liquidGlass() || reduceTransparency) return <TrainingWeekCalendarRN {...props} />;

  const palette: Palette = { halo: alpha(colors.primary, 0.28), onPrimary: colors.onPrimary, primary: colors.primary, text: colors.text, textMuted: colors.textMuted, background: colors.background, intensity };
  const motion = reduceMotion ? Animation.easeInOut({ duration: 0.2 }) : Animation.smooth({ duration: 0.35 });
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  // Only the month's own weeks (no empty sixth row); the wheels take the same height.
  const monthArea = 18 + 2 + monthCells.length * 48 + (monthCells.length - 1) * 2;
  // Layout size (the target, not the animated frame), measured on the glass itself.
  const onGlassGeometry = ({ height }: { height: number }) => {
    const value = Math.round(height * 2) / 2;
    if (value <= 0) return;
    const key = value > OPEN_THRESHOLD ? 'open' : 'collapsed';
    if (glass[key] === value) return;
    setGlass(current => ({ ...current, [key]: value }));
    if (key === 'collapsed') onCollapsedHeight?.(value);
  };
  const collapsedHeight = glass.collapsed ?? COLLAPSED_FALLBACK;
  const hostHeight = expanded || closing ? glass.open ?? collapsedHeight + MONTH_EXTRA : collapsedHeight;
  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} style={[styles.host, { height: hostHeight }]} testID="training-week-calendar">
      {/* minHeight 0 pins the container to the host's height: the glass stays at the top even when the sizes differ for a frame. */}
      <GlassEffectContainer modifiers={[frame({ alignment: 'top', maxHeight: FILL, minHeight: 0 })]}>
        <VStack modifiers={[padding({ horizontal: 8, vertical: 12 }), frame({ maxWidth: FILL }),
          glassEffect({ glass: { interactive: true, variant: 'regular' }, cornerRadius: WEEK_CALENDAR_RADIUS, shape: 'roundedRectangle' }),
          fixedSize({ horizontal: false, vertical: true }), onGeometryChange(onGlassGeometry),
          animation(motion, expanded), animation(motion, monthCells.length)]} spacing={0}>
          <HStack modifiers={[contentShape(shapes.rectangle()), onTapGesture(expanded ? onCollapse : onExpand), accessibilityAddTraits(['isButton']),
            accessibilityLabel(expanded ? 'Semana, cerrar calendario' : 'Semana, abrir calendario')]} spacing={0}>
            {marks.map((mark, index) => <StripDay index={index} key={mark.date} mark={mark} palette={palette} selected={selected === mark.date} />)}
          </HStack>
          {expanded ? (
            <VStack modifiers={[padding({ horizontal: 8, top: 16 })]} spacing={8}>
              {/* Fixed height: hiding the arrows while picking must not move the title. */}
              <HStack modifiers={[frame({ height: 44 })]} spacing={4}>
                <HStack modifiers={[contentShape(shapes.rectangle()), onTapGesture(() => setPicking(value => !value)), accessibilityAddTraits(['isButton']),
                  accessibilityLabel(`${hubMonthName(month, true)}, elegir mes y año`)]} spacing={6}>
                  <Text modifiers={[font({ size: 17, weight: 'semibold' }), monospacedDigit(), foregroundStyle(palette.text)]}>{hubMonthName(month, true)}</Text>
                  <Image color={colors.primary} size={13} systemName={picking ? 'chevron.down' : 'chevron.right'} />
                </HStack>
                <Spacer />
                {picking ? null : (
                  <>
                    <Image color={colors.primary} modifiers={[frame({ height: 44, width: 40 }), contentShape(shapes.rectangle()), onTapGesture(() => onMonth(shiftHubMonth(month, -1))),
                      accessibilityLabel('Mes anterior'), accessibilityAddTraits(['isButton'])]} size={17} systemName="chevron.left" />
                    <Image color={colors.primary} modifiers={[frame({ height: 44, width: 40 }), contentShape(shapes.rectangle()), onTapGesture(() => onMonth(shiftHubMonth(month, 1))),
                      accessibilityLabel('Mes siguiente'), accessibilityAddTraits(['isButton'])]} size={17} systemName="chevron.right" />
                  </>
                )}
              </HStack>
              {/* Swapped at once, not faded: any fade inside Liquid Glass is rendered blurred (it looked
                  stuck). Both take the same height, so the glass doesn't move either. */}
              {picking ? (
                <HStack modifiers={[frame({ height: monthArea })]} spacing={0}>
                  <Picker modifiers={[pickerStyle('wheel'), frame({ maxWidth: FILL })]} onSelectionChange={(value: number) => onMonth(monthKey(year, value))} selection={monthNumber}>
                    {MONTH_NAMES.map((name, index) => <Text key={name} modifiers={[tag(index + 1)]}>{name}</Text>)}
                  </Picker>
                  <Picker modifiers={[pickerStyle('wheel'), frame({ maxWidth: FILL })]} onSelectionChange={(value: number) => onMonth(monthKey(value, monthNumber))} selection={year}>
                    {years.map(value => <Text key={value} modifiers={[tag(value)]}>{String(value)}</Text>)}
                  </Picker>
                </HStack>
              ) : (
                <Grid horizontalSpacing={0} modifiers={[frame({ alignment: 'top', height: monthArea })]} verticalSpacing={2}>
                  <Grid.Row>
                    {WEEKDAY_LETTERS.map((letter, index) => (
                      <Text key={index} modifiers={[font({ size: 13 }), foregroundStyle(palette.textMuted), frame({ maxWidth: FILL })]}>{letter}</Text>
                    ))}
                  </Grid.Row>
                  {monthCells.map((week, rowIndex) => (
                    <Grid.Row key={rowIndex}>
                      {week.map((cell, weekday) => cell
                        ? <MonthDay cell={cell} key={cell.date} onOpenDay={onOpenDay} palette={palette} ready={monthStatus === 'ready'} selected={selected === cell.date} weekday={weekday} />
                        : <Spacer key={`empty-${weekday}`} modifiers={[frame({ height: 48, maxWidth: FILL })]} />)}
                    </Grid.Row>
                  ))}
                </Grid>
              )}
              {monthStatus === 'unavailable' ? (
                <Text modifiers={[font({ size: 13 }), foregroundStyle(palette.textMuted)]}>No pudimos cargar los días entrenados de este mes.</Text>
              ) : intensity && !picking ? (
                <HStack modifiers={[frame({ height: 20 }), accessibilityLabel('Escala de intensidad: de menos a más')]} spacing={4}>
                  <Spacer />
                  <Text modifiers={[font({ size: 12 }), foregroundStyle(palette.textMuted)]}>Menos</Text>
                  {intensity.map(color => <Rectangle key={color} modifiers={[foregroundStyle(color), frame({ height: 12, width: 12 }), clipShape('roundedRectangle', 3)]} />)}
                  <Text modifiers={[font({ size: 12 }), foregroundStyle(palette.textMuted)]}>Más</Text>
                </HStack>
              ) : null}
            </VStack>
          ) : null}
        </VStack>
      </GlassEffectContainer>
    </Host>
  );
}

const styles = StyleSheet.create({ host: { width: '100%' } });
