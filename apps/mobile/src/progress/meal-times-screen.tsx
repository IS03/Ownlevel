import { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useMobileApi } from '@/api';
import { fetchProgressNutritionTiming, progressRequestKey, type ProgressNutritionTiming } from '@/api/progress';
import {
  AppIcon,
  AppText,
  Button,
  Heading,
  InlineUnavailable,
  SkeletonBlock,
  UnavailableState,
  spacing,
  useOwnlevelTheme,
} from '@/design-system';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { ProgressRow } from './progress-row';
import { useProgressResource } from './use-progress-resource';
import { TIMING_META, shareText, timingHeadline } from './meal-times-model';

function TimingContent({ data }: { data: ProgressNutritionTiming }) {
  const { colors } = useOwnlevelTheme(),
    { compareOn, compareText } = useProgressRange();
  const t = data.current,
    headline = timingHeadline(t);
  return (
    <>
      <View style={styles.headline} testID="timing-headline">
        {headline.icon ? <AppIcon name={headline.icon} color={colors.primary} size={24} /> : null}
        <View style={styles.grow}>
          <AppText numeric variant="title2">
            {headline.text}
          </AppText>
          {headline.least ? (
            <AppText numeric muted>
              {headline.least}
            </AppText>
          ) : null}
        </View>
      </View>
      {t.mealsWithTime >= 10 ? (
        <View testID="timing-bands">
          <Heading level={2}>Franjas del día</Heading>
          <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.swatch, { backgroundColor: colors.primary }]} />
            <AppText muted variant="caption">calorías</AppText>
            <View style={[styles.swatch, { backgroundColor: colors.text, opacity: 0.7 }]} />
            <AppText muted variant="caption">proteína</AppText>
          </View>
          {t.bands.map((band, index) => {
            const meta = TIMING_META[band.key],
              ref = compareOn ? data.reference?.bands[index] : null;
            const referenceText = ref
              ? `${compareText}: ${data.reference!.mealsWithTime < 10 ? `pocas comidas con hora (${data.reference!.mealsWithTime})` : `${shareText(ref.kcalShare)} · ${shareText(ref.proteinShare)}`}`
              : null;
            const label = `${meta.name}, ${meta.hours} h, calorías ${shareText(band.kcalShare)}, proteína ${shareText(band.proteinShare)}${referenceText ? `, ${referenceText}` : ''}`;
            return (
              <ProgressRow key={band.key} label={label} testID={`timing-${band.key}`}>
                <AppIcon name={meta.icon} color={colors.textMuted} />
                <View style={styles.grow}>
                  <AppText variant="label">
                    {meta.name} · {meta.hours} h
                  </AppText>
                  {/* Each share sits next to its own bar, so the pair never needs decoding. */}
                  {[
                    { value: band.kcalShare, color: colors.primary, opacity: 1 },
                    { value: band.proteinShare, color: colors.text, opacity: 0.7 },
                  ].map((bar, i) => (
                    <View key={i} style={styles.barRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <View style={[styles.track, { backgroundColor: colors.border }]}>
                        {bar.value !== null ? (
                          <View
                            style={{
                              height: 5,
                              width: `${bar.value * 100}%`,
                              backgroundColor: bar.color,
                              opacity: bar.opacity,
                            }}
                          />
                        ) : null}
                      </View>
                      <AppText numeric muted variant="caption" style={styles.share}>
                        {shareText(bar.value)}
                      </AppText>
                    </View>
                  ))}
                  {referenceText ? (
                    <AppText numeric muted variant="caption">
                      {referenceText}
                    </AppText>
                  ) : null}
                </View>
              </ProgressRow>
            );
          })}
          {t.proteinG === 0 ? (
            <AppText muted variant="caption">
              Sin proteína conocida en las comidas con hora de este período.
            </AppText>
          ) : null}
        </View>
      ) : null}
      <AppText numeric muted variant="caption">
        {t.mealsWithTime} de {t.meals} comidas con hora · hora de Córdoba
      </AppText>
    </>
  );
}
export function MealTimesScreen() {
  const { client } = useMobileApi(),
    { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const load = useCallback(
    (c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressNutritionTiming(c, query, signal, compare),
    [query, compare],
  );
  const { state, data, refresh } = useProgressResource(client, progressRequestKey(query, compare), load);
  return (
    <ProgressScroll
      title="Cuándo comés"
      testID="meal-times-screen"
      refreshControl={
        <RefreshControl
          refreshing={state.status === 'ready' && state.refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.primary}
        />
      }
    >
      {state.status === 'loading' ? (
        <SkeletonBlock height={200} />
      ) : data ? (
        <>
          {state.status !== 'ready' ? (
            <InlineUnavailable
              message="No se pudo actualizar. Mostramos la última lectura confirmada."
              actionLabel="Reintentar"
              onAction={() => void refresh()}
            />
          ) : null}
          <TimingContent data={data} />
        </>
      ) : (
        <UnavailableState
          title="No pudimos cargar cuándo comés"
          description="Revisá la conexión e intentá nuevamente."
          action={<Button label="Reintentar" onPress={() => void refresh()} />}
        />
      )}
    </ProgressScroll>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flex: 1, gap: spacing.sm },
  headline: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.xs },
  swatch: { width: 10, height: 5, marginLeft: spacing.xs },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { flex: 1, height: 5, overflow: 'hidden' },
  share: { minWidth: 40, textAlign: 'right' },
});
