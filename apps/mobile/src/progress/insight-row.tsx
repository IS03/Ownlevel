import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { dismissProgressInsight, fetchProgressInsight } from '@/api/progress-insight';
import { AppIcon, AppText, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { answerText } from './influence-model';
import { useProgressRange } from './progress-range-context';
import { useProgressResource } from './use-progress-resource';

/** T6 · one neutral insight on top of Lo destacado. Optional: nothing shows while loading, when there is none or if the read fails. */
export function InsightRow() {
  const router = useRouter();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { state, setState, today } = useProgressRange();
  const load = useCallback((c: NonNullable<typeof client>, s: AbortSignal) => fetchProgressInsight(c, s), []);
  const { data, refresh } = useProgressResource(client, `insight|${today}`, load);
  const [hidden, setHidden] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const insight = data?.insight;
  if (!insight || hidden === insight.key) return null;
  const { data: reading, key } = insight;
  const open = () => {
    haptics.selection();
    // The insight was computed over the last 3 months: the answer opens on that same period.
    setState({ ...state, unit: '3m', anchor: today, custom: null });
    router.push({ pathname: '/(tabs)/progress/influence/answer', params: { ...reading.definition, lag: String(reading.definition.lag), key } });
  };
  const dismiss = async () => {
    if (!client || busy) return;
    setBusy(true); setError(false);
    const result = await dismissProgressInsight(client, key);
    setBusy(false);
    if (result.status === 'ok') { haptics.selection(); setHidden(key); void refresh(); } else setError(true);
  };
  return <View style={styles.row} testID="progress-insight">
    <AppIcon name="sparkles" color={colors.primary} size={20} />
    <View style={styles.text}>
      <AppText variant="headline">Notamos algo en tus datos</AppText>
      <AppText muted numeric variant="footnote">{answerText(reading)} Pasó en {reading.current.pairs} días de los últimos 3 meses.</AppText>
      {error ? <AppText muted variant="footnote">No pudimos guardarlo. Probá de nuevo.</AppText> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={open} testID="progress-insight-open">
          <AppText variant="headline" style={{ color: colors.primary }}>Ver</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={8} disabled={busy} onPress={() => void dismiss()} testID="progress-insight-dismiss">
          <AppText muted variant="headline">No me interesa</AppText>
        </Pressable>
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  text: { flex: 1, gap: 4 },
  actions: { flexDirection: 'row', gap: spacing.lg, paddingTop: 4, minHeight: 44, alignItems: 'center' },
});
