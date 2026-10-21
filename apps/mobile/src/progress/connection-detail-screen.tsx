import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CONNECTION_KEYS, type ConnectionKey, type ConnectionStory, type ConnectionWeek } from '@/api/progress-connections';
import { AppIcon, AppText, Button, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { CONNECTION_NAMES, connectionDelta, connectionMissingText, connectionTitle, connectionsPeriodNames, connectionsPeriodText } from './connections-model';
import { useProgressConnections } from './connections-section';
import { formatValue } from './progress-format';
import { shortRange } from './progress-range';
import { useProgressRange } from './progress-range-context';
import { ProgressScroll } from './progress-scroll';

const BARS = 120;
const FOOD_NAME: Record<ConnectionKey, string> = { protein_strength: 'Proteína', carbs_strength: 'Carbos', carbs_energy: 'Carbos', kcal_weight: 'Calorías' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const foodText = (value: number | null, unit: 'g' | 'kcal') => unit === 'kcal' ? formatValue(value, null, 'integer') : formatValue(value, 'g', 'integer');

/** The two facts side by side: what it is, the value now and, under it, the previous period's value and the change. */
function Facts({ story }: { story: ConnectionStory }) {
  const { colors } = useOwnlevelTheme();
  const { state, today } = useProgressRange();
  const { before } = connectionsPeriodNames(state, today);
  const f = story.food, o = story.outcome;
  const was = (value: number | null, text: string, delta: string) => value === null ? `${cap(before)}: sin dato` : `${cap(before)}: ${text} · ${delta}`;
  const food = { label: `${FOOD_NAME[story.key]} por día`, value: foodText(f.current, f.unit),
    caption: was(f.previous, foodText(f.previous, f.unit), connectionDelta(f.current, f.previous, f.unit)) };
  const result = o.kind === 'strength'
    ? story.key === 'protein_strength'
      ? { label: 'Ejercicios que mejoraron', value: o.improved === null || o.comparable === null ? 'Sin dato' : `${o.improved} de ${o.comparable}`, caption: `Frente a ${before}, de los que repetiste` }
      : { label: o.top ? `${o.top.name}, 1RM estimado` : '1RM estimado', value: formatValue(o.top?.currentE1rm ?? null, 'kg'),
        caption: o.top ? was(o.top.previousE1rm, formatValue(o.top.previousE1rm, 'kg'), connectionDelta(o.top.currentE1rm, o.top.previousE1rm, 'kg')) : 'Sin dato' }
    : o.kind === 'energy'
      ? { label: 'Energía al terminar', value: o.current === null ? 'Sin dato' : `${formatValue(o.current, null)} de 5`,
        caption: was(o.previous, formatValue(o.previous, null), connectionDelta(o.current, o.previous, null)) }
      : { label: 'Peso, tendencia', value: formatValue(o.current, 'kg'), caption: was(o.previous, formatValue(o.previous, 'kg'), connectionDelta(o.current, o.previous, 'kg')) };
  return <View style={styles.facts}>
    {[food, result].map((x, i) => <View key={i} style={[styles.fact, i > 0 && [styles.factRight, { borderColor: colors.border }]]}>
      <AppText muted variant="footnote" numberOfLines={2}>{x.label}</AppText>
      <AppText numeric variant="title1">{x.value}</AppText>
      <AppText muted numeric variant="footnote">{x.caption}</AppText>
    </View>)}
  </View>;
}

/**
 * Food per day, week by week: this period in champagne, the previous one in grey beside it (brand: single series +
 * previous period in grey). Bars start at zero; a week without meals is a gap, never a zero bar.
 */
function WeeklyFood({ story }: { story: ConnectionStory }) {
  const { colors } = useOwnlevelTheme();
  const { state, today } = useProgressRange();
  const names = connectionsPeriodNames(state, today);
  const known = [...story.weeks, ...story.weeksPrevious].map(w => w.food).filter((v): v is number => v !== null);
  const high = Math.max(1, ...known);
  const few = story.weeks.length <= 6;
  const label = (w: ConnectionWeek, i: number) => few || i === 0 || i === story.weeks.length - 1 ? shortRange(w, today) : '';
  const bar = (w: ConnectionWeek | undefined, tone: 'now' | 'before') => !w || w.food === null
    ? <View style={styles.barSlot} />
    : <View style={[styles.barSlot, { justifyContent: 'flex-end' }]}>
      <View style={{ height: Math.max(2, (BARS * w.food) / high), borderTopLeftRadius: 3, borderTopRightRadius: 3,
        backgroundColor: tone === 'now' ? colors.primary : colors.textMuted, opacity: tone === 'now' ? 1 : 0.35 }} />
    </View>;
  return <View style={styles.block} testID="connection-weekly-food">
    <View style={styles.chartHead}>
      <AppText variant="headline">{FOOD_NAME[story.key]} por día, semana a semana</AppText>
      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.swatch, { backgroundColor: colors.primary }]} /><AppText muted variant="caption">{names.now}</AppText>
        <View style={[styles.swatch, { backgroundColor: colors.textMuted, opacity: 0.35 }]} /><AppText muted variant="caption">{names.before}</AppText>
      </View>
    </View>
    <View style={styles.bars}>
      {story.weeks.map((w, i) => {
        const before = story.weeksPrevious[i];
        const spoken = `${shortRange(w, today)}: ${w.food === null ? 'sin comidas registradas' : `${foodText(w.food, story.food.unit)} por día`}${before ? `, ${names.before} ${before.food === null ? 'sin dato' : foodText(before.food, story.food.unit)}` : ''}. ${w.days ?? 0} de ${w.eligible} días con comidas.`;
        return <View key={w.start} style={styles.week} accessible accessibilityLabel={spoken} testID={`connection-week-${w.start}`}>
          {few ? <AppText numeric variant="caption" style={styles.center}>{w.food === null ? '—' : foodText(w.food, story.food.unit)}</AppText> : null}
          <View style={styles.pair}>{bar(before, 'before')}{bar(w, 'now')}</View>
          <AppText muted numeric variant="caption" style={styles.center} numberOfLines={1}>{label(w, i)}</AppText>
          {few && (!w.eligible || (w.days ?? 0) < w.eligible) ? <AppText muted numeric variant="caption" style={styles.center}>{w.eligible ? `${w.days ?? 0} de ${w.eligible} días` : 'en curso'}</AppText> : null}
        </View>;
      })}
    </View>
  </View>;
}

function Exercises({ story }: { story: Extract<ConnectionStory, { exercises: unknown }> }) {
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  if (!story.exercises.length) return null;
  return <View style={styles.block} testID="connection-exercises">
    <AppText variant="headline">Ejercicios que repetiste en los dos períodos</AppText>
    <AppText muted variant="footnote">1RM estimado de tu mejor sesión en cada uno</AppText>
    <View>{story.exercises.map((e, i) => <Pressable key={e.exerciseId} accessibilityRole="button" testID={`connection-exercise-${e.exerciseId}`}
      accessibilityLabel={`${e.name}. Antes ${formatValue(e.previousE1rm, 'kg')}, ahora ${formatValue(e.currentE1rm, 'kg')}, estimado.`}
      onPress={() => { haptics.selection(); router.push({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: e.exerciseId } }); }}
      style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, pressed && { opacity: 0.6 }]}>
      <AppText style={styles.grow} numberOfLines={1}>{e.name}</AppText>
      <AppText muted numeric variant="footnote">{formatValue(e.previousE1rm, null)} → {formatValue(e.currentE1rm, 'kg')}</AppText>
      <AppText numeric variant="footnote" style={styles.delta}>{connectionDelta(e.currentE1rm, e.previousE1rm, null)}</AppText>
      <AppIcon name="chevronRight" color={colors.textMuted} size={15} />
    </Pressable>)}</View>
  </View>;
}

function WeightWeeks({ story }: { story: Extract<ConnectionStory, { key: 'kcal_weight' }> }) {
  const { colors } = useOwnlevelTheme();
  const { today } = useProgressRange();
  return <View style={styles.block} testID="connection-weight-weeks">
    <AppText variant="headline">Peso, tendencia por semana</AppText>
    <View>{story.weightWeeks.map((w, i) => <View key={w.start} accessible accessibilityLabel={`Semana ${shortRange(w, today)}: ${w.trend === null ? 'sin pesaje' : formatValue(w.trend, 'kg')}`}
      style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <AppText style={styles.grow}>Semana {shortRange(w, today)}</AppText>
      {w.trend === null ? <AppText muted variant="footnote">Sin pesaje</AppText> : <AppText numeric variant="headline">{formatValue(w.trend, 'kg')}</AppText>}
    </View>)}</View>
  </View>;
}

function EnergySessions({ story }: { story: Extract<ConnectionStory, { key: 'carbs_energy' }> }) {
  const { state, today } = useProgressRange();
  const s = story.outcome.sessions;
  return <AppText muted variant="footnote">La energía es el promedio de {s.current ?? 0} entrenamientos con la energía cargada (en {connectionsPeriodNames(state, today).before}, {s.previous ?? 0}).</AppText>;
}

/** C2/C3 · one story in detail. Same period and the same previous-equivalent B as the section in "Tu octubre". */
export function ConnectionDetailScreen() {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const { state, today } = useProgressRange();
  const params = useLocalSearchParams<{ key?: string }>();
  const key = (CONNECTION_KEYS as readonly string[]).includes(params.key ?? '') ? params.key as ConnectionKey : null;
  const { state: status, data, refresh } = useProgressConnections();
  const story = key ? data?.stories.find(s => s.key === key) ?? null : null;
  const title = key ? CONNECTION_NAMES[key] : 'Lo que se movió junto';
  // Qué influye cannot read strength, energy or weight yet; for strength the closest honest question is next-day sets.
  const influence = story && (story.key === 'protein_strength' || story.key === 'carbs_strength')
    ? { split: story.food.key, cut: 'median', lag: '1', outcome: 'training.sets' } : null;
  return <ProgressScroll title={title} testID="connection-detail-screen"
    refreshControl={<RefreshControl refreshing={status.status === 'ready' && status.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {!key ? <UnavailableState title="No encontramos esta historia" description="Volvé a Progreso y elegila de nuevo." />
      : status.status === 'loading' ? <><SkeletonBlock height={90} /><SkeletonBlock height={200} /></>
      : !data || !story ? <UnavailableState title="No pudimos cargar esta historia" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
        action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {status.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos los últimos datos de este período." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
        {story.status === 'ready' ? <>
          <View style={styles.lead}>
            <AppText variant="title2">{connectionTitle(story)}</AppText>
            <AppText muted variant="footnote">{connectionsPeriodText(state, today)}</AppText>
          </View>
          <Facts story={story} />
          <WeeklyFood story={story} />
          {'exercises' in story ? <Exercises story={story} /> : null}
          {story.key === 'kcal_weight' ? <WeightWeeks story={story} /> : null}
          {story.key === 'carbs_energy' ? <EnergySessions story={story} /> : null}
        </> : story.status === 'insufficient' && story.missing ? <View style={styles.block} testID="connection-detail-missing">
          <AppText variant="headline">Todavía no alcanza</AppText>
          <AppText muted>{connectionMissingText(story.missing, state.unit)}</AppText>
        </View> : <InlineUnavailable message={`No pudimos cargar ${title.toLocaleLowerCase('es-AR')}.`} actionLabel="Reintentar" onAction={() => void refresh()} />}
        <View style={styles.block}>
          <AppText muted variant="footnote">Pasaron al mismo tiempo: no quiere decir que una cosa cause la otra.</AppText>
          {influence ? <Pressable accessibilityRole="button" testID="connection-influence" style={styles.link}
            accessibilityLabel={`Mirar en Qué influye si los días con más ${FOOD_NAME[story.key].toLocaleLowerCase('es-AR')} hiciste más series al día siguiente`}
            onPress={() => { haptics.selection(); router.push({ pathname: '/(tabs)/progress/influence/answer', params: influence }); }}>
            <AppText variant="headline" style={{ color: colors.primary }}>Mirar en Qué influye: series al día siguiente →</AppText>
          </Pressable> : null}
        </View>
      </>}
  </ProgressScroll>;
}

const styles = StyleSheet.create({
  lead: { gap: spacing.xs },
  facts: { flexDirection: 'row', gap: spacing.md },
  fact: { flex: 1, gap: spacing.xs },
  factRight: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: spacing.md },
  block: { gap: spacing.sm, marginTop: spacing.md },
  chartHead: { gap: spacing.xs },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  week: { flex: 1, gap: spacing.xs },
  pair: { flexDirection: 'row', gap: 3, height: BARS, alignItems: 'flex-end' },
  barSlot: { flex: 1, height: BARS },
  center: { textAlign: 'center' },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  grow: { flex: 1 },
  delta: { minWidth: 44, textAlign: 'right' },
  link: { minHeight: 44, justifyContent: 'center' },
});
