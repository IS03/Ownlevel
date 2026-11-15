import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { fetchMobileTrainingExercises, useApiResource } from '@/api';
import type { MobileApiClient } from '@/api/client';
import type { QuickSessionHistoryDto, SessionDetailDto, SessionExerciseDto } from '@/api/active-session';
import type { MobileTrainingExercise, MobileTrainingMuscleGroup } from '@/api/exercises';
import { AppText, Button, Chip, EmptyState, InlineUnavailable, SkeletonBlock, Surface, spacing, brandTokens, useOwnlevelTheme } from '@/design-system';
import { pickerExercises } from './routine-editor-model';
import { compactActual, historyLoadLabel, quickHistoryDate, quickHistoryFold, quickHistoryRows, quickHistoryTargetRir, quickSessions, type QuickHistoryRow } from './active-session-model';
import { RoutineExercisePickerBody } from './routine-exercise-picker-body';
import { RoutineEditorSheet } from './routine-editor-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
export { SessionNoteSheet } from './session-note-sheet';

function PickerBody({ client, existingIds, onClose, onCreate, onAdd }: {
  client: MobileApiClient; existingIds: ReadonlySet<string>; onClose: () => void; onCreate: (name: string) => void; onAdd: (exercise: MobileTrainingExercise) => Promise<boolean>;
}) {
  const [search, setSearch] = useState(''), [group, setGroup] = useState<MobileTrainingMuscleGroup | null>(null);
  const tapped = useRef(false), alive = useRef(true);
  const [adding, setAdding] = useState<{ id: string; done: boolean } | null>(null);
  useEffect(() => () => { alive.current = false; }, []);
  // The write starts at once; the row shows a short spinner, then ✓, and the sheet closes.
  // A slow write keeps going in the background after ~1 s; a failed one closes without ✓ (the session shows its error).
  const add = async (exercise: MobileTrainingExercise) => {
    setAdding({ id: exercise.id, done: false });
    const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const [result] = await Promise.all([Promise.race([onAdd(exercise), wait(1000).then(() => 'pending' as const)]), wait(250)]);
    if (!alive.current) return;
    if (result === false) { onClose(); return; }
    setAdding({ id: exercise.id, done: true }); await wait(350);
    if (alive.current) onClose();
  };
  const load = useCallback((signal: AbortSignal) => fetchMobileTrainingExercises(client, signal), [client]);
  const { state, refresh } = useApiResource(load);
  const current = state.status === 'ready' ? state.current : state.status === 'loading' ? undefined : state.previous;
  const catalog = current?.data.catalog;
  const rows = useMemo(() => catalog?.status === 'ok' ? pickerExercises(catalog.data.exercises, new Set(), search, group) : [], [catalog, group, search]);
  const fresh = state.status === 'ready' && catalog?.status === 'ok';
  return <View style={styles.root}>
    <View style={styles.header}><RoutineSheetButton label="Cerrar agregar ejercicio" icon="close" onPress={onClose} /><AppText accessibilityRole="header" variant="headline">Agregar ejercicio</AppText></View>
    {!current && state.status === 'loading' ? <SkeletonBlock height={180} /> : catalog?.status !== 'ok' ? <InlineUnavailable message="No pudimos cargar la biblioteca." actionLabel="Reintentar" onAction={() => void refresh()} /> : <>
      {!fresh ? <InlineUnavailable message="Mostramos la última lectura confirmada. Actualizá antes de agregar." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
      <RoutineExercisePickerBody session canCreate={fresh} query={search} onQuery={setSearch} group={group} onGroup={setGroup} rows={rows} existing={existingIds} selected={[]} disabled={!fresh || adding !== null} adding={adding}
        onCreate={() => { if (fresh && !tapped.current) { tapped.current = true; onCreate(search.trim()); } }} onToggle={id => {
          const exercise = rows.find(row => row.id === id);
          if (!fresh || !exercise || existingIds.has(id) || tapped.current) return;
          tapped.current = true; void add(exercise);
        }} />
    </>}
  </View>;
}
export function SessionExercisePicker({ visible, client, existingIds, onClose, onDismiss, onCreate, onAdd }: {
  visible: boolean; client: MobileApiClient; existingIds: ReadonlySet<string>; onClose: () => void; onDismiss: () => void;
  onCreate: (name: string) => void; onAdd: (exercise: MobileTrainingExercise) => Promise<boolean>;
}) {
  return <RoutineEditorSheet open={visible} pending={false} onClose={onClose} onDismissed={onDismiss}>
    {visible ? <PickerBody client={client} existingIds={existingIds} onClose={onClose} onCreate={onCreate} onAdd={onAdd} /> : <View />}
  </RoutineEditorSheet>;
}
const decisionLabel = { maintain: null, custom: 'Dejaste un recordatorio personalizado', increase_weight: 'Pediste más peso para la próxima', increase_reps: 'Pediste más reps para la próxima' };
export function SessionQuickHistory({ exercise, history, routineId = null, routineName, canUse = true, onClose, onRefresh, onUse }: {
  exercise: SessionExerciseDto; history: SessionDetailDto['quickHistory']; routineId?: string | null; routineName?: string; canUse?: boolean;
  onClose: () => void; onRefresh: () => void; onUse: (session: QuickSessionHistoryDto) => void;
}) {
  const [filter, setFilter] = useState<string | null>(routineId);
  const sessions = history.status === 'ok' ? quickSessions(history.data[exercise.exerciseId] ?? []) : [];
  const routines = new Map(sessions.filter(row => row.routineId).map(row => [row.routineId!, row.routineName]));
  if (routineId) routines.set(routineId, routineName ?? routines.get(routineId) ?? 'esta rutina');
  const visible = filter === null ? sessions : sessions.filter(row => row.routineId === filter);
  // The close button lowers the native sheet with its content; the screen unmounts it only once it is down (no white flash).
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const { fontScale } = useWindowDimensions(), large = fontScale > 1.3;
  // The set-number column grows with the text so a range («10–12») never pushes its load out of line.
  const numberWidth = Math.ceil(40 * Math.min(Math.max(fontScale, 1), 2));
  return <RoutineEditorSheet open={open} pending={false} onClose={close} onDismissed={onClose}><View style={styles.root}>
    <View style={styles.header}><View style={{ flex: 1 }}><AppText accessibilityRole="header" variant="title2">Historial</AppText><AppText muted variant="footnote">{exercise.nameSnapshot}</AppText></View><RoutineSheetButton label="Cerrar Historial" icon="close" onPress={close} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipContent}>
      <Chip kind="toggle" label="Todas" selected={filter === null} onPress={() => setFilter(null)} />
      {[...routines].map(([id, name]) => <Chip kind="toggle" key={id} label={name} selected={filter === id} onPress={() => setFilter(id)} />)}
    </ScrollView>
    <ScrollView contentContainerStyle={styles.historyContent}>
      {history.status === 'unavailable' ? <InlineUnavailable message="No pudimos consultar las últimas sesiones. Podés seguir entrenando." actionLabel="Reintentar" onAction={onRefresh} /> :
        visible.length === 0 ? <><EmptyState title={filter ? `Todavía no lo hiciste en ${routines.get(filter)}` : 'Todavía sin registros'} description={filter ? 'Estas son las últimas seis sesiones disponibles.' : 'No hay sesiones finalizadas con este ejercicio.'} />{filter ? <Button label="Ver todas" onPress={() => setFilter(null)} variant="quiet" /> : null}</> : visible.map(session =>
          <QuickHistoryCard key={session.sessionId} session={session} showRoutine={filter === null} expanded={expanded.has(session.sessionId)} large={large} numberWidth={numberWidth} canUse={canUse}
            onExpand={() => setExpanded(prev => new Set(prev).add(session.sessionId))} onUse={onUse} />)}
    </ScrollView>
  </View></RoutineEditorSheet>;
}
/**
 * Compact card (#513): completed sets only, consecutive identical sets in one row, target RIR once when shared.
 * Folding long sessions is visual only: «Usar» always hands over the whole session.
 */
function QuickHistoryCard({ session, showRoutine, expanded, large, numberWidth, canUse, onExpand, onUse }: {
  session: QuickSessionHistoryDto; showRoutine: boolean; expanded: boolean; large: boolean; numberWidth: number; canUse: boolean;
  onExpand: () => void; onUse: (session: QuickSessionHistoryDto) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const date = quickHistoryDate(session.logDate);
  const rows = quickHistoryRows(session.sets), rir = quickHistoryTargetRir(session.sets);
  const completed = rows.reduce((total, row) => total + row.count, 0);
  const { shown, hiddenSets } = quickHistoryFold(rows, expanded);
  const summary = completed === 0 ? 'Sin series completadas'
    : `${completed} ${completed === 1 ? 'serie' : 'series'}${typeof rir === 'number' ? ` · RIR obj. ${compactActual(rir)}` : ''}`;
  return <Surface testID={`quick-history-session-${session.sessionId}`} style={styles.card}>
    {/* Date and summary share the 44 pt «Usar» row, so the target adds no empty band under the date. */}
    <View style={styles.cardHeader}>
      <View style={styles.flex}>
        <AppText numeric variant="headline">{date}{showRoutine ? <AppText muted variant="headline">{` · ${session.routineName}`}</AppText> : null}</AppText>
        <AppText muted numeric variant="footnote">{summary}</AppText>
      </View>
      <UseAction date={date} disabled={!canUse || completed === 0} onPress={() => onUse(session)} />
    </View>
    {decisionLabel[session.decision] ? <AppText muted variant="footnote">{decisionLabel[session.decision]}</AppText> : null}
    {shown.length ? <View style={styles.sets}>{shown.map(row => <QuickHistorySetRow key={row.from} row={row} perRowRir={rir === 'mixed'} large={large} numberWidth={numberWidth} />)}</View> : null}
    {hiddenSets > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${hiddenSets} series más`} onPress={onExpand} testID="quick-history-more"
      style={({ pressed }) => [styles.more, { opacity: pressed ? 0.6 : 1 }]}>
      <AppText numeric variant="subheadline" style={{ color: colors.primary }}>Ver {hiddenSets} series más</AppText>
    </Pressable> : null}
  </Surface>;
}
function QuickHistorySetRow({ row, perRowRir, large, numberWidth }: { row: QuickHistoryRow; perRowRir: boolean; large: boolean; numberWidth: number }) {
  const load = historyLoadLabel(row);
  const rir = perRowRir && row.targetRir !== null ? compactActual(row.targetRir) : null;
  const spoken = `${row.count === 1 ? `Serie ${row.from}` : `Series ${row.from} a ${row.to}`}: ${load}${rir ? `, RIR objetivo ${rir}` : ''}${row.note ? `. Nota: ${row.note}` : ''}`;
  return <View accessible accessibilityLabel={spoken} testID={`quick-history-row-${row.from}`}>
    <View style={styles.setRow}>
      <AppText muted numeric variant="footnote" style={{ minWidth: numberWidth }}>{row.count === 1 ? row.from : `${row.from}–${row.to}`}</AppText>
      <View style={[styles.setBody, large && styles.setBodyStacked]}>
        <AppText numeric variant="body" style={large ? null : styles.flex}>{load}</AppText>
        {rir ? <AppText muted numeric variant="footnote">RIR obj. {rir}</AppText> : null}
      </View>
    </View>
    {row.note ? <AppText muted variant="footnote" style={{ marginLeft: numberWidth + spacing.sm }}>{row.note}</AppText> : null}
  </View>;
}
/**
 * «Usar» as a text action, like the other inline actions: a 50 pt button made every card header that tall and left empty
 * space around the date. Allocate the minimum target: hitSlop is clipped to the header row bounds.
 */
function UseAction({ date, disabled, onPress }: { date: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Usar" accessibilityHint={`Copia las series del ${date} en este ejercicio.`}
    accessibilityState={{ disabled }} disabled={disabled} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={onPress}
    style={({ pressed }) => ({ minHeight: brandTokens.layout.minTouch, minWidth: brandTokens.layout.minTouch, justifyContent: 'center', alignItems: 'flex-end', opacity: disabled ? 0.45 : pressed ? 0.6 : 1 })} testID="quick-history-use">
    <AppText variant="headline" style={{ color: colors.primary }}>Usar</AppText>
  </Pressable>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, header: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, chips: { flexGrow: 0 }, chipContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md }, historyContent: { padding: spacing.lg, gap: spacing.md }, flex: { flex: 1 },
  // Local override of Surface (not global): tighter padding and inner gap than the default card.
  card: { paddingTop: spacing.md, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.xs },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sets: { marginTop: spacing.xs, gap: spacing.xs },
  setRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  setBody: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  setBodyStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 0 },
  // The 44 pt target reaches into the card's bottom padding instead of adding a band under the text.
  more: { minHeight: brandTokens.layout.minTouch, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: -spacing.md } });
