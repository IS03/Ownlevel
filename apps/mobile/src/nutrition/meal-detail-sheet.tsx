import { ActionSheetIOS, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NutritionDayMeal, NutritionNutrientTotal } from '@/api/nutrition-day';
import { AppIcon, AppText, GlassSurface, SheetHandle, brandTokens, pressedStyle, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';
import { RoutineSheetButton } from '@/training/routine-sheet-button';
import { amount } from './day-format';
import { mealShown } from './meal-sheet';
import { mealMoments } from './meal-timing-model';

const time = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const origins: Partial<Record<NonNullable<NutritionDayMeal['sourceType']>, { label: string; note: string }>> = {
  chatgpt: { label: 'ChatGPT', note: 'Esta comida llegó desde ChatGPT. Por ahora se corrige desde ahí; acá podés repetirla o guardarla como tuya.' },
  ai: { label: 'IA', note: 'Esta comida se cargó con IA. Por ahora no se edita desde acá; podés repetirla o guardarla como tuya.' },
  label: { label: 'Etiqueta', note: 'Esta comida se cargó desde una etiqueta. Por ahora no se edita desde acá; podés repetirla o guardarla como tuya.' },
  sheet_import: { label: 'Importada', note: 'Esta comida se importó. Por ahora no se edita desde acá; podés repetirla o guardarla como tuya.' },
};
export const mealTitle = (meal: NutritionDayMeal) => meal.entryKind === 'legacy_daily_summary' ? 'Resumen histórico importado' : meal.title || meal.description || 'Comida';
/** Only manual meals (manual and quick loads) can be edited or deleted; the server blocks the rest (MEAL_UNAVAILABLE). */
export const mealEditable = (meal: NutritionDayMeal) => meal.entryKind === 'meal' && meal.sourceType === 'manual';
/** Share of the day's known total. Hidden when either side is unknown or the day's sum is partial (missing ≠ zero). */
export function dayShare(value: number | null, total: NutritionNutrientTotal, entries: number): number | null {
  if (value === null || total.missingCount > 0 || entries === 0 || total.knownTotal <= 0) return null;
  return Math.min(1, value / total.knownTotal);
}
export type MealDetailActions = { onEdit?: () => void; onRepeat?: () => void; onSave?: () => void; onDelete?: () => void };

function Action({ icon, label, primary, onPress }: { icon: AppIconName; label: string; primary?: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const body = <View style={styles.actionBody}><AppIcon name={icon} color={primary ? colors.onPrimary : colors.primary} size={20} />
    <AppText variant="headline" style={{ color: primary ? colors.onPrimary : colors.text }}>{label}</AppText></View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, pressedStyle(pressed, reduced)]}>
    {primary ? <View style={[styles.actionFill, { backgroundColor: colors.primary }]}>{body}</View> : <GlassSurface interactive style={styles.actionFill}>{body}</GlassSurface>}
  </Pressable>;
}
function Share({ label, share, color }: { label: string; share: number; color: string }) {
  const { colors } = useOwnlevelTheme();
  const percent = `${Math.round(share * 100)} %`;
  return <View accessible accessibilityLabel={`${label}: ${percent} de lo que llevás hoy`} style={styles.share}>
    <AppText muted variant="subheadline" style={styles.shareLabel}>{label}</AppText>
    <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}><View style={[styles.bar, { width: `${share * 100}%`, backgroundColor: color }]} /></View>
    <AppText numeric variant="subheadline" style={styles.percent}>{percent}</AppText>
  </View>;
}

/** D1/D2: what matters about one meal, its weight in the day, and what you can do with it. */
export function MealDetailSheet({ meal, calories, protein, entries, actions, onClose }: {
  meal: NutritionDayMeal; calories: NutritionNutrientTotal; protein: NutritionNutrientTotal; entries: number; actions: MealDetailActions; onClose: () => void;
}) {
  const { colors, isDark } = useOwnlevelTheme(), reduced = useReduceMotion(), insets = useSafeAreaInsets();
  const origin = meal.sourceType && meal.sourceType !== 'manual' ? origins[meal.sourceType] : undefined;
  const readOnlyNote = mealEditable(meal) ? null : origin?.note ?? (meal.entryKind === 'meal' ? 'Esta comida no se edita desde acá; podés repetirla o guardarla como tuya.' : 'Es un resumen histórico importado: no se edita ni se repite.');
  const moment = [meal.mealLabel ? mealMoments[meal.mealLabel] : null, meal.timeKnown ? time.format(new Date(meal.consumedAt)) : null].filter(Boolean).join(' · ');
  const calorieShare = dayShare(meal.calories, calories, entries), proteinShare = dayShare(meal.proteinG, protein, entries);
  const showDescription = !!meal.description && meal.description !== meal.title;
  const more = () => {
    if (!actions.onDelete) return;
    const confirm = () => Alert.alert('¿Eliminar esta comida?', 'Deja de contar en el día y desaparece de la lista.', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: actions.onDelete }]);
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: ['Eliminar comida', 'Cancelar'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: isDark ? 'dark' : 'light' },
      index => { if (index === 0) confirm(); });
    else confirm();
  };
  const run = (action?: () => void) => action ? () => { onClose(); action(); } : undefined;
  const edit = run(actions.onEdit), repeat = run(actions.onRepeat), save = run(actions.onSave);
  return <Modal transparent statusBarTranslucent visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.fill}>
      <Pressable accessibilityLabel="Cerrar detalle de la comida" onPress={onClose} style={[StyleSheet.absoluteFill, styles.scrim]} />
      <Animated.View entering={reduced ? FadeIn.duration(200) : SlideInDown.duration(300)} accessibilityViewIsModal
        style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) }]} testID="meal-detail-sheet">
        <SheetHandle />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <RoutineSheetButton label="Cerrar" icon="close" onPress={onClose} />
            {actions.onDelete ? <RoutineSheetButton label="Más acciones" icon="more" onPress={more} /> : null}
          </View>
          <View style={styles.titleBlock}>
            <AppText accessibilityRole="header" variant="title1">{mealTitle(meal)}</AppText>
            {moment || origin || meal.precision === 'estimated' ? <View style={styles.meta}>
              {moment ? <AppText muted numeric variant="subheadline">{moment}</AppText> : null}
              {origin || meal.precision === 'estimated' ? <View style={[styles.badge, { backgroundColor: colors.surfaceRaised }]}>
                <AppIcon name={origin ? 'chat' : 'sparkles'} color={colors.textMuted} size={13} />
                <AppText muted variant="caption">{origin?.label ?? 'Estimado'}</AppText>
              </View> : null}
            </View> : null}
          </View>
          <View style={styles.numbers}>
            <View style={styles.kcal} accessible accessibilityLabel={`${mealShown(meal.calories)} kilocalorías`}>
              <AppText numeric style={styles.kcalValue}>{meal.calories === null ? '—' : mealShown(meal.calories)}</AppText>
              <AppText muted variant="title2">kcal</AppText>
            </View>
            <View style={styles.macros}>{([['Proteína', meal.proteinG], ['Carbos', meal.carbsG], ['Grasas', meal.fatG]] as const).map(([label, value]) =>
              <View key={label} style={styles.macro} accessible accessibilityLabel={`${label}: ${value === null ? 'sin dato' : amount(value, 'g')}`}>
                <AppText numeric variant="headline">{value === null ? '—' : amount(value, 'g')}</AppText>
                <AppText muted variant="caption">{label}</AppText>
              </View>)}</View>
          </View>
          {calorieShare !== null || proteinShare !== null ? <View style={styles.shares}>
            <AppText muted variant="footnote">En tu día</AppText>
            {calorieShare !== null ? <Share label="Calorías" share={calorieShare} color={brandTokens.palette.dark.accent} /> : null}
            {proteinShare !== null ? <Share label="Proteína" share={proteinShare} color={isDark ? brandTokens.palette.dark.heroTo : colors.primary} /> : null}
          </View> : null}
          {showDescription ? <AppText muted selectable>{meal.description}</AppText> : null}
          {readOnlyNote ? <View style={[styles.note, { backgroundColor: colors.surface }]}>
            <AppIcon name="info" color={colors.textMuted} size={17} /><AppText muted variant="subheadline" style={styles.flex}>{readOnlyNote}</AppText>
          </View> : null}
          {edit || repeat || save ? <View style={styles.actions}>
            {edit ? <Action icon="edit" label="Editar" primary onPress={edit} /> : null}
            {repeat ? <Action icon="repeat" label="Repetir" onPress={repeat} /> : null}
            {save ? <Action icon="bookmark" label="Guardar" onPress={save} /> : null}
          </View> : null}
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' }, scrim: { backgroundColor: 'rgba(0,0,0,0.3)' }, flex: { flex: 1 },
  sheet: { maxHeight: '92%', borderTopLeftRadius: brandTokens.radius.sheet, borderTopRightRadius: brandTokens.radius.sheet, paddingTop: 8 },
  content: { padding: 16, gap: 20 }, header: { flexDirection: 'row', justifyContent: 'space-between' },
  titleBlock: { gap: 6 }, meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: brandTokens.radius.chip, paddingHorizontal: 8, paddingVertical: 3 },
  numbers: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  kcal: { flexDirection: 'row', alignItems: 'baseline', gap: 6 }, kcalValue: { fontSize: 56, lineHeight: 64, fontWeight: '700' },
  macros: { flexDirection: 'row', gap: 16 }, macro: { alignItems: 'flex-end' },
  shares: { gap: 8 }, share: { flexDirection: 'row', alignItems: 'center', gap: 12 }, shareLabel: { width: 76 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' }, bar: { height: 6, borderRadius: 3 }, percent: { minWidth: 44, textAlign: 'right' },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: brandTokens.radius.inner, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: 8 }, action: { flex: 1 },
  actionFill: { minHeight: 64, borderRadius: brandTokens.radius.button, alignItems: 'center', justifyContent: 'center' }, actionBody: { alignItems: 'center', gap: 4, paddingVertical: 10 },
});
