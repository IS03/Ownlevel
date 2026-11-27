import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { findNodeHandle, InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, type ScrollView, type TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { BODY_MEASUREMENT_LABELS, type BodyMeasurementField } from '@/api/body';
import { AppIcon, AppSheet, AppText, TextField, appIconSize, brandTokens, pressedStyle, radius, sizes, spacing, useAppSheetDismiss, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import type { BodyController, BodyState } from './body-controller';
import { GUIDE_COMMON, MEASURE_GUIDES } from './body-measure-guides';
import { buildMeasurementLayout, referenceText, MEASURES, type MeasureReference, type PlannedMeasure } from './body-measure-layout';
import { formatBodyDate } from './body-model';
import type { MeasurementEditor } from './body-storage';

const { duration, spring } = brandTokens.motion;
const ZONES = [
  { key: 'trunk', label: 'Tronco', keys: ['waist', 'abdomen', 'chest', 'hip'] },
  { key: 'arms', label: 'Brazos', keys: ['arm'] },
  { key: 'thighs', label: 'Muslos', keys: ['thigh'] },
  { key: 'calves', label: 'Pantorrillas', keys: ['calf'] },
].map(zone => {
  const measures = MEASURES.filter(m => zone.keys.includes(m.key)).map(measure => ({ measure, fields: [...measure.fields] }));
  return { ...zone, measures, fields: measures.flatMap(m => m.fields) };
});
const FIELDS = ZONES.flatMap(zone => zone.fields);
function referenceDate(date: string, today?: string) {
  const full = formatBodyDate(date);
  return date.slice(0, 4) === today?.slice(0, 4) ? full.replace(/ \d{4}$/, '') : full;
}
type FieldsContext = {
  draft: MeasurementEditor['draft']; errors: Record<string, string>;
  references: Partial<Record<BodyMeasurementField, MeasureReference>>; editable: boolean; largeText: boolean;
  onChange: (field: BodyMeasurementField, value: string) => void;
  input: (field: BodyMeasurementField, node: TextInput | null) => void;
  onFocus: (field: BodyMeasurementField) => void;
  onNext: (field: BodyMeasurementField) => void;
  onGuide: (measure: PlannedMeasure['measure']['key']) => void;
  accessory: string;
};

function Field({ field, ctx }: { field: BodyMeasurementField; ctx: FieldsContext }) {
  const reference = ctx.references[field];
  const label = BODY_MEASUREMENT_LABELS[field];
  const previous = reference?.value;
  return <View style={[styles.field, !ctx.largeText && styles.fieldInRow]}>
    <TextField label={label} hideLabel inputRef={node => ctx.input(field, node)} value={ctx.draft[field]} onChangeText={v => ctx.onChange(field, v)} error={ctx.errors[field]}
      disabled={!ctx.editable} keyboardType="decimal-pad" placeholder={previous != null ? String(previous).replace('.', ',') : '—'} autoCorrect={false}
      selectTextOnFocus numeric accessibilityHint={reference ? referenceText(reference) : undefined} testID={`body-field-${field}`}
      returnKeyType={field === FIELDS.at(-1) ? 'done' : 'next'} submitBehavior="submit" onFocus={() => ctx.onFocus(field)}
      onSubmitEditing={() => ctx.onNext(field)} inputAccessoryViewID={ctx.accessory} />
  </View>;
}

function GuideClose() {
  const dismiss = useAppSheetDismiss();
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Cerrar guía" onPress={() => dismiss()} style={styles.info}>
    <AppIcon name="close" color={colors.textMuted} />
  </Pressable>;
}

function MeasureGroup({ planned, ctx }: { planned: PlannedMeasure; ctx: FieldsContext }) {
  const { colors } = useOwnlevelTheme();
  return <View style={styles.group}>
    <View style={styles.measureHeader}>
      <AppText variant="subheadline">{planned.measure.label} <AppText muted variant="subheadline">cm</AppText></AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Cómo medir ${planned.measure.label.toLowerCase()}`}
        style={styles.info} onPress={() => ctx.onGuide(planned.measure.key)} testID={`body-guide-${planned.measure.key}`}>
        <AppIcon name="info" color={colors.textMuted} size={appIconSize.inline} />
      </Pressable>
    </View>
    <View style={[styles.pair, ctx.largeText && styles.stacked]} testID={`body-pair-${planned.measure.key}`}>
      {planned.fields.map((field, index) => <View key={field} style={[styles.group, !ctx.largeText && styles.fieldInRow]}>
        {planned.fields.length > 1 ? <AppText muted variant="caption">{index === 0 ? 'Derecho' : 'Izquierdo'}</AppText> : null}
        <Field field={field} ctx={ctx} />
      </View>)}
    </View>
  </View>;
}

function RegionSection({ zone, open, filled, onToggle, ctx, today }: {
  zone: (typeof ZONES)[number]; open: boolean; filled: number; onToggle: () => void; ctx: FieldsContext; today?: string;
}) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const { label, key, fields, measures } = zone;
  const previous = useRef(filled);
  useEffect(() => {
    if (filled === fields.length && previous.current < fields.length) haptics.selection();
    previous.current = filled;
  }, [fields.length, filled]);
  const arrow = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? '180deg' : '0deg', { duration: reduced ? 0 : duration.fast }) }],
  }));
  const layout = reduced ? undefined : LinearTransition.springify().damping(spring.damping).stiffness(spring.stiffness).mass(spring.mass);
  const dates = [...new Set(fields.flatMap(field => ctx.references[field]?.date ?? []))];
  return <Animated.View layout={layout} style={[styles.zone, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${filled} de ${fields.length} medidas`} accessibilityState={{ expanded: open }}
      onPress={onToggle} testID={`body-region-${key}`} style={({ pressed }) => [styles.region, pressedStyle(pressed, reduced)]}>
      <AppText variant="headline" style={styles.regionText}>{label}</AppText>
      <Animated.View key={filled} entering={FadeIn.duration(duration.fast)} style={styles.count} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <AppText muted={filled === 0} numeric variant="footnote" style={filled > 0 ? { color: colors.primary } : undefined}>{filled} de {fields.length}</AppText>
        {filled > 0 ? <AppIcon name="checkmark" color={colors.primary} size={appIconSize.inline} /> : null}
      </Animated.View>
      <Animated.View style={arrow}><AppIcon name="chevronDown" color={colors.textMuted} size={appIconSize.row} /></Animated.View>
    </Pressable>
    {open ? <Animated.View layout={layout} exiting={FadeOut.duration(duration.fast)} style={styles.regionBody}>
      {dates.length ? <AppText muted numeric variant="caption">{dates.length === 1 ? `Anterior · ${referenceDate(dates[0], today)}`
        : `Referencias · ${dates.map(date => referenceDate(date, today)).join(' · ')}`}</AppText> : null}
      <View style={[styles.regionBody, measures.length > 1 && !ctx.largeText && styles.grid]}>
        {measures.map((m, index) => <Animated.View key={m.measure.key} entering={FadeIn.duration(duration.fast).delay(reduced ? 0 : index * (duration.base - duration.fast) / measures.length)}
          style={measures.length > 1 && !ctx.largeText ? styles.gridCell : undefined}><MeasureGroup planned={m} ctx={ctx} /></Animated.View>)}
      </View>
    </Animated.View> : null}
  </Animated.View>;
}

export function MeasurementFields({ editor, state, controller, editable, initialField, scrollRef }: { scrollRef: RefObject<ScrollView | null>; editor: MeasurementEditor; state: BodyState; controller: BodyController; editable: boolean; initialField?: BodyMeasurementField }) {
  const { fontScale, width } = useWindowDimensions();
  const { draft, baseline, mode } = editor;
  const { measurements, measurementsCursor, overview } = state.read;
  const editedId = baseline?.id ?? null, today = overview?.today;
  // Pure derivation from what the controller already loaded; recomputed when the draft date changes, with no network.
  const layout = useMemo(() => buildMeasurementLayout({ history: measurements, hasMore: measurementsCursor !== null, selectedDate: draft.date, editedId, mode, today }),
    [measurements, measurementsCursor, draft.date, editedId, mode, today]);
  const hasValue = (field: BodyMeasurementField) => draft[field].trim() !== '';
  const [initiallyFilled] = useState(() => new Set(ZONES.filter(zone => zone.fields.some(hasValue)).map(zone => zone.key)));
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [focused, setFocused] = useState<BodyMeasurementField | null>(null);
  const [requested, setRequested] = useState<BodyMeasurementField | null>(null);
  const [guide, setGuide] = useState<PlannedMeasure['measure']['key'] | null>(null);
  const accessory = useId();
  const inputs = useRef<Partial<Record<BodyMeasurementField, TextInput>>>({});
  const entryZone = ZONES.find(zone => initialField && zone.fields.includes(initialField))?.key ?? 'trunk';
  const defaultOpen = (key: string) => mode === 'edit' ? initiallyFilled.has(key) : key === entryZone;
  const intoView = (field: BodyMeasurementField) => {
    const handle = findNodeHandle(inputs.current[field] ?? null);
    if (handle != null) scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(handle, spacing.md, true);
  };
  useEffect(() => {
    if (!requested || !editable) return;
    const frame = requestAnimationFrame(() => {
      inputs.current[requested]?.focus();
      setRequested(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [editable, requested]);
  useEffect(() => {
    if (!focused) return;
    const listener = Keyboard.addListener('keyboardDidShow', () => {
      const handle = findNodeHandle(inputs.current[focused] ?? null);
      if (handle != null) scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(handle, spacing.md, true);
    });
    return () => listener.remove();
  }, [focused, scrollRef]);
  const next = (field: BodyMeasurementField) => {
    const following = FIELDS[FIELDS.indexOf(field) + 1];
    if (!following) { Keyboard.dismiss(); setFocused(null); return; }
    const zone = ZONES.find(item => item.fields.includes(following));
    if (zone) setToggled(prev => ({ ...prev, [zone.key]: true }));
    setRequested(following);
  };
  const ctx: FieldsContext = { draft, errors: state.errors, references: layout.references, editable, largeText: fontScale > 1.3 || width < 375,
    onChange: (field, value) => controller.change(field, value), accessory,
    input: (field, node) => { if (node) inputs.current[field] = node; else delete inputs.current[field]; },
    onFocus: field => { setFocused(field); intoView(field); }, onNext: next,
    onGuide: key => { Keyboard.dismiss(); setGuide(key); } };
  return <View style={styles.root} testID="body-measure-fields">
    {ZONES.map(zone => {
      const filled = zone.fields.filter(hasValue).length;
      const open = zone.fields.some(f => state.errors[f]) || (toggled[zone.key] ?? defaultOpen(zone.key));
      return <RegionSection key={zone.key} zone={zone} open={open} filled={filled} ctx={ctx} today={today} onToggle={() => {
        setToggled(prev => ({ ...prev, [zone.key]: !open }));
        if (!open && editable) setRequested(zone.fields[0]);
        else if (focused && zone.fields.includes(focused)) { Keyboard.dismiss(); setFocused(null); }
      }} />;
    })}
    {Platform.OS === 'ios' ? <InputAccessoryView nativeID={accessory}>
      <KeyboardAction label={focused === FIELDS.at(-1) ? 'Listo' : 'Siguiente'} onPress={() => { if (focused) next(focused); }} />
    </InputAccessoryView> : null}
    {guide ? <GuideSheet measure={guide} onClose={() => setGuide(null)} /> : null}
  </View>;
}

function GuideSheet({ measure, onClose }: { measure: PlannedMeasure['measure']['key']; onClose: () => void }) {
  const { colors } = useOwnlevelTheme();
  const guide = MEASURE_GUIDES[measure];
  return <AppSheet onClose={onClose} closeLabel="Cerrar guía" style={{ backgroundColor: colors.background }}>
    <View style={styles.guideBody} testID={`body-guide-${measure}-text`}>
      <View style={styles.measureHeader}><AppText variant="headline">{guide.title}</AppText><GuideClose /></View>
      {guide.steps.map(step => <AppText key={step}>{step}</AppText>)}
      <AppText muted variant="footnote">{GUIDE_COMMON}</AppText>
    </View>
  </AppSheet>;
}

function KeyboardAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <View style={[styles.accessory, { backgroundColor: colors.surface }]}>
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.info}><AppText variant="headline" style={{ color: colors.primary }}>{label}</AppText></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: '47%', flexGrow: 1 },
  zone: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: brandTokens.layout.cardPadding },
  group: { gap: spacing.xs },
  pair: { flexDirection: 'row', gap: spacing.md },
  stacked: { flexDirection: 'column' },
  field: { gap: spacing.xs },
  fieldInRow: { flex: 1, minWidth: 0 },
  region: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, minHeight: sizes.touchTarget, borderRadius: radius.card },
  regionText: { flex: 1 },
  count: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  regionBody: { gap: spacing.md },
  measureHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  info: { minWidth: sizes.touchTarget, minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'center' },
  guideBody: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxl },
  accessory: { alignItems: 'flex-end', paddingHorizontal: spacing.lg },
});
