import { Pressable, StyleSheet, View } from 'react-native';
import type { TrainingHistorySession } from '@/api/training-history';
import { AppIcon, AppText, Button, InlineUnavailable, ScrollScreen, SkeletonBlock, Surface, UnavailableState, radius, sizes, spacing, useOwnlevelTheme } from '@/design-system';
import { trainingRoutineColor } from './routine-colors';
import { plural, sessionRowTiming, sessionTotals, volumeLabel } from './history-model';
import type { ReadState } from './use-read';

/** One completed session (HI1): routine color strip (none = no strip), start · duration, series and volume on the right. */
export function SessionRow({ session, onPress, divided }: { session: TrainingHistorySession; onPress: () => void; divided?: boolean }) {
  const { colors, isDark } = useOwnlevelTheme();
  const timing = sessionRowTiming(session), volume = volumeLabel(session.volumeKg);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${session.routineName}. ${timing}. ${sessionTotals(session)}`}
    testID={`history-session-${session.id}`} onPress={onPress}
    style={({ pressed }) => [styles.sessionRow, pressed ? { backgroundColor: colors.surfaceRaised } : null]}>
    {divided ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
    <View style={[styles.identity, { backgroundColor: session.routineColor ? trainingRoutineColor(session.routineColor, isDark) : 'transparent' }]} />
    <View style={styles.flex}>
      <AppText numberOfLines={1} variant="headline">{session.routineName}</AppText>
      <AppText muted numeric numberOfLines={1} variant="footnote">{timing}</AppText>
    </View>
    <View style={styles.totals}>
      <AppText numeric variant="subheadline">{plural(session.completedSets, 'serie')}</AppText>
      {volume ? <AppText muted numeric variant="footnote">{volume}</AppText> : null}
    </View>
    <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
  </Pressable>;
}

export function ListCard({ children }: { children: React.ReactNode }) {
  return <Surface style={styles.listCard}>{children}</Surface>;
}

export function SegmentedControl<T extends string>({ options, value, onChange, label }: {
  options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string;
}) {
  const { colors } = useOwnlevelTheme();
  return <View accessibilityLabel={label} accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
    {options.map(option => {
      const selected = option.value === value;
      return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.value)}
        style={[styles.segment, selected ? { backgroundColor: colors.surface, borderColor: colors.border } : null]}>
        <AppText style={{ color: selected ? colors.text : colors.textMuted }} variant="label">{option.label}</AppText>
      </Pressable>;
    })}
  </View>;
}

/** Loading / unavailable / not-found screens shared by history reads. Returns null when ready. */
export function ReadStateScreen<T>({ state, onRetry, notFoundTitle = 'No disponible', testID, header }: {
  state: ReadState<T>; onRetry: () => void; notFoundTitle?: string; testID: string; header?: React.ReactNode;
}) {
  if (state.status === 'ready') return null;
  return <ScrollScreen testID={`${testID}-${state.status}`}>
    {header}
    {state.status === 'loading' ? <><SkeletonBlock height={72} /><SkeletonBlock height={88} /><SkeletonBlock height={88} /></>
      : state.status === 'not_found' ? <UnavailableState title={notFoundTitle} description="Puede que se haya eliminado o que no pertenezca a tu cuenta." />
        : <UnavailableState title="No pudimos cargar los datos" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
          action={<Button label="Reintentar" onPress={onRetry} />} />}
  </ScrollScreen>;
}

export function StaleNotice({ onRetry }: { onRetry: () => void }) {
  return <Surface><InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={onRetry} /></Surface>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  listCard: { padding: 0, gap: 0, overflow: 'hidden' },
  sessionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  divider: { position: 'absolute', top: 0, left: spacing.md + 4 + spacing.md, right: 0, height: StyleSheet.hairlineWidth },
  identity: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginVertical: spacing.xs },
  totals: { alignItems: 'flex-end', gap: 2 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: sizes.touchTarget - 6, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md - 2,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
});
