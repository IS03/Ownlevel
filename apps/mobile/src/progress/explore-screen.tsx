import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { parseInfluenceMeasure } from '@/api/progress-influence';
import { StyleSheet, View } from 'react-native';
import { useMobileApi } from '@/api';
import {
  exploreOptions, exploreRequestKey, fetchProgressExplore, parseExploreMeasure, progressRequestKey,
  type ExploreBreakdown, type ExploreBucket, type ExploreDays, type ExploreGroup, type ExploreRequest, type ProgressExplore,
} from '@/api/progress';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, SegmentedControl, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { BREAKDOWN_LABELS, DAYS_LABELS, IDEAS, aggregationText, coverageLine, type ExploreChoice } from './explore-model';
import { MeasureSheet, OptionSheet } from './explore-sheets';
import { PinViewSheet } from './pin-view-sheet';
import { PeriodChart } from './period-chart';
import { ProgressRow } from './progress-row';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { shortRange } from './progress-range';
import { arrowDelta, formatValue } from './progress-format';
import { useProgressResource } from './use-progress-resource';

type Draft = { measure: string | null; label: string | null; breakdown: ExploreBreakdown | null; days: ExploreDays | null; series: boolean };

function Field({ label, value, accent, onPress, testID }: { label: string; value: string; accent?: boolean; onPress: () => void; testID: string }) {
  const { colors } = useOwnlevelTheme();
  return <ProgressRow testID={testID} label={`${label}: ${value}`} onPress={onPress}>
    <AppText muted variant="subheadline" style={styles.fieldLabel}>{label}</AppText>
    <AppText variant="headline" numberOfLines={1} style={[styles.fieldValue, accent ? { color: colors.primary } : null]}>{value}</AppText>
  </ProgressRow>;
}

/** Values in the measure's own semantics; a weekday average of a sum is no longer a whole number. */
export const valueText = (e: ProgressExplore, v: number | null, averaged = false) =>
  formatValue(v, e.measure.valueType === 'duration' ? null : e.measure.unit, averaged && e.measure.valueType === 'integer' ? 'decimal' : e.measure.valueType);

function Bars({ e, groups, reference }: { e: ProgressExplore; groups: ExploreGroup[]; reference: ExploreGroup[] | null }) {
  const { colors } = useOwnlevelTheme();
  const { compareText } = useProgressRange();
  const averaged = e.breakdown === 'weekday' && e.measure.aggregation === 'sum';
  const max = Math.max(0, ...groups.map(g => g.value ?? 0));
  const top = groups.reduce<string | null>((k, g) => g.value !== null && g.value === max && max > 0 && k === null ? g.key : k, null);
  return <View style={styles.bars} testID="explore-bars">
    {groups.map(g => {
      const ref = reference?.find(r => r.key === g.key);
      return <View key={g.key} testID={`explore-group-${g.key}`} accessible accessibilityLabel={`${g.label}: ${g.value === null ? 'sin dato' : valueText(e, g.value, averaged)}${ref ? `. ${compareText}: ${ref.value === null ? 'sin dato' : valueText(e, ref.value, averaged)}` : ''}`}>
        <View style={styles.barRow}>
          <AppText variant="subheadline" numberOfLines={1} style={styles.barLabel}>{g.label}</AppText>
          <View style={styles.track}>{g.value !== null && g.value > 0 && max > 0
            ? <View style={{ width: `${(g.value / max) * 100}%`, height: 10, borderRadius: 5, backgroundColor: colors.primary, opacity: g.key === top ? 1 : 0.4 }} /> : null}</View>
          <AppText numeric variant="subheadline" style={styles.barValue}>{g.value === null ? 'sin dato' : valueText(e, g.value, averaged)}</AppText>
        </View>
        {ref ? <AppText muted numeric variant="caption">{compareText} {ref.value === null ? 'sin dato' : valueText(e, ref.value, averaged)}</AppText> : null}
      </View>;
    })}
  </View>;
}

/** S5 · one row per group, same scale for every row; a missing bucket is a gap, a real 0 a faint line. */
function SmallMultiples({ e, groups }: { e: ProgressExplore; groups: ExploreGroup[] }) {
  const { colors } = useOwnlevelTheme();
  const { today } = useProgressRange();
  const [all, setAll] = useState(false);
  const shown = all ? groups : groups.slice(0, 4);
  const max = Math.max(1, ...shown.flatMap(g => (g.series ?? []).map(b => b.value ?? 0)));
  const first = shown[0]?.series?.[0], last = shown[0]?.series?.at(-1);
  return <View style={styles.section} testID="explore-multiples">
    {shown.map((g, i) => <View key={g.key} style={[styles.multiple, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]} testID={`explore-multiple-${g.key}`}>
      <View style={styles.multipleHead}>
        <AppText variant="subheadline" style={styles.grow}>{g.label}</AppText>
        <AppText muted numeric variant="caption">{valueText(e, g.value)}</AppText>
      </View>
      <View style={styles.mini} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {(g.series ?? []).map((b: ExploreBucket) => <View key={b.start} style={styles.miniSlot}>
          {b.value === null ? null : <View style={{ height: b.value === 0 ? 1 : Math.max(2, (32 * b.value) / max), borderTopLeftRadius: 2, borderTopRightRadius: 2,
            backgroundColor: b.value === 0 ? colors.border : colors.primary, opacity: b.value === 0 ? 1 : b.start <= today && b.end >= today ? 0.4 : 1 }} />}
        </View>)}
      </View>
    </View>)}
    {first && last ? <View style={styles.axis}>
      <AppText muted numeric variant="caption">{shortRange({ start: first.start, end: first.start }, today)}</AppText>
      <AppText muted numeric variant="caption">{shortRange({ start: last.start, end: last.start }, today)}</AppText>
    </View> : null}
    {groups.length > 4 ? <Button label={all ? 'Ver menos' : `Ver todos (${groups.length})`} variant="quiet" onPress={() => setAll(!all)} /> : null}
    <AppText muted variant="caption">Misma escala en todas las filas · hueco = sin dato · el tramo en curso va más claro.</AppText>
  </View>;
}

function Result({ request, onLoaded }: { request: ExploreRequest; onLoaded: (e: ProgressExplore | null) => void }) {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare, compareText, today } = useProgressRange();
  const load = useCallback((c: NonNullable<typeof client>, s: AbortSignal) => fetchProgressExplore(c, query, request, s, compare), [query, request, compare]);
  const { state, data: e, refresh } = useProgressResource(client, `${progressRequestKey(query, compare)}|${exploreRequestKey(request)}`, load);
  useEffect(() => { onLoaded(e ?? null); }, [e, onLoaded]);
  if (state.status === 'loading') return <SkeletonBlock height={220} />;
  if (!e) return <UnavailableState title="No pudimos cargar esta consulta" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />;
  const c = e.current, r = e.reference;
  const dots = e.measure.aggregation === 'latest' || e.measure.aggregation === 'best';
  return <View style={styles.section} testID="explore-result">
    {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
    <View style={styles.big}>
      <View style={styles.bigLine}>
        <AppText numeric variant="largeTitle" testID="explore-value">{c.value === null ? '—' : valueText(e, c.value)}</AppText>
        {e.measure.derived ? <View style={[styles.chip, { backgroundColor: colors.brandSubtle }]}><AppText variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>estimado</AppText></View> : null}
      </View>
      <AppText muted variant="caption">{e.measure.label} · {aggregationText(e)}{e.days ? ` · días ${DAYS_LABELS[e.days].toLocaleLowerCase('es-AR')}` : ''}</AppText>
      <AppText muted numeric variant="caption">{coverageLine(e, c.coverage)}{c.change !== null ? ` · ${arrowDelta(c.change, e.measure.unit)} en el período` : ''}</AppText>
      {r && compareText ? <AppText numeric variant="caption" testID="explore-reference">{compareText} {r.value === null ? 'sin dato'
        : `${valueText(e, r.value)}${c.value !== null ? ` · ${arrowDelta(c.value - r.value, e.measure.valueType === 'duration' ? null : e.measure.unit, e.measure.valueType)}` : ''}`}</AppText> : null}
    </View>
    {e.series && !e.breakdown && c.series ? <PeriodChart testID="explore-chart" mode={dots ? 'dots' : 'bars'} points={c.series.map(b => ({
      key: b.start, label: shortRange({ start: b.start, end: b.start }, today), value: b.value, text: b.value === null ? 'sin dato' : valueText(e, b.value), soft: b.start <= today && b.end >= today && !dots,
    }))} /> : null}
    {e.breakdown && e.series ? <SmallMultiples e={e} groups={c.groups} /> : null}
    {e.breakdown && !e.series ? <Bars e={e} groups={c.groups} reference={r?.groups ?? null} /> : null}
    {c.unassigned > 0 ? <AppText muted variant="caption">{c.unassigned} {c.unassigned === 1 ? 'comida' : 'comidas'} sin {e.breakdown === 'time_band' ? 'hora' : 'momento'} no {c.unassigned === 1 ? 'entra' : 'entran'} en el desglose.</AppText> : null}
  </View>;
}

/** Explorar (stage 2, S2–S5): one measure × optional breakdown × optional days, inside the period chosen above. */
export function ExploreScreen() {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const params = useLocalSearchParams<{ measure?: string; breakdown?: string; days?: string; series?: string }>();
  // A saved view opens here with its query; only combinations the measure admits are kept.
  const [draft, setDraft] = useState<Draft>(() => {
    const m = typeof params.measure === 'string' ? parseExploreMeasure(params.measure) : undefined;
    if (!m) return { measure: null, label: null, breakdown: null, days: null, series: false };
    const o = exploreOptions(m);
    const breakdown = o.breakdowns.find(b => b === params.breakdown) ?? null, days = o.days.find(d => d === params.days) ?? null;
    return { measure: m.key, label: null, breakdown, days, series: params.series === '1' && breakdown !== 'weekday' };
  });
  const [loaded, setLoaded] = useState<ProgressExplore | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const onLoaded = useCallback((e: ProgressExplore | null) => setLoaded(e), []);
  const [sheet, setSheet] = useState<'measure' | 'breakdown' | 'days' | 'pin' | null>(null);
  const measure = draft.measure ? parseExploreMeasure(draft.measure) : undefined;
  const options = measure ? exploreOptions(measure) : null;
  const pickMeasure = (c: ExploreChoice) => {
    const next = parseExploreMeasure(c.key);
    if (!next) return;
    const o = exploreOptions(next);
    // A breakdown or filter the new measure does not admit is dropped, never sent.
    setDraft(d => ({ measure: c.key, label: c.label, breakdown: d.breakdown && o.breakdowns.includes(d.breakdown) ? d.breakdown : null,
      days: d.days && o.days.includes(d.days) ? d.days : null, series: (next.kind === 'body' || next.kind === 'exercise') ? true : d.series && d.breakdown !== 'weekday' }));
  };
  const request: ExploreRequest | null = draft.measure ? { measure: draft.measure, breakdown: draft.breakdown, days: draft.days, series: draft.series && draft.breakdown !== 'weekday' } : null;
  return <ProgressScroll title="Explorar" testID="explore-screen">
    <View testID="explore-builder">
      <Field testID="explore-field-measure" label="Medida" value={draft.label ?? loaded?.measure.label ?? (draft.measure ? 'Cargando…' : 'Elegí qué medir')} accent={!draft.measure} onPress={() => setSheet('measure')} />
      {options?.breakdowns.length ? <Field testID="explore-field-breakdown" label="Desglosar por" value={draft.breakdown ? BREAKDOWN_LABELS[draft.breakdown] : 'Sin desglose'} onPress={() => setSheet('breakdown')} /> : null}
      {options?.days.length ? <Field testID="explore-field-days" label="Días" value={draft.days ? DAYS_LABELS[draft.days] : 'Todos'} onPress={() => setSheet('days')} /> : null}
    </View>
    {request && draft.breakdown !== 'weekday' ? <SegmentedControl accessibilityLabel="Cómo ver el resultado" value={draft.series ? 'time' : 'total'}
      options={[{ value: 'total', label: draft.breakdown ? 'Total' : 'Período' }, { value: 'time', label: 'En el tiempo' }]}
      onChange={v => setDraft(d => ({ ...d, series: v === 'time' }))} /> : null}
    {request ? <Result request={request} onLoaded={onLoaded} /> : null}
    {request && loaded ? pinned === exploreRequestKey(request)
      ? <View style={styles.pinned} testID="explore-pinned"><AppIcon name="check" color={colors.primary} size={18} /><AppText variant="headline" style={{ color: colors.primary }}>Fijada en Mis vistas</AppText></View>
      : <Button label="Fijar en Mis vistas" onPress={() => setSheet('pin')} testID="explore-pin" /> : null}
    {request ? null : <View style={styles.section} testID="explore-ideas">
      <Heading level={2}>Ideas para empezar</Heading>
      <View>{IDEAS.map(i => <ProgressRow key={i.title} testID={`explore-idea-${i.request.measure}`} label={`${i.title}. ${i.detail}`}
        onPress={() => setDraft({ measure: i.request.measure, label: i.label, breakdown: i.request.breakdown, days: i.request.days, series: i.request.series })}>
        <AppIcon name={i.icon} color={colors.textMuted} size={20} />
        <View style={styles.grow}><AppText variant="headline">{i.title}</AppText><AppText muted variant="footnote">{i.detail}</AppText></View>
      </ProgressRow>)}</View>
    </View>}
    {sheet === 'pin' && request && loaded ? <PinViewSheet label={draft.label ?? loaded.measure.label} definition={request}
      preview={loaded.current.value === null ? '—' : valueText(loaded, loaded.current.value)} onPinned={() => setPinned(exploreRequestKey(request))} onClose={() => setSheet(null)} /> : null}
    {sheet === 'measure' ? <MeasureSheet selected={draft.measure} onPick={pickMeasure} onClose={() => setSheet(null)} /> : null}
    {sheet === 'breakdown' && options ? <OptionSheet title="Desglosar por" selected={draft.breakdown ?? 'none'} onClose={() => setSheet(null)}
      options={[{ key: 'none', label: 'Sin desglose', detail: '' }, ...options.breakdowns.map(b => ({ key: b, label: BREAKDOWN_LABELS[b], detail: '' }))]}
      onPick={k => setDraft(d => ({ ...d, breakdown: k === 'none' ? null : k as ExploreBreakdown, series: k === 'weekday' ? false : d.series }))} /> : null}
    {sheet === 'days' && options ? <OptionSheet title="Días" selected={draft.days ?? 'all'} onClose={() => setSheet(null)}
      options={[{ key: 'all', label: 'Todos', detail: '' }, ...options.days.map(k => ({ key: k, label: DAYS_LABELS[k], detail: '' }))]}
      onPick={k => setDraft(d => ({ ...d, days: k === 'all' ? null : k as ExploreDays }))} /> : null}
    {draft.measure && parseInfluenceMeasure(draft.measure, 'outcome') ? <ProgressRow testID="explore-influence" label="Qué influye en esto" onPress={() => router.push({ pathname: '/(tabs)/progress/influence/build', params: { outcome: draft.measure!, ...(loaded?.measure.key === draft.measure ? { outcomeLabel: loaded.measure.label } : {}) } })}>
      <AppIcon name="sparkles" color={colors.textMuted} size={20} /><AppText variant="headline" style={styles.grow}>Qué influye en esto</AppText>
    </ProgressRow> : null}
  </ProgressScroll>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  grow: { flex: 1, gap: 2 },
  fieldLabel: { width: 112 },
  fieldValue: { flex: 1, textAlign: 'right' },
  big: { gap: 2 },
  bigLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  bars: { gap: spacing.md },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { width: 108 },
  track: { flex: 1, height: 10 },
  barValue: { width: 82, textAlign: 'right' },
  multiple: { gap: 6, paddingVertical: 10 },
  multipleHead: { flexDirection: 'row', alignItems: 'center' },
  mini: { flexDirection: 'row', alignItems: 'flex-end', height: 32, gap: 3 },
  miniSlot: { flex: 1, minWidth: 0, height: 32, justifyContent: 'flex-end' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 50, justifyContent: 'center' },
});
