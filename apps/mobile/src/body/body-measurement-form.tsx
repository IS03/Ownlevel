import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { BodyMeasurementField } from '@/api/body';
import { BODY_MEASUREMENT_LABELS } from '@/api/body';
import { AppIcon, AppText, Separator, TextField, appIconSize, radius, sizes, spacing, useOwnlevelTheme } from '@/design-system';
import type { BodyController, BodyState } from './body-controller';
import { GUIDE_COMMON, MEASURE_GUIDES } from './body-measure-guides';
import {
  buildMeasurementLayout, habitualPlan, referenceText, regionPlan,
  type MeasureReference, type PlannedMeasure, type RegionKey,
} from './body-measure-layout';
import type { MeasurementEditor } from './body-storage';

// Guided body-measurement fields (#470): the ten fields grouped by measure and body region, with an optional list of
// the user's habitual measures, the last value per field as a reference, and a text-only "Cómo medir" guide.
// Presentation only: every value lives in the controller draft (collapsing or moving a field never loses it) and
// nothing is ever pre-filled from a reference.
//
// Keyboard: no custom accessory bar. decimal-pad has no return key to "next field", and the existing LongSheet already
// keeps the focused field visible above the keyboard (native viewport on iOS, KeyboardAvoidingView on Android), so an
// extra bar would only add chrome and one more thing to keep in sync.
//
// Motion: toggles are instant (chevron swaps orientation, nothing animates), which is also the Reduce Motion behavior.

const LARGE_TEXT = 1.3; // brand rule: above this font scale, label/value pairs stack
const countLabel = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type FieldsContext = {
  draft: MeasurementEditor['draft']; baseline: MeasurementEditor['baseline']; errors: Record<string, string>;
  references: Partial<Record<BodyMeasurementField, MeasureReference>>; editable: boolean; largeText: boolean;
  onChange: (field: BodyMeasurementField, value: string) => void;
};

function Field({ field, ctx }: { field: BodyMeasurementField; ctx: FieldsContext }) {
  const reference = ctx.references[field];
  const text = reference ? referenceText(reference) : undefined;
  const previous = ctx.baseline?.[field];
  return <View style={[styles.field, !ctx.largeText && styles.fieldInRow]}>
    <TextField label={BODY_MEASUREMENT_LABELS[field]} unit="cm" value={ctx.draft[field]} onChangeText={v => ctx.onChange(field, v)} error={ctx.errors[field]}
      disabled={!ctx.editable} keyboardType="decimal-pad" placeholder={previous != null ? String(previous).replace('.', ',') : '—'} autoCorrect={false}
      selectTextOnFocus numeric accessibilityHint={text} testID={`body-field-${field}`} />
    {text ? <AppText muted numeric variant="footnote">{text}</AppText> : null}
  </View>;
}

function GuideToggle({ measure }: { measure: PlannedMeasure['measure'] }) {
  const { colors } = useOwnlevelTheme();
  const [open, setOpen] = useState(false);
  const guide = MEASURE_GUIDES[measure.key];
  return <View style={styles.guide}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Cómo medir ${measure.label.toLowerCase()}`} accessibilityState={{ expanded: open }}
      onPress={() => setOpen(v => !v)} testID={`body-guide-${measure.key}`}
      style={({ pressed }) => [styles.guideToggle, pressed && { backgroundColor: colors.surfaceRaised }]}>
      <AppText muted variant="subheadline">Cómo medir</AppText>
      <View style={open && styles.flipped}><AppIcon name="chevronDown" color={colors.textMuted} size={appIconSize.inline} /></View>
    </Pressable>
    {open ? <View style={styles.guideBody} testID={`body-guide-${measure.key}-text`}>
      <AppText variant="subheadline">{guide.title}</AppText>
      {guide.steps.map(step => <AppText key={step} variant="footnote">{step}</AppText>)}
      <AppText muted variant="footnote">{GUIDE_COMMON}</AppText>
    </View> : null}
  </View>;
}

/** One measure: its field, or both sides as two independent fields (side by side, stacked with large text). */
function MeasureGroup({ planned, ctx }: { planned: PlannedMeasure; ctx: FieldsContext }) {
  return <View style={styles.group}>
    <View style={[styles.pair, ctx.largeText && styles.stacked]} testID={`body-pair-${planned.measure.key}`}>
      {planned.fields.map(field => <Field key={field} field={field} ctx={ctx} />)}
    </View>
    <GuideToggle measure={planned.measure} />
  </View>;
}

function RegionSection({ label, measures, open, filled, onToggle, ctx, testID }: {
  label: string; measures: PlannedMeasure[]; open: boolean; filled: number; onToggle: () => void; ctx: FieldsContext; testID: string;
}) {
  const { colors } = useOwnlevelTheme();
  const total = measures.reduce((sum, m) => sum + m.fields.length, 0);
  const count = `${filled} de ${total}`;
  const spoken = `${label}, ${countLabel(total, 'medida', 'medidas')}, ${filled === 0 ? 'ninguna con valor' : `${filled} con valor`}`;
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={spoken} accessibilityState={{ expanded: open }} onPress={onToggle} testID={testID}
      style={({ pressed }) => [styles.region, pressed && { backgroundColor: colors.surfaceRaised }]}>
      <View style={styles.regionText}>
        <AppText variant="headline">{label}</AppText>
        {ctx.largeText ? <AppText muted numeric variant="footnote">{count}</AppText> : null}
      </View>
      {ctx.largeText ? null : <AppText muted numeric variant="footnote">{count}</AppText>}
      <View style={open && styles.flipped}><AppIcon name="chevronDown" color={colors.textMuted} size={appIconSize.row} /></View>
    </Pressable>
    {open ? <View style={styles.regionBody}>{measures.map(m => <MeasureGroup key={m.measure.key} planned={m} ctx={ctx} />)}</View> : null}
  </View>;
}

export function MeasurementFields({ editor, state, controller, editable }: { editor: MeasurementEditor; state: BodyState; controller: BodyController; editable: boolean }) {
  const { fontScale } = useWindowDimensions();
  const { draft, baseline, mode } = editor;
  const { measurements, measurementsCursor, overview } = state.read;
  const editedId = baseline?.id ?? null, today = overview?.today;
  // Pure derivation from what the controller already loaded; recomputed when the draft date changes, with no network.
  const layout = useMemo(() => buildMeasurementLayout({ history: measurements, hasMore: measurementsCursor !== null, selectedDate: draft.date, editedId, mode, today }),
    [measurements, measurementsCursor, draft.date, editedId, mode, today]);
  const plan = useMemo(() => regionPlan(layout.habitual), [layout.habitual]);
  const habitual = useMemo(() => habitualPlan(layout.habitual), [layout.habitual]);

  const hasValue = (field: BodyMeasurementField) => draft[field].trim() !== '';
  // Edit opens every region that already holds a value; this is read once so clearing a field never collapses it under the finger.
  const [initiallyFilled] = useState(() => new Set(regionPlan([]).filter(r => r.measures.some(m => m.fields.some(hasValue))).map(r => r.region.key)));
  const [toggled, setToggled] = useState<Partial<Record<RegionKey, boolean>>>({});
  const defaultOpen = (key: RegionKey) => mode === 'edit' ? initiallyFilled.has(key) : layout.habitual.length === 0 && key === 'trunk';

  const ctx: FieldsContext = { draft, baseline, errors: state.errors, references: layout.references, editable, largeText: fontScale > LARGE_TEXT,
    onChange: (field, value) => controller.change(field, value) };
  return <View style={styles.root} testID="body-measure-fields">
    {habitual.length ? <View style={styles.habitual} testID="body-habitual">
      <AppText accessibilityRole="header" variant="headline">Tus medidas habituales</AppText>
      <AppText muted variant="footnote">Las que repetiste en tus últimas cargas.</AppText>
      {habitual.map(m => <MeasureGroup key={m.measure.key} planned={m} ctx={ctx} />)}
    </View> : null}
    {plan.map(({ region, measures }, index) => {
      const fields = measures.flatMap(m => m.fields);
      const filled = fields.filter(hasValue).length;
      // A validation error always shows its field, whatever the toggle says; a value in a closed region shows in its count.
      const open = fields.some(f => state.errors[f]) || (toggled[region.key] ?? (defaultOpen(region.key) || filled > 0));
      return <View key={region.key}>
        {index > 0 || habitual.length ? <Separator /> : null}
        <RegionSection label={region.label} measures={measures} open={open} filled={filled} ctx={ctx} testID={`body-region-${region.key}`}
          onToggle={() => setToggled(prev => ({ ...prev, [region.key]: !open }))} />
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  habitual: { gap: spacing.md },
  group: { gap: spacing.xs },
  pair: { flexDirection: 'row', gap: spacing.md },
  stacked: { flexDirection: 'column' },
  field: { gap: spacing.xs },
  fieldInRow: { flex: 1, minWidth: 0 },
  region: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touchTarget, paddingVertical: spacing.sm, borderRadius: radius.inner },
  regionText: { flex: 1, gap: 2 },
  regionBody: { gap: spacing.md, paddingBottom: spacing.md },
  guide: { gap: spacing.xs },
  guideToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs, minHeight: sizes.touchTarget, paddingHorizontal: spacing.xs, borderRadius: radius.inner },
  guideBody: { gap: spacing.xs, paddingBottom: spacing.xs },
  flipped: { transform: [{ rotate: '180deg' }] },
});
