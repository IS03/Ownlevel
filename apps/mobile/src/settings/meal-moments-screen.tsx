import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppIcon, AppText, Button, brandTokens, pressedStyle, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { DEFAULT_MEAL_MOMENT_BANDS, MEAL_MOMENT_BAND_KEYS, type MealMomentBands } from '@/api/nutrition-moment-bands';
import { useMealMomentBands } from '@/nutrition/moment-bands-provider';
import { SaveButton } from '@/nutrition/save-button';
import { EditorialScreen, ScreenTitle } from './editorial';

/** Steps of half an hour: on the server's 15-minute grid, and few taps to move a band. */
const STEP = 30;
type Key = (typeof MEAL_MOMENT_BAND_KEYS)[number];
/** One row per moment, edited by where it ends: each moment starts where the previous one ends. */
const ROWS: { key: Key; from: Key; moment: string }[] = [
  { key: 'lunchFrom', from: 'breakfastFrom', moment: 'Desayuno' },
  { key: 'snackFrom', from: 'lunchFrom', moment: 'Almuerzo' },
  { key: 'dinnerFrom', from: 'snackFrom', moment: 'Merienda' },
  { key: 'dinnerUntil', from: 'dinnerFrom', moment: 'Cena' },
];
const START_LABEL = 'Arranque del día';
export const clockOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const spokenClock = (minutes: number) => `${Math.floor(minutes / 60)} y ${minutes % 60 ? `${minutes % 60}` : 'cero'}`;

/** How far a limit can move: strictly after the one before and before the one after (whole day for the ends). */
function range(bands: MealMomentBands, index: number) {
  const values = MEAL_MOMENT_BAND_KEYS.map(k => bands[k]);
  return { min: index === 0 ? 0 : values[index - 1]! + 15, max: index === values.length - 1 ? 1440 : values[index + 1]! - 15 };
}
function step(bands: MealMomentBands, index: number, delta: number): MealMomentBands | null {
  const key = MEAL_MOMENT_BAND_KEYS[index]!, { min, max } = range(bands, index);
  // From an off-grid value (15) the first step lands on the 30-minute grid.
  const raw = delta > 0 ? Math.floor(bands[key] / STEP) * STEP + STEP : Math.ceil(bands[key] / STEP) * STEP - STEP;
  const next = Math.min(max, Math.max(min, raw));
  return next === bands[key] ? null : { ...bands, [key]: next };
}

/** Ajustes › Horarios de comidas: when a meal loaded now is suggested as Desayuno, Almuerzo, Merienda or Cena. */
export function MealMomentsScreen() {
  const context = useMealMomentBands();
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const saved = context?.bands ?? DEFAULT_MEAL_MOMENT_BANDS;
  const [draft, setDraft] = useState<MealMomentBands>(saved);
  const [justSaved, setJustSaved] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  // Server truth that arrives (first read, a conflict) replaces an untouched draft (adjusted while rendering, not in an effect).
  const [base, setBase] = useState(saved);
  if (JSON.stringify(base) !== JSON.stringify(saved)) {
    setBase(saved);
    if (JSON.stringify(draft) === JSON.stringify(base)) setDraft(saved);
  }
  useEffect(() => { if (!justSaved) return; const t = setTimeout(() => setJustSaved(false), 1200); return () => clearTimeout(t); }, [justSaved]);
  if (!context) return null;
  const { state } = context;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const writable = state.availability === 'ok' && !state.saving;
  const isDefault = JSON.stringify(draft) === JSON.stringify(DEFAULT_MEAL_MOMENT_BANDS);
  const stacked = fontScale > 1.3;
  const save = async () => { if (await context.save(draft) === 'saved') setJustSaved(true); };
  return <EditorialScreen>
    <ScreenTitle>Horarios de comidas</ScreenTitle>
    <AppText muted>Cuando cargás una comida, la app sugiere el momento según la hora. Las que ya cargaste no cambian.</AppText>
    <DayBands bands={draft} />
    {state.availability === 'loading' ? <ActivityIndicator color={colors.textMuted} accessibilityLabel="Cargando tus horarios" /> : null}
    <View>
      {ROWS.map(row => {
        const index = MEAL_MOMENT_BAND_KEYS.indexOf(row.key);
        const value = draft[row.key], earlier = step(draft, index, -1), later = step(draft, index, 1);
        const label = `${row.moment} hasta`;
        return <View key={row.key} style={[styles.row, stacked && styles.stacked, { borderBottomColor: colors.border }]} testID={`moment-band-${row.key}`}>
          <View style={styles.label}>
            <AppText variant="headline">{row.moment}</AppText>
            <AppText muted numeric variant="footnote">{`${clockOf(draft[row.from])} a ${clockOf(value)}`}</AppText>
          </View>
          <Stepper label={label} value={value} valueTestID={`moment-band-${row.key}-value`} prefix="hasta" earlier={earlier} later={later} writable={writable} onChange={setDraft} reduceMotion={reduceMotion} />
        </View>;
      })}
    </View>
    <View style={{ gap: 12 }} testID="moment-band-breakfastFrom">
      <View style={[styles.startLine, stacked && styles.stacked]}>
        <AppText muted variant="footnote" style={styles.label}>
          {'El día de comidas arranca a las '}
          <AppText muted numeric variant="footnote" testID="moment-band-breakfastFrom-value">{clockOf(draft.breakfastFrom)}</AppText>
          {`. Entre ${clockOf(draft.dinnerUntil)} y ${clockOf(draft.breakfastFrom)} no sugerimos momento: lo elegís vos.`}
        </AppText>
        {!editingStart ? <Button label="Cambiar" variant="quiet" disabled={!writable} onPress={() => setEditingStart(true)} /> : null}
      </View>
      {editingStart ? <View style={[styles.row, stacked && styles.stacked, { borderBottomColor: colors.border }]}>
        <View style={styles.label}><AppText variant="headline">Arranca</AppText></View>
        <Stepper label={START_LABEL} value={draft.breakfastFrom} earlier={step(draft, 0, -1)} later={step(draft, 0, 1)} writable={writable} onChange={setDraft} reduceMotion={reduceMotion} />
      </View> : null}
    </View>
    {state.message ? <AppText accessibilityRole="alert" accessibilityLiveRegion="polite">{state.message}</AppText> : null}
    {state.availability === 'unavailable' ? <Button label="Reintentar" variant="quiet" onPress={context.reload} /> : null}
    <View style={{ gap: 8 }}>
      <SaveButton state={state.saving ? 'saving' : justSaved ? 'done' : 'idle'} label={state.pending ? 'Probar de nuevo' : 'Guardar'}
        disabled={!writable || (!dirty && !state.pending)} onPress={() => void save()} testID="moment-bands-save" />
      {!isDefault ? <Button label="Volver a los de siempre" variant="quiet" disabled={!writable} onPress={() => setDraft(DEFAULT_MEAL_MOMENT_BANDS)} /> : null}
    </View>
  </EditorialScreen>;
}

/** A clock moved in half hours (also reused by Ajustes → Avisos for a reminder's time). */
export function Stepper<T>({ label, value, valueTestID, prefix, earlier, later, writable, onChange, reduceMotion }: {
  label: string; value: number; valueTestID?: string; prefix?: string; earlier: T | null; later: T | null;
  writable: boolean; onChange: (next: T) => void; reduceMotion: boolean;
}) {
  const move = (next: T | null) => { if (next && writable) { triggerHaptic('stepperChange'); onChange(next); } };
  return <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: spokenClock(value) }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => { const next = event.nativeEvent.actionName === 'increment' ? later : earlier; if (next && writable) onChange(next); }}>
    <StepButton icon="minus" label={`${label}, media hora antes`} disabled={!writable || !earlier} onPress={() => move(earlier)} reduceMotion={reduceMotion} />
    <View style={styles.clock}>
      {prefix ? <AppText muted variant="caption">{prefix}</AppText> : null}
      <AppText numeric variant="title2" testID={valueTestID}>{clockOf(value)}</AppText>
    </View>
    <StepButton icon="plus" label={`${label}, media hora después`} disabled={!writable || !later} onPress={() => move(later)} reduceMotion={reduceMotion} />
  </View>;
}

function StepButton({ icon, label, disabled, onPress, reduceMotion }: { icon: 'plus' | 'minus'; label: string; disabled: boolean; onPress: () => void; reduceMotion: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.step, { backgroundColor: colors.surface, opacity: disabled ? 0.4 : 1 }, pressedStyle(pressed, reduceMotion)]}>
    <AppIcon name={icon} size={17} color={colors.text} />
  </Pressable>;
}

/** The day from 00 to 24 h with the four moments in steps of one hue and their names on top; the hours without a moment are a dashed gap, not a band. */
function DayBands({ bands }: { bands: MealMomentBands }) {
  const { colors } = useOwnlevelTheme();
  const parts = useMemo(() => [
    { name: 'Desayuno', short: 'D', from: bands.breakfastFrom, to: bands.lunchFrom, opacity: 1 },
    { name: 'Almuerzo', short: 'A', from: bands.lunchFrom, to: bands.snackFrom, opacity: 0.75 },
    { name: 'Merienda', short: 'M', from: bands.snackFrom, to: bands.dinnerFrom, opacity: 0.5 },
    { name: 'Cena', short: 'C', from: bands.dinnerFrom, to: bands.dinnerUntil, opacity: 0.3 },
  ], [bands]);
  const gaps = [{ from: 0, to: bands.breakfastFrom }, { from: bands.dinnerUntil, to: 1440 }].filter(g => g.to > g.from);
  const pos = (from: number, to: number) => ({ left: `${(from / 1440) * 100}%` as const, width: `${((to - from) / 1440) * 100}%` as const });
  return <View style={{ gap: 6 }} accessible accessibilityLabel={parts.map(p => `${p.name} de ${clockOf(p.from)} a ${clockOf(p.to)}`).join('. ')} testID="moment-bands-day">
    <View style={styles.names}>
      {parts.map(p => <View key={p.name} style={[styles.part, pos(p.from, p.to)]}>
        <AppText muted variant="caption" numberOfLines={1} style={styles.name}>{p.to - p.from >= 180 ? p.name : p.short}</AppText>
      </View>)}
    </View>
    <View style={styles.track}>
      {gaps.map(g => <View key={g.from} style={[styles.part, styles.gap, pos(g.from, g.to), { borderColor: colors.border }]} />)}
      {parts.map(p => <View key={p.name} style={[styles.part, styles.band, pos(p.from, p.to), { backgroundColor: colors.primary, opacity: p.opacity }]} />)}
    </View>
    <View style={styles.ticks}>{['00', '06', '12', '18', '24'].map(t => <AppText key={t} muted numeric variant="caption">{t}</AppText>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: brandTokens.layout.minTouch + 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  label: { flexShrink: 1, gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: brandTokens.layout.minTouch, height: brandTokens.layout.minTouch, borderRadius: brandTokens.layout.minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  clock: { minWidth: 72, alignItems: 'center' },
  startLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  names: { height: 18 },
  name: { textAlign: 'center' },
  track: { height: 14 },
  part: { position: 'absolute', top: 0, bottom: 0 },
  band: { borderRadius: 3 },
  gap: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 3 },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
});
