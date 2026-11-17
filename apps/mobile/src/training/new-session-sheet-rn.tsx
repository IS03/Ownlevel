import { BottomSheet, Host, RNHostView } from '@expo/ui';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppIcon, AppText, InlineUnavailable, SkeletonBlock, radius, spacing, useOwnlevelTheme, type AppIconName } from '@/design-system';

import { NEW_SESSION_COPY as COPY, routineDetail, type NewSessionRoutine, type NewSessionSheetProps } from './new-session-sheet.types';

// The universal sheet reports user dismissals only: after a programmatic close, wait for its animation.
const DISMISS_MS = 350;

function Row({ icon, onPress, subtitle, testID, title, trailing }: {
  icon: AppIconName; onPress: () => void; subtitle: string; testID?: string; title: string; trailing?: string | null;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <Pressable accessibilityLabel={`${title}, ${subtitle}${trailing ? `, ${trailing}` : ''}`} accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]} testID={testID}>
      <View style={[styles.icon, { backgroundColor: colors.brandSubtle }]}><AppIcon color={colors.primary} name={icon} size={17} /></View>
      <View style={styles.flex}>
        <AppText numberOfLines={1} variant="body">{title}</AppText>
        <AppText muted numberOfLines={1} numeric variant="footnote">{subtitle}</AppText>
      </View>
      {trailing ? <View style={[styles.chip, { backgroundColor: colors.surfaceRaised }]}><AppText muted variant="caption">{trailing}</AppText></View> : null}
      <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
    </Pressable>
  );
}

function Recommended({ doneToday, onPress, routine, weekday }: { doneToday: boolean; onPress: () => void; routine: NewSessionRoutine; weekday: string }) {
  const { colors } = useOwnlevelTheme();
  const chips = [doneToday ? COPY.doneToday : COPY.mostRepeated, routineDetail(routine)];
  return (
    <Pressable accessibilityHint="Empieza esta rutina" accessibilityLabel={`Recomendada para ${weekday}: ${routine.name}. ${chips.join('. ')}`} accessibilityRole="button"
      onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]} testID="new-session-recommended">
      <AppText style={[styles.overline, { color: colors.onPrimary }]} variant="caption">Recomendada para {weekday}</AppText>
      <AppText numberOfLines={1} style={{ color: colors.onPrimary }} variant="title1">{routine.name}</AppText>
      <View style={styles.chips}>
        {chips.map(chip => <View key={chip} style={styles.cardChip}><AppText numeric style={{ color: colors.onPrimary }} variant="caption">{chip}</AppText></View>)}
      </View>
    </Pressable>
  );
}

function Header({ onBack, onClose, subtitle, title }: { onBack?: () => void; onClose: () => void; subtitle?: string; title: string }) {
  const { colors } = useOwnlevelTheme();
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityLabel="Volver a Nueva sesión" accessibilityRole="button" hitSlop={8} onPress={onBack} style={[styles.round, { backgroundColor: colors.surfaceRaised }]} testID="new-session-back">
          <AppIcon color={colors.text} name="chevronLeft" size={15} />
        </Pressable>
      ) : null}
      <View style={styles.flex}>
        <AppText accessibilityRole="header" variant="title2">{title}</AppText>
        {subtitle ? <AppText muted variant="footnote">{subtitle}</AppText> : null}
      </View>
      <Pressable accessibilityLabel="Cerrar" accessibilityRole="button" hitSlop={8} onPress={onClose} style={[styles.round, { backgroundColor: colors.surfaceRaised }]} testID="new-session-close">
        <AppIcon color={colors.text} name="close" size={15} />
      </Pressable>
    </View>
  );
}

export function NewSessionSheetContent({ onClose, onCreateRoutine, onFree, onPage, onPickRoutine, page, recommendation, routines }: Omit<NewSessionSheetProps, 'open' | 'onDismissed'>) {
  if (page === 'routines') {
    return (
      <View style={styles.content} testID="new-session-routines">
        <Header onBack={() => onPage('start')} onClose={onClose} subtitle={COPY.routinesSubtitle} title={COPY.chooseTitle} />
        {routines.status === 'loading' ? <SkeletonBlock height={64} /> : null}
        {routines.status === 'unavailable' ? <InlineUnavailable message={COPY.routinesUnavailable} /> : null}
        {routines.status === 'ok' && routines.items.length === 0 ? (
          <Row icon="plus" onPress={onCreateRoutine} subtitle={COPY.noRoutines} testID="new-session-create" title={COPY.createRoutine} />
        ) : null}
        {routines.status === 'ok' ? routines.items.map(routine => (
          <Row icon="dumbbell" key={routine.id} onPress={() => onPickRoutine(routine.id)} subtitle={routineDetail(routine)} testID={`new-session-routine-${routine.id}`}
            title={routine.name} trailing={routine.lastDone} />
        )) : null}
      </View>
    );
  }
  return (
    <View style={styles.content} testID="new-session-start">
      <Header onClose={onClose} title={COPY.title} />
      {recommendation.status === 'ok' ? (
        <Recommended doneToday={recommendation.doneToday} onPress={() => onPickRoutine(recommendation.routine.id)} routine={recommendation.routine} weekday={recommendation.weekday} />
      ) : null}
      <Row icon="routines" onPress={() => onPage('routines')} subtitle={COPY.chooseSubtitle} testID="new-session-choose" title={COPY.chooseTitle} />
      <Row icon="plus" onPress={onFree} subtitle={COPY.freeSubtitle} testID="new-session-free" title={COPY.freeTitle} />
    </View>
  );
}

/** Android, iOS fallback and tests: the universal sheet with the same two pages. */
export function NewSessionSheetRN({ onDismissed, open, ...props }: NewSessionSheetProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const wasOpen = useRef(open);
  // A new callback every render must not cancel the pending "dismissed" (the timer depends on open only).
  const dismissed = useRef(onDismissed);
  useEffect(() => { dismissed.current = onDismissed; });
  useEffect(() => {
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closing) return undefined;
    const timer = setTimeout(() => dismissed.current(), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [open]);
  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} style={styles.host}>
      <BottomSheet containerColor={colors.background} contentPadding={0} isPresented={open} onDismiss={props.onClose} showDragIndicator snapPoints={['half', 'full']} testID="new-session-sheet">
        <RNHostView>
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll} style={{ backgroundColor: colors.background }}>
            <NewSessionSheetContent {...props} />
          </ScrollView>
        </RNHostView>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, gap: spacing.xs, padding: spacing.lg },
  cardChip: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chip: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  content: { gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs },
  host: { height: 0, position: 'absolute', width: 0 },
  icon: { alignItems: 'center', borderRadius: radius.full, height: 36, justifyContent: 'center', width: 36 },
  overline: { opacity: 0.8, textTransform: 'uppercase' },
  round: { alignItems: 'center', borderRadius: radius.full, height: 32, justifyContent: 'center', width: 32 },
  row: { alignItems: 'center', borderRadius: radius.button, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 60, padding: spacing.md },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
