import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ProgressTraining, ProgressTrainingInPeriod, TrainingPerformanceStatus } from '@/api/progress';
import { AppIcon, AppText, Button, ChipGroup, Heading, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { useComparisonText, useProgressRange } from './progress-range-context';
import { daysBetween, shortRange } from './progress-range';
import { formatValue } from './progress-format';
import { ProgressRow } from './progress-row';
import { REASON_LABELS, signalLine } from './training-presenters';

const fmt = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00Z`)).replace('.', '');
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;
type Routine = NonNullable<ProgressTraining['story']>['routines'][number];
type PerformanceRow = { id: string; name: string; status: TrainingPerformanceStatus; reason: string; signal: ProgressTrainingInPeriod['exercises'][number]['signal']; firstDate: string | null; lastDate: string | null };

/** The first/last comparator excludes single sessions and invalid sets. They remain explicitly unassessed. */
export function trainingPerformanceRows(data: ProgressTraining): PerformanceRow[] | null {
  if (!data.inPeriod) return null;
  const results = new Map(data.inPeriod.exercises.map(e => [e.id, e]));
  return data.exercises.filter(e => e.sessions > 0).map(e => {
    const result = results.get(e.id);
    return { id: e.id, name: e.name, status: result?.status ?? 'insufficient_data',
      reason: result?.reason ?? (e.sessions === 1 ? 'single_session' : 'insufficient_sessions'), signal: result?.signal ?? null,
      firstDate: result?.firstDate ?? null, lastDate: result?.lastDate ?? e.lastDate };
  });
}

function SectionTitle({ children, description }: { children: string; description: string }) {
  return <View style={styles.stack}><View style={styles.between}><Heading level={2} style={styles.flex}>{children}</Heading></View><AppText muted variant="subheadline">{description}</AppText></View>;
}
function Disclosure({ title, children, initialOpen = false, testID }: { title: string; children: ReactNode; initialOpen?: boolean; testID?: string }) {
  const [open, setOpen] = useState(initialOpen), { colors } = useOwnlevelTheme();
  return <View style={[styles.disclosure, { borderColor: colors.border }]} testID={testID}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.disclosureButton}>
      <AppText variant="headline" style={styles.flex}>{title}</AppText><AppIcon name={open ? 'minus' : 'plus'} size={20} color={colors.textMuted} />
    </Pressable>{open ? <View style={styles.stack}>{children}</View> : null}
  </View>;
}
function Stat({ label, value, previous }: { label: string; value: string; previous?: string | null }) {
  return <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}${previous ? `; antes, ${previous}` : ''}`}><AppText numeric variant="title2">{value}</AppText><AppText muted variant="caption">{label}</AppText>{previous ? <AppText muted numeric variant="caption">Antes, {previous}</AppText> : null}</View>;
}
export const hasTrainingBlocks = (data: ProgressTraining) => data.series.length > 0 && Math.max(0, ...data.series.map(b => b.sessions)) <= 7;

function Activity({ data }: { data: ProgressTraining }) {
  const { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions(), { compareOn } = useProgressRange();
  const [selected, select] = useState<string | null>(null);
  const s = data.summary, c = s.comparisons.sessions;
  const comparisonText = useComparisonText();
  const previousDays = daysBetween(data.period.previousStart, data.period.previousEnd);
  const previousRate = compareOn && c.status === 'comparable' && c.previous !== null && previousDays >= 14 ? c.previous * 7 / previousDays : null;
  const rate = s.sessionsPerWeek;
  const headline = rate !== null && previousRate !== null ? Math.abs(rate - previousRate) < 0.05 ? 'Una frecuencia parecida.' : rate > previousRate ? 'Más veces que antes.' : 'Menos veces que antes.' : 'Cómo venís entrenando';
  const max = Math.max(1, ...data.series.map(b => b.sessions));
  const inspected = data.series.find(b => b.start === selected);
  const blocks = hasTrainingBlocks(data);
  const bucket = { day: 'día', week: 'semana', month: 'mes' }[data.period.bucket];
  const incompleteDuration = data.story?.routines.some(r => r.sessions > 0 && r.averageMinutes === null);
  return <View style={[styles.hero, { backgroundColor: colors.surfaceRaised }]} testID="training-summary">
    <AppText muted variant="caption">ACTIVIDAD REGISTRADA</AppText><Heading level={2}>{headline}</Heading>
    <View style={[styles.between, fontScale > 1.3 && styles.vertical]}><View><AppText numeric variant="heroNumber">{fmt(rate ?? s.sessions)}</AppText><AppText muted>{rate === null ? 'sesiones en el período' : 'sesiones por semana'}</AppText></View>
      {previousRate !== null ? <AppText numeric muted variant="subheadline">Antes, {fmt(previousRate)} por semana</AppText> : null}</View>
    {blocks ? <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weeks} accessibilityLabel={`Sesiones por ${bucket}`}>
      {data.series.map(b => <Pressable key={b.start} testID={`training-week-${b.start}`} accessibilityRole="button" accessibilityState={{ selected: selected === b.start }}
        accessibilityLabel={`${date(b.start)} – ${date(b.end)}, ${plural(b.sessions, 'sesión', 'sesiones')}${b.end >= data.today ? ', en curso' : ''}`}
        onPress={() => select(selected === b.start ? null : b.start)} style={[styles.week, { borderColor: selected === b.start ? colors.primary : 'transparent' }]}>
        <View style={styles.blocks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{Array.from({ length: max }, (_, i) => <View key={i} style={[styles.block, { backgroundColor: i < b.sessions ? colors.primary : colors.border, opacity: i < b.sessions && b.end >= data.today ? 0.4 : 1 }]} />)}</View>
        <AppText muted numeric variant="caption">{date(b.start)}</AppText>
      </Pressable>)}
    </ScrollView><AppText muted numeric variant="footnote" accessibilityLiveRegion="polite">{inspected ? `${date(inspected.start)} – ${date(inspected.end)} · ${plural(inspected.sessions, 'sesión', 'sesiones')}${inspected.end >= data.today ? ' · intervalo en curso' : ''}` : `Cada bloque es una sesión. Tocá un intervalo para ver sus fechas.`}</AppText></> : null}
    <View style={[styles.stats, { borderColor: colors.border }]}>
      <Stat value={fmt(s.sessions)} label="sesiones" previous={compareOn ? c.previous === null ? null : fmt(c.previous) : null} />
      <Stat value={fmt(s.sets)} label="series" previous={compareOn && s.comparisons.sets.previous !== null ? fmt(s.comparisons.sets.previous) : null} />
      <Stat value={incompleteDuration ? '—' : formatValue(s.minutes, null, 'duration')} label={incompleteDuration ? 'duración incompleta' : 'con descansos'} />
    </View>
    {incompleteDuration ? <AppText muted variant="footnote">No hay una duración válida para alguna sesión. No se cuenta como cero minutos.</AppText> : null}
    <AppText muted numeric variant="caption">{plural(s.trainingDays, 'día entrenado', 'días entrenados')}</AppText>
    {compareOn && s.comparisons.sets.status !== 'comparable' ? <AppText muted variant="footnote">{comparisonText(s.comparisons.sets, 'series', 'integer')}</AppText> : null}
    {compareOn ? <AppText muted numeric variant="caption">Referencia: {shortRange({ start: data.period.previousStart, end: data.period.previousEnd }, data.today)} · {plural(previousDays, 'día', 'días')}</AppText> : null}
  </View>;
}

function Routines({ data, open }: { data: ProgressTraining; open: (id: string) => void }) {
  const { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions(), { compareOn } = useProgressRange(), router = useRouter();
  const [sort, setSort] = useState<'sessions' | 'averageMinutes' | 'averageExercises'>('sessions'), [expanded, expand] = useState<string | null>(null);
  const Selector = fontScale > 1.3 ? ChipGroup : ExerciseSegmented;
  const routines: Routine[] = data.story?.routines ?? data.routines.map(r => ({ ...r, previousSessions: 0, lastDate: null, averageMinutes: null,
    averageExercises: null, exerciseIds: [], improved: 0, stable: 0, declined: 0, insufficient: 0 }));
  const sortKey = data.story ? sort : 'sessions';
  const current = routines.filter(r => r.sessions > 0).sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1) || a.name.localeCompare(b.name, 'es-AR'));
  const max = Math.max(1, ...current.map(r => r[sortKey] ?? 0));
  const names = new Map(data.exercises.map(e => [e.id, e.name]));
  return <View style={styles.section} testID="training-routines"><SectionTitle description="Qué repetís y cuánto te lleva.">Tus rutinas</SectionTitle>
    <Selector accessibilityLabel="Ordenar rutinas" value={sortKey} onChange={setSort} options={[{ value: 'sessions', label: 'Más veces' }, ...(data.story ? [{ value: 'averageMinutes' as const, label: 'Más tiempo' }, { value: 'averageExercises' as const, label: 'Más ejercicios' }] : [])]} />
    {current.map(r => <View key={r.id} style={[styles.routine, { borderColor: colors.border }]}>
      <Pressable testID={`training-routine-${r.id}`} accessibilityRole="button" accessibilityState={{ expanded: expanded === r.id }} onPress={() => expand(expanded === r.id ? null : r.id)} style={[styles.between, fontScale > 1.3 && styles.vertical]}>
        <View style={styles.flex}><AppText variant="title2">{r.name}</AppText>{r.lastDate ? <AppText muted numeric variant="caption">Última vez · {date(r.lastDate)}</AppText> : null}</View>
        <View style={styles.stack}><AppText numeric variant="title2">{sortKey === 'sessions' ? plural(r.sessions, 'vez', 'veces') : sortKey === 'averageMinutes' ? r.averageMinutes === null ? 'Sin dato' : `${fmt(r.averageMinutes)} min` : plural(r.averageExercises!, 'ejercicio', 'ejercicios')}</AppText><AppText muted variant="caption">{sortKey === 'sessions' ? compareOn && data.story ? `${r.previousSessions} en la referencia` : 'en el período' : 'promedio por sesión'}</AppText></View><AppIcon name="chevronDown" color={colors.textMuted} size={17} />
      </Pressable>
      {r[sortKey] !== null ? <View style={[styles.rail, { backgroundColor: colors.border }]}><View style={[styles.fill, { width: `${(r[sortKey] ?? 0) / max * 100}%`, backgroundColor: colors.primary }]} /></View> : null}
      {expanded === r.id ? <View style={[styles.detail, { backgroundColor: colors.surfaceRaised }]} testID={`training-routine-detail-${r.id}`}>
        <View style={styles.stats}><Stat value={fmt(r.sessions)} label="sesiones" /><Stat value={fmt(r.sets)} label="series" /><Stat value={r.averageMinutes === null ? 'Sin dato' : `${fmt(r.averageMinutes)} min`} label="duración media" />{r.averageExercises !== null ? <Stat value={fmt(r.averageExercises)} label="ejercicios por sesión" /> : null}</View>
        {data.story ? <><AppText>{r.improved + r.stable + r.declined > 0 ? `${r.improved} de ${r.improved + r.stable + r.declined} ejercicios comparables subieron.` : 'Sin ejercicios comparables dentro de esta rutina.'}</AppText><AppText muted variant="footnote">{data.inPeriod?.method ? 'Última sesión frente a su referencia dentro de esta rutina.' : 'Primera y última sesión dentro de esta rutina.'} {r.insufficient} sin comparación suficiente.</AppText></> : null}
        {r.exerciseIds.length ? <AppText muted variant="caption">Al abrir un ejercicio, ves sus registros de todas las rutinas.</AppText> : null}
        {r.exerciseIds.map(id => <Button key={id} label={names.get(id) ?? 'Ver ejercicio'} variant="quiet" onPress={() => open(id)} />)}
        {r.lastDate ? <Button label="Ver último día y sesiones" variant="quiet" onPress={() => router.push({ pathname: '/history/day/[date]', params: { date: r.lastDate! } })} /> : null}
      </View> : null}
    </View>)}
    {!current.length ? <AppText muted>Sin rutinas registradas en este período.</AppText> : null}
    {compareOn ? routines.filter(r => r.sessions === 0 && r.previousSessions > 0).map(r => <View key={r.id} style={[styles.detail, { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
      <AppText variant="headline">{r.name}</AppText><AppText muted>Sin sesiones en este período. En la referencia: {plural(r.previousSessions, 'sesión', 'sesiones')}.</AppText><AppText muted variant="footnote">Puede ser un cambio de programa; no se cuenta como una falta.</AppText><ProgressRow label="Revisar historial" onPress={() => router.push('/(tabs)/train/history')}><AppText style={styles.flex}>Revisar historial</AppText></ProgressRow>
    </View>) : null}
  </View>;
}

function Performance({ data, open }: { data: ProgressTraining; open: (id: string) => void }) {
  const { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions(), { compareOn, compareText } = useProgressRange();
  const rows = trainingPerformanceRows(data);
  const [chosen, choose] = useState<TrainingPerformanceStatus | null>(null), [all, setAll] = useState(false);
  const initial: TrainingPerformanceStatus = (['improved', 'insufficient_data', 'stable', 'declined'] as const).find(status => rows?.some(e => e.status === status)) ?? 'insufficient_data';
  const selected = chosen ?? initial;
  const filtered = rows?.filter(e => e.status === selected) ?? [];
  const previousOnly = compareOn ? data.exercises.filter(e => e.sessions === 0) : [];
  return <View style={styles.section} testID="training-performance"><SectionTitle description={data.inPeriod?.method === 'own' ? 'Última sesión frente a lo tuyo: tus registros recientes de cada ejercicio.' : data.inPeriod?.method === 'partial' ? 'Cada ejercicio: su última vez frente a la anterior parecida.' : data.inPeriod?.method === 'strict' ? 'Última vez frente a la anterior compatible, ejercicio por ejercicio.' : 'Primera y última sesión del período, ejercicio por ejercicio.'}>Dónde progresaste</SectionTitle>
    {rows ? <><View style={styles.performanceCounts}>{([['improved', data.inPeriod?.method === 'partial' ? 'Registro superior' : 'Subieron'], ['stable', 'Iguales'], ['declined', data.inPeriod?.method === 'partial' ? 'Registro inferior' : 'Bajaron'], ['insufficient_data', 'Sin comparar']] as const).map(([status, label]) => <Pressable key={status} testID={`training-performance-${status}`} accessibilityRole="button"
      accessibilityLabel={`${label}: ${rows.filter(e => e.status === status).length} ejercicios`} accessibilityState={{ selected: selected === status }} onPress={() => { choose(status); setAll(false); }}
      style={[styles.count, fontScale > 1.3 && styles.largeCount, { backgroundColor: colors.surfaceRaised, borderColor: selected === status ? colors.primary : 'transparent' }]}>
      <AppText numeric variant="title1">{rows.filter(e => e.status === status).length}</AppText><AppText muted variant="caption">{label}</AppText>
    </Pressable>)}</View><AppText muted variant="footnote">{data.inPeriod?.method === 'partial' ? 'Mismo ejercicio, modo, unidad e implemento. La variante no quedó registrada: una diferencia puede venir de ahí.' : data.inPeriod?.method === 'own' ? 'Mismo ejercicio, implemento y modo registrado frente a tus últimas 3 a 5 veces. No mezcla carga y repeticiones sin carga.' : 'Carga o repeticiones con configuración comparable. Un cambio entre dos sesiones no define toda la tendencia.'}</AppText>
      {(all ? filtered : filtered.slice(0, 3)).map(e => {
        const previous = compareOn ? data.exercises.find(item => item.id === e.id) : null;
        return <Pressable key={e.id} testID={`training-exercise-${e.id}`} accessibilityRole="button" onPress={() => open(e.id)} style={[styles.exercise, { borderColor: colors.border }]}>
          <View style={styles.flex}><AppText variant="headline">{e.name}</AppText><AppText numeric muted variant="subheadline">{signalLine(e.signal) ?? (e.status === 'stable' ? 'Se mantuvo.' : REASON_LABELS[e.reason] ?? (e.reason === 'single_session' ? 'Una sola sesión; todavía sin comparación.' : 'Datos insuficientes.'))}</AppText>
            {data.inPeriod?.method !== 'own' && e.firstDate && e.lastDate ? <AppText numeric muted variant="caption">{shortRange({ start: e.firstDate, end: e.firstDate }, data.today)} → {shortRange({ start: e.lastDate, end: e.lastDate }, data.today)}</AppText> : null}
            {previous ? <AppText muted numeric variant="caption">Frente a {compareText}: {previous.status === 'insufficient_data' ? REASON_LABELS[previous.reason] ?? 'Sin comparación.' : signalLine(previous.signal) ?? 'Estable'}</AppText> : null}
          </View><AppIcon name="chevronRight" color={colors.textMuted} size={17} />
        </Pressable>;
      })}
      {!filtered.length ? <AppText muted>Sin ejercicios en este grupo.</AppText> : null}
      {filtered.length > 3 ? <Button label={all ? 'Mostrar menos' : `Ver los ${filtered.length} ejercicios`} variant="quiet" onPress={() => setAll(!all)} /> : null}
    </> : <AppText muted>No pudimos consultar la comparación dentro del período.</AppText>}
    {previousOnly.length ? <Disclosure title={`Sólo en la referencia (${previousOnly.length})`}><AppText muted variant="footnote">Estos ejercicios no aparecen en tus sesiones del período actual.</AppText>{previousOnly.map(e => <Button key={e.id} label={e.name} variant="quiet" onPress={() => open(e.id)} />)}</Disclosure> : null}
    <Disclosure title="Récords" testID="training-prs">{data.personalRecords.length ? data.personalRecords.map(pr => <Button key={pr.exerciseId} label={`${pr.name} · ${pr.description}`} variant="quiet" onPress={() => open(pr.exerciseId)} />) : <AppText muted>Sin récords nuevos en este período.</AppText>}</Disclosure>
  </View>;
}

function Muscles({ data, open }: { data: ProgressTraining; open: (id: string) => void }) {
  const { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions(), { compareOn } = useProgressRange();
  const [selected, select] = useState<string | null>(null);
  const items = (data.story?.muscles ?? data.muscles.map(m => ({ ...m, previousSets: 0, exerciseIds: [] }))).filter(m => compareOn || m.sessions > 0).slice().sort((a, b) => b.sets - a.sets || a.label.localeCompare(b.label));
  const max = Math.max(1, ...items.flatMap(m => [m.sets, compareOn ? m.previousSets : 0]));
  return <View style={styles.section} testID="training-breakdown"><SectionTitle description="Series y frecuencia por grupo muscular.">Qué trabajaste</SectionTitle>
    {compareOn && data.story ? <AppText muted variant="caption">Barra: actual · línea fina: referencia</AppText> : null}
    {items.map(m => <View key={m.key}><Pressable accessibilityRole="button" accessibilityState={{ expanded: selected === m.key }} accessibilityLabel={`${m.label}: ${plural(m.sets, 'serie', 'series')}, ${plural(m.sessions, 'sesión', 'sesiones')}${compareOn && data.story ? `; antes ${m.previousSets} series` : ''}`}
      onPress={() => select(selected === m.key ? null : m.key)} style={[styles.muscle, fontScale > 1.3 && styles.vertical]}>
      <AppText style={styles.flex}>{m.label}</AppText><View style={styles.muscleBars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><View style={[styles.fill, { width: `${m.sets / max * 100}%`, backgroundColor: colors.primary }]} />{compareOn && data.story ? <View style={[styles.previousBar, { width: `${m.previousSets / max * 100}%`, backgroundColor: colors.textMuted }]} /> : null}</View>
      <View><AppText numeric variant="subheadline">{plural(m.sets, 'serie', 'series')}</AppText>{compareOn && data.story ? <AppText muted numeric variant="caption">{m.previousSets} antes</AppText> : null}</View>
    </Pressable>{selected === m.key ? <View style={[styles.detail, { backgroundColor: colors.surfaceRaised }]}><AppText numeric>{plural(m.sessions, 'sesión', 'sesiones')} con este grupo.</AppText><AppText muted variant="footnote">Menos series no equivale a trabajo insuficiente.</AppText>{m.exerciseIds.map(id => <Button key={id} label={data.exercises.find(e => e.id === id)?.name ?? 'Ver ejercicio'} variant="quiet" onPress={() => open(id)} />)}</View> : null}</View>)}
    {!items.length ? <AppText muted>Sin grupos musculares registrados en este período.</AppText> : null}
    <AppText muted variant="caption">Repeticiones y cargas, al abrir cada ejercicio. No se suman como si fueran equivalentes entre movimientos.</AppText>
  </View>;
}

export function TrainingStory({ data, chart }: { data: ProgressTraining; chart: ReactNode }) {
  const router = useRouter(), { compareOn } = useProgressRange(), { colors } = useOwnlevelTheme();
  const open = (id: string) => router.push({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id } });
  const routines = data.story?.routines.filter(r => r.sessions > 0) ?? [];
  const timed = routines.filter((r): r is Routine & { averageMinutes: number } => r.averageMinutes !== null);
  const maxMinutes = Math.max(0, ...timed.map(r => r.averageMinutes));
  const longest = timed.filter(r => r.averageMinutes === maxMinutes);
  const durationFinding = timed.length > 1 && timed.some(r => r.averageMinutes < maxMinutes);
  const absent = compareOn ? data.story?.routines.filter(r => r.sessions === 0 && r.previousSessions > 0) ?? [] : [];
  const unassessed = trainingPerformanceRows(data)?.filter(r => r.status === 'insufficient_data') ?? [];
  return <>
    <Activity data={data} />
    {chart}
    {!data.summary.sessions ? <AppText muted>Sin entrenamientos en este período.</AppText> : null}
    {!data.story ? <AppText muted variant="footnote">El detalle ampliado por rutina no está disponible en esta lectura. Podés consultar las sesiones y los ejercicios.</AppText> : null}
    <Routines data={data} open={open} /><Performance data={data} open={open} /><Muscles data={data} open={open} />
    <View style={styles.section}><SectionTitle description="Pistas de tus registros, sin suponer tus objetivos.">Para revisar</SectionTitle>
      {durationFinding ? <View style={[styles.review, { borderColor: colors.border }]}><AppIcon name="clock" color={colors.textMuted} size={20} /><View style={styles.flex}><AppText variant="headline">{longest.length === 1 ? `${longest[0].name} es tu rutina más larga` : `${longest.map(r => r.name).join(' y ')} son tus rutinas más largas`}</AppText><AppText muted numeric>{fmt(maxMinutes)} min por sesión. Solo se comparan rutinas con horarios completos. El tiempo incluye descansos; no mide intensidad.</AppText>{longest.map(r => <ProgressRow key={r.id} label={`Ver último día de ${r.name}`} onPress={() => r.lastDate && router.push({ pathname: '/history/day/[date]', params: { date: r.lastDate } })}><AppText style={styles.flex}>Ver último día de {r.name}</AppText></ProgressRow>)}</View></View> : null}
      {absent.length ? <View style={[styles.review, { borderColor: colors.border }]}><AppIcon name="calendar" color={colors.textMuted} size={20} /><View style={styles.flex}><AppText variant="headline">Rutinas sin sesiones en este período</AppText><AppText muted>{absent.map(r => r.name).join(', ')}. Sí aparecen en la referencia. Esto no confirma que las hayas dejado de hacer.</AppText><ProgressRow label="Ver últimas sesiones" onPress={() => router.push('/(tabs)/train/history')}><AppText style={styles.flex}>Ver últimas sesiones</AppText></ProgressRow></View></View> : null}
      {unassessed.length ? <View style={[styles.review, { borderColor: colors.border }]}><AppIcon name="info" color={colors.textMuted} size={20} /><View style={styles.flex}><AppText variant="headline">Hay progreso que no se puede evaluar</AppText><AppText muted>{plural(unassessed.length, 'ejercicio sin comparación suficiente', 'ejercicios sin comparación suficiente')}. Revisá esos registros antes de sacar conclusiones.</AppText>{unassessed.slice(0, 2).map(e => <ProgressRow key={e.id} label={`Revisar ${e.name}`} onPress={() => open(e.id)}><AppText style={styles.flex}>Revisar {e.name}</AppText></ProgressRow>)}</View></View> : null}
      {!unassessed.length && !absent.length && !durationFinding ? <AppText muted>Podés seguir explorando las rutinas y ejercicios de arriba para revisar tus registros.</AppText> : null}
    </View>
    <Disclosure title="Cómo te sentiste" testID="training-feelings">{data.feelings.map(f => <View key={f.key} style={styles.stack}><AppText>{f.label}</AppText><AppText numeric variant="title2">{fmt(f.average)} de {f.scaleMaximum}</AppText><AppText muted numeric variant="caption">{f.registered} de {f.eligible} sesiones{f.ratio < 0.5 ? ' · pocas con registro' : ''}</AppText></View>)}{!data.feelings.length ? <AppText muted>Sin sensaciones registradas en este período.</AppText> : null}</Disclosure>
  </>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, marginTop: spacing.xl }, stack: { gap: spacing.xs }, flex: { flex: 1, gap: spacing.xs },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, vertical: { flexDirection: 'column', alignItems: 'stretch' },
  hero: { padding: brandTokens.layout.cardPadding, borderRadius: radius.card, gap: spacing.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flexGrow: 1, flexBasis: 88, gap: spacing.xs }, weeks: { gap: spacing.xs, flexGrow: 1, paddingVertical: spacing.xs },
  week: { flex: 1, minWidth: brandTokens.layout.minTouch, gap: spacing.xs, padding: spacing.xs, borderWidth: 1, borderRadius: radius.inner },
  blocks: { flexDirection: 'column-reverse', gap: spacing.xs }, block: { height: spacing.md, borderRadius: spacing.xs },
  routine: { paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  rail: { height: 6, borderRadius: radius.full }, fill: { height: 6, borderRadius: radius.full },
  detail: { padding: spacing.md, borderRadius: radius.inner, gap: spacing.sm },
  performanceCounts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, count: { flex: 1, minWidth: 64, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: radius.inner, alignItems: 'center', borderBottomWidth: 2, minHeight: brandTokens.layout.minTouch }, largeCount: { flexBasis: '40%' },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: brandTokens.layout.minTouch, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  muscle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: brandTokens.layout.minTouch }, muscleBars: { flex: 1, minWidth: spacing.xl, gap: spacing.xs }, previousBar: { height: 2, borderRadius: radius.full },
  review: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  disclosure: { borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm }, disclosureButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: brandTokens.layout.minTouch, paddingVertical: spacing.sm },
});

export { Disclosure as TrainingDisclosure };
