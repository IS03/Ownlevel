import { useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  BottomSheet, Button, Group, HStack, Host, Image, NavigationDestination, NavigationStack, ScrollView, Spacer, Text, Toolbar, ToolbarItem, VStack, ZStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits, accessibilityLabel, background, containerBackground, contentShape, font, foregroundStyle, frame, lineLimit, navigationBarTitleDisplayMode, navigationTitle,
  onGeometryChange, onTapGesture, padding, presentationDetents, presentationDragIndicator, shapes, type PresentationDetent,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useOwnlevelTheme } from '@/design-system';

import { NEW_SESSION_COPY as COPY, routineDetail, type NewSessionRoutine, type NewSessionSheetProps } from './new-session-sheet.types';

const FILL = 10_000;
// The sheet fits its content (no empty half or full sheet): inline navigation bar plus the
// content, estimated until SwiftUI measures it.
const NAV_BAR = 56;
const ESTIMATE = { plain: 176, recommended: 311 };
type DetentKey = 'fit' | 'large';
type Palette = { border: string; muted: string; onPrimary: string; primary: string; soft: string; surface: string; text: string };

function Row({ icon, onPress, palette, subtitle, title, trailing }: {
  icon: SFSymbol; onPress?: () => void; palette: Palette; subtitle: string; title: string; trailing?: string | null;
}) {
  const tap = onPress ? [contentShape(shapes.rectangle()), onTapGesture(onPress), accessibilityAddTraits(['isButton'] as const)] : [];
  return (
    <HStack modifiers={[padding({ all: 14 }), frame({ maxWidth: FILL }), background(palette.surface, shapes.roundedRectangle({ cornerRadius: 14 })), ...tap,
      accessibilityLabel(`${title}, ${subtitle}${trailing ? `, ${trailing}` : ''}`)]} spacing={12}>
      <ZStack modifiers={[frame({ height: 36, width: 36 }), background(palette.soft, shapes.circle())]}>
        <Image color={palette.primary} size={16} systemName={icon} />
      </ZStack>
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 17 }), foregroundStyle(palette.text), lineLimit(1)]}>{title}</Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(palette.muted), lineLimit(1)]}>{subtitle}</Text>
      </VStack>
      <Spacer />
      {trailing ? <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(palette.muted), padding({ horizontal: 10, vertical: 4 }),
        background(palette.soft, shapes.capsule())]}>{trailing}</Text> : null}
      <Image color={palette.muted} size={13} systemName="chevron.right" />
    </HStack>
  );
}

function Recommended({ doneToday, onPress, palette, routine, weekday }: { doneToday: boolean; onPress: () => void; palette: Palette; routine: NewSessionRoutine; weekday: string }) {
  const chips = [doneToday ? COPY.doneToday : COPY.mostRepeated, routineDetail(routine)];
  return (
    <VStack alignment="leading" modifiers={[padding({ all: 18 }), frame({ alignment: 'leading', maxWidth: FILL }), background(palette.primary, shapes.roundedRectangle({ cornerRadius: 20 })),
      contentShape(shapes.rectangle()), onTapGesture(onPress), accessibilityAddTraits(['isButton'] as const),
      accessibilityLabel(`Recomendada para ${weekday}: ${routine.name}. ${chips.join('. ')}`)]} spacing={6}>
      <HStack spacing={8}>
        <Image color={palette.onPrimary} size={13} systemName="sparkles" />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(palette.onPrimary)]}>{`RECOMENDADA PARA ${weekday.toUpperCase()}`}</Text>
      </HStack>
      <Text modifiers={[font({ size: 28, weight: 'bold' }), foregroundStyle(palette.onPrimary), lineLimit(1)]}>{routine.name}</Text>
      <HStack spacing={6}>
        {chips.map(chip => (
          <Text key={chip} modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(palette.onPrimary), padding({ horizontal: 10, vertical: 5 }),
            background('rgba(255,255,255,0.18)', shapes.capsule()), lineLimit(1)]}>{chip}</Text>
        ))}
      </HStack>
    </VStack>
  );
}

/**
 * iOS: a native sheet (detents, grabber, swipe down) with a SwiftUI NavigationStack, so
 * "Elegir rutina" pushes with the system transition and back button; the close button is
 * the system's (Liquid Glass on iOS 26).
 */
export function NewSessionSheet({ onClose, onCreateRoutine, onDismissed, onFree, onPage, onPickRoutine, open, page, recommendation, routines }: NewSessionSheetProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const palette: Palette = { border: colors.border, muted: colors.textMuted, onPrimary: colors.onPrimary, primary: colors.primary, soft: colors.brandSubtle,
    surface: colors.surface, text: colors.text };
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [userDetent, setUserDetent] = useState<DetentKey | null>(null);
  const [shownPage, setShownPage] = useState(page);
  if (shownPage !== page) {
    setShownPage(page);
    setUserDetent(null);
  }
  const fit = { height: NAV_BAR + (contentHeight ?? (recommendation.status === 'ok' ? ESTIMATE.recommended : ESTIMATE.plain)) };
  // One height for both pages, the Nueva sesión one: pushing "Elegir rutina" never resizes the sheet
  // (the list scrolls), and at this height iOS keeps the Liquid Glass sheet (taller ones turn opaque).
  const shared = fit;
  const selected = userDetent === 'large' ? 'large' : shared;
  const onDetent = (detent: PresentationDetent) => setUserDetent(detent === 'large' ? 'large' : 'fit');
  // Measured only while Nueva sesión is showing: during the push its page is re-laid out off screen
  // and reported taller, which made the sheet jump up on "Elegir rutina".
  const onContent = ({ height }: { height: number }) => {
    const value = Math.ceil(height);
    if (page === 'start' && value > 0 && value !== contentHeight) setContentHeight(value);
  };
  const close = (
    <Toolbar.Content>
      <ToolbarItem placement="topBarTrailing"><Button onPress={onClose} role="close" /></ToolbarItem>
    </Toolbar.Content>
  );
  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} style={styles.host}>
      <BottomSheet isPresented={open} onDismiss={onDismissed} onIsPresentedChange={presented => { if (!presented) onClose(); }}>
        <Group modifiers={[presentationDetents([shared, 'large'], { onSelectionChange: onDetent, selection: selected }), presentationDragIndicator('visible')]}>
          <NavigationStack onPathChange={path => onPage(path.includes('routines') ? 'routines' : 'start')} path={page === 'routines' ? ['routines'] : []}>
            <Toolbar>
              <ScrollView showsIndicators={false} modifiers={[navigationTitle(COPY.title), navigationBarTitleDisplayMode('inline'), containerBackground('clear', 'navigation')]}>
                <VStack alignment="leading" modifiers={[padding({ bottom: 24, horizontal: 20, top: 4 }), onGeometryChange(onContent)]} spacing={12}>
                  {recommendation.status === 'ok' ? (
                    <Recommended doneToday={recommendation.doneToday} onPress={() => onPickRoutine(recommendation.routine.id)} palette={palette}
                      routine={recommendation.routine} weekday={recommendation.weekday} />
                  ) : null}
                  {/* Pushed from JS (not a NavigationLink): the push and the taller detent then start in the same update, instead of growing after the push. */}
                  <Row icon="list.bullet" onPress={() => onPage('routines')} palette={palette} subtitle={COPY.chooseSubtitle} title={COPY.chooseTitle} />
                  <Row icon="plus" onPress={onFree} palette={palette} subtitle={COPY.freeSubtitle} title={COPY.freeTitle} />
                </VStack>
              </ScrollView>
              {close}
            </Toolbar>
            <NavigationDestination value="routines">
              <Toolbar>
                <ScrollView showsIndicators={false} modifiers={[navigationTitle(COPY.chooseTitle), navigationBarTitleDisplayMode('inline'), containerBackground('clear', 'navigation')]}>
                  <VStack alignment="leading" modifiers={[padding({ bottom: 24, horizontal: 20, top: 4 })]} spacing={10}>
                    <Text modifiers={[font({ size: 15 }), foregroundStyle(palette.muted)]}>{COPY.routinesSubtitle}</Text>
                    {routines.status === 'unavailable' ? <Text modifiers={[font({ size: 15 }), foregroundStyle(palette.muted)]}>{COPY.routinesUnavailable}</Text> : null}
                    {routines.status === 'ok' && routines.items.length === 0
                      ? <Row icon="plus" onPress={onCreateRoutine} palette={palette} subtitle={COPY.noRoutines} title={COPY.createRoutine} /> : null}
                    {routines.status === 'ok' ? routines.items.map(routine => (
                      <Row icon="dumbbell" key={routine.id} onPress={() => onPickRoutine(routine.id)} palette={palette} subtitle={routineDetail(routine)}
                        title={routine.name} trailing={routine.lastDone} />
                    )) : null}
                  </VStack>
                </ScrollView>
                {close}
              </Toolbar>
            </NavigationDestination>
          </NavigationStack>
        </Group>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({ host: { height: 0, position: 'absolute', width: 0 } });
