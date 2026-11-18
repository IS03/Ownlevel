import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppIcon, AppText, Button, Heading, brandTokens, pressedStyle, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { DEFAULT_MEAL_MOMENT_BANDS, MEAL_MOMENT_BAND_KEYS, type MealMomentBands } from '@/api/nutrition-moment-bands';
import { useMealMomentBands } from '@/nutrition/moment-bands-provider';
import { SaveButton } from '@/nutrition/save-button';
import { EditorialScreen } from './editorial';

/** Steps of half an hour: on the server's 15-minute grid, and few taps to move a band. */
const STEP = 30;
type Key = (typeof MEAL_MOMENT_BAND_KEYS)[number];
const ROWS: { key: Key; moment: string; edge: string }[] = [
  { key: 'breakfastFrom', moment: 'Desayuno', edge: 'desde' },
  { key: 'lunchFrom', moment: 'Almuerzo', edge: 'desde' },
  { key: 'snackFrom', moment: 'Merienda', edge: 'desde' },
  { key: 'dinnerFrom', moment: 'Cena', edge: 'desde' },
  { key: 'dinnerUntil', moment: 'Cena', edge: 'hasta' },
];
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
    <Heading>Horarios de comidas</Heading>
    <AppText muted>Cuando cargás una comida, la app sugiere el momento según la hora. Las que ya cargaste no cambian.</AppText>
    <DayBands bands={draft} />
    {state.availability === 'loading' ? <ActivityIndicator color={colors.textMuted} accessibilityLabel="Cargando tus horarios" /> : null}
    <View>
      {ROWS.map((row, index) => {
        const value = draft[row.key], earlier = step(draft, index, -1), later = step(draft, index, 1);
        const label = `${row.moment} ${row.edge}`;
        return <View key={row.key} style={[styles.row, stacked && styles.stacked, { borderBottomColor: colors.border }]} testID={`moment-band-${row.key}`}>
          <View style={styles.label}><AppText variant="headline">{row.moment}</AppText><AppText muted variant="footnote">{row.edge}</AppText></View>
          <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: spokenClock(value) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={event => { const next = event.nativeEvent.actionName === 'increment' ? later : earlier; if (next && writable) setDraft(next); }}>
            <StepButton icon="minus" label={`${label}, media hora antes`} disabled={!writable || !earlier} onPress={() => { if (earlier) { triggerHaptic('stepperChange'); setDraft(earlier); } }} reduceMotion={reduceMotion} />
            <AppText numeric variant="title2" style={styles.clock} testID={`moment-band-${row.key}-value`}>{clockOf(value)}</AppText>
            <StepButton icon="plus" label={`${label}, media hora después`} disabled={!writable || !later} onPress={() => { if (later) { triggerHaptic('stepperChange'); setDraft(later); } }} reduceMotion={reduceMotion} />
          </View>
        </View>;
      })}
    </View>
    <AppText muted variant="footnote">{`Entre ${clockOf(draft.dinnerUntil)} y ${clockOf(draft.breakfastFrom)} no se sugiere ningún momento: lo elegís vos.`}</AppText>
    {state.message ? <AppText accessibilityRole="alert" accessibilityLiveRegion="polite">{state.message}</AppText> : null}
    {state.availability === 'unavailable' ? <Button label="Reintentar" variant="quiet" onPress={context.reload} /> : null}
    <View style={{ gap: 8 }}>
      <SaveButton state={state.saving ? 'saving' : justSaved ? 'done' : 'idle'} label={state.pending ? 'Probar de nuevo' : 'Guardar'}
        disabled={!writable || (!dirty && !state.pending)} onPress={() => void save()} testID="moment-bands-save" />
      {!isDefault ? <Button label="Volver a los de siempre" variant="quiet" disabled={!writable} onPress={() => setDraft(DEFAULT_MEAL_MOMENT_BANDS)} /> : null}
    </View>
  </EditorialScreen>;
}

function StepButton({ icon, label, disabled, onPress, reduceMotion }: { icon: 'plus' | 'minus'; label: string; disabled: boolean; onPress: () => void; reduceMotion: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.step, { backgroundColor: colors.surface, opacity: disabled ? 0.4 : 1 }, pressedStyle(pressed, reduceMotion)]}>
    <AppIcon name={icon} size={17} color={colors.text} />
  </Pressable>;
}

/** The day from 00 to 24 h with the four moments in steps of one hue; the hours without a moment stay empty. */
function DayBands({ bands }: { bands: MealMomentBands }) {
  const { colors } = useOwnlevelTheme();
  const parts = useMemo(() => [
    { name: 'Desayuno', from: bands.breakfastFrom, to: bands.lunchFrom, opacity: 1 },
    { name: 'Almuerzo', from: bands.lunchFrom, to: bands.snackFrom, opacity: 0.75 },
    { name: 'Merienda', from: bands.snackFrom, to: bands.dinnerFrom, opacity: 0.5 },
    { name: 'Cena', from: bands.dinnerFrom, to: bands.dinnerUntil, opacity: 0.3 },
  ], [bands]);
  return <View style={{ gap: 6 }} accessible accessibilityLabel={parts.map(p => `${p.name} de ${clockOf(p.from)} a ${clockOf(p.to)}`).join('. ')} testID="moment-bands-day">
    <View style={[styles.track, { backgroundColor: colors.surface }]}>
      {parts.map(p => <View key={p.name} style={[styles.part, { left: `${(p.from / 1440) * 100}%`, width: `${((p.to - p.from) / 1440) * 100}%`, backgroundColor: colors.primary, opacity: p.opacity }]} />)}
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
  clock: { minWidth: 72, textAlign: 'center' },
  track: { height: 14, borderRadius: 7, overflow: 'hidden' },
  part: { position: 'absolute', top: 0, bottom: 0 },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
});
