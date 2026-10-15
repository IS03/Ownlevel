import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, SlideInDown, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import {
  AppIcon,
  AppText,
  GlassSurface,
  ScreenGlow,
  SheetHandle,
  brandTokens,
  pressedStyle,
  useOwnlevelTheme,
  useReduceMotion,
} from '@/design-system';
import { TrainingContextMenu } from '@/training/routine-context-menu';
import type { TrainingMenuAction } from '@/training/routine-context-menu.types';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { NutritionGlassButton } from './day-controls';
import { mealShown } from './meal-sheet';
export const libraryMacros = (n: { proteinG: number | null; carbsG: number | null; fatG: number | null }) =>
  `P ${mealShown(n.proteinG)} · C ${mealShown(n.carbsG)} · G ${mealShown(n.fatG)}`;
export function LibrarySheet({
  title,
  browse,
  onClose,
  right,
  footer,
  children,
  testID,
  running,
  embedded = false,
}: PropsWithChildren<{
  title: string;
  browse?: boolean;
  onClose: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  testID: string;
  running?: boolean;
  embedded?: boolean;
}>) {
  const { colors } = useOwnlevelTheme(),
    reduced = useReduceMotion(),
    insets = useSafeAreaInsets();
  const body = (
    <View style={styles.modal}>
      <Pressable
        accessibilityLabel={`Cerrar ${title} desde el fondo`}
        accessibilityRole="button"
        disabled={running}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, styles.scrim]}
      />
      <Animated.View
        entering={
          reduced
            ? FadeIn.duration(brandTokens.motion.duration.fast)
            : SlideInDown.duration(brandTokens.motion.duration.base)
        }
        accessibilityViewIsModal
        style={[
          styles.sheet,
          embedded && { height: '100%' },
          { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <ScreenGlow />
        <SheetHandle />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <View style={styles.header}>
            <NutritionGlassButton
              icon="close"
              label={browse ? `Cerrar ${title}` : 'Cerrar edición'}
              onPress={running ? undefined : onClose}
            />
            <View style={styles.title}>
              {!browse ? (
                <AppText accessibilityRole="header" variant="headline" style={{ textAlign: 'center' }}>
                  {title}
                </AppText>
              ) : null}
            </View>
            {right ?? <View style={{ width: 44 }} />}
          </View>
          <ScrollView testID={testID} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {browse ? (
              <AppText accessibilityRole="header" variant="largeTitle">
                {title}
              </AppText>
            ) : null}
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
  return embedded ? (
    body
  ) : (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {body}
    </Modal>
  );
}
export function LibrarySaveButton({
  disabled,
  onPress,
  label,
}: {
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  const { colors } = useOwnlevelTheme(),
    reduced = useReduceMotion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : 1 }, pressedStyle(pressed, reduced)]}
    >
      <GlassSurface
        interactive
        style={{ width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppIcon name="checkmark" size={20} color={colors.primary} />
      </GlassSurface>
    </Pressable>
  );
}
export function LibrarySearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <GlassSurface style={styles.search}>
      <AppIcon name="search" color={colors.textMuted} size={20} />
      <TextInput
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChange}
        style={[styles.searchInput, { color: colors.text }]}
        clearButtonMode="while-editing"
      />
    </GlassSurface>
  );
}
export function LibraryFilter({
  filter,
  onChange,
}: {
  filter: 'active' | 'archived' | 'all';
  onChange: (v: 'active' | 'archived') => void;
}) {
  return (
    <ExerciseSegmented
      accessibilityLabel="Estado de la biblioteca"
      value={filter === 'archived' ? 'archived' : 'active'}
      options={[
        { value: 'active', label: 'Activas' },
        { value: 'archived', label: 'Archivadas' },
      ]}
      onChange={onChange}
    />
  );
}
function ArchiveSwipe({
  label,
  onPress,
  translation,
}: {
  label: string;
  onPress: () => void;
  translation: SharedValue<number>;
}) {
  const { colors } = useOwnlevelTheme();
  const animated = useAnimatedStyle(() => ({
    opacity: translation.value < -1 ? 1 : 0,
    transform: [{ translateX: Math.max(0, 104 + translation.value) }],
  }));
  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={[styles.swipe, { backgroundColor: colors.surfaceRaised }]}
      >
        <AppIcon name="archive" color={colors.textMuted} size={20} />
        <AppText variant="footnote" muted>
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}
export function LibraryRow({
  name,
  calories,
  detail,
  disabled,
  highlighted,
  onOpen,
  onArchive,
  active = true,
  actions,
  testID,
  actionLabel = 'Editar',
}: {
  name: string;
  actionLabel?: string;
  calories: number | null;
  detail: string;
  disabled?: boolean;
  highlighted?: boolean;
  onOpen: () => void;
  onArchive?: () => void;
  active?: boolean;
  actions?: TrainingMenuAction[];
  testID?: string;
}) {
  const { colors } = useOwnlevelTheme(),
    reduced = useReduceMotion(),
    [width, setWidth] = useState(0);
  const menu: TrainingMenuAction[] = actions ?? [
    { label: 'Editar', symbol: 'pencil', onPress: onOpen },
    ...(onArchive
      ? [
          {
            label: active ? 'Archivar' : 'Restaurar',
            symbol: 'archivebox' as const,
            onPress: onArchive,
            separated: true,
          },
        ]
      : []),
  ];
  const row = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel} ${name}, ${mealShown(calories)} kilocalorías, ${detail}${active ? '' : ', Archivada'}`}
      accessibilityHint={menu.length ? 'Mantené apretado para ver acciones.' : undefined}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={disabled ? [] : menu.map((a) => ({ name: a.label, label: a.label }))}
      onAccessibilityAction={(e) => {
        if (!disabled) menu.find((a) => a.label === e.nativeEvent.actionName)?.onPress();
      }}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: highlighted ? colors.brandSubtle : 'transparent',
          borderRadius: highlighted ? 12 : 0,
          opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.text}>
        <AppText variant="headline">{name}</AppText>
        <AppText muted numeric variant="caption">
          {detail}
        </AppText>
      </View>
      <AppText numeric variant="subheadline">
        {mealShown(calories)} kcal
      </AppText>
      <AppIcon name="chevronRight" size={17} color={colors.textMuted} />
    </Pressable>
  );
  return (
    <View testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Swipeable
        enabled={!!onArchive && !disabled}
        overshootRight={false}
        renderRightActions={(_p, t, methods) => (
          <ArchiveSwipe
            label={active ? 'Archivar' : 'Restaurar'}
            translation={t}
            onPress={() => {
              if (reduced) methods.reset();
              else methods.close();
              onArchive?.();
            }}
          />
        )}
      >
        <TrainingContextMenu
          width={width}
          name={name}
          onOpen={onOpen}
          disabled={!!disabled || menu.length === 0}
          actions={menu}
        >
          {row}
        </TrainingContextMenu>
      </Swipeable>
    </View>
  );
}
export function LibraryField({
  label,
  value,
  onChange,
  disabled,
  numeric,
  big,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  numeric?: boolean;
  big?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={placeholder ?? '—'}
      placeholderTextColor={colors.textMuted}
      value={value}
      onChangeText={onChange}
      editable={!disabled}
      keyboardType={numeric || big ? 'decimal-pad' : 'default'}
      selectTextOnFocus={numeric || big}
      multiline={multiline}
      style={[
        big ? styles.number : styles.input,
        { color: colors.text },
        !big && { backgroundColor: colors.surfaceRaised },
      ]}
    />
  );
}
export function LibraryNutrients({
  fields,
}: {
  fields: (key: 'calories' | 'proteinG' | 'carbsG' | 'fatG', label: string, big?: boolean) => ReactNode;
}) {
  return (
    <>
      <View style={styles.kcal}>
        {fields('calories', 'Calorías', true)}
        <AppText muted variant="title2">
          kcal
        </AppText>
      </View>
      <View style={styles.macros}>
        {(['proteinG', 'carbsG', 'fatG'] as const).map((k, i) => (
          <View key={k} style={styles.macro}>
            <AppText muted variant="caption">
              {['Proteína', 'Carbos', 'Grasas'][i]}
            </AppText>
            {fields(k, ['Proteína (g)', 'Carbohidratos (g)', 'Grasas (g)'][i])}
          </View>
        ))}
      </View>
    </>
  );
}
/** Notice only after the controller has verified the receipt AND refreshed its list. */
type LibraryNoticeState = {
  open: boolean;
  phase: string;
  mode: string;
  intent: { receipt?: { id: string; operation: string } } | null;
};
export function useLibraryNotice(controller: {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => LibraryNoticeState;
}) {
  const verified = useRef<{ id: string; operation: string } | null>(null),
    [notice, setNotice] = useState<{ id: string } | null>(null);
  useEffect(() => {
    const observe = () => {
      const state = controller.getSnapshot();
      if (!state.open) {
        verified.current = null;
        setNotice(null);
        return;
      }
      if (state.mode !== 'browse' && !state.intent) setNotice(null);
      if (state.intent?.receipt) verified.current = state.intent.receipt;
      if (state.phase === 'idle' && state.mode === 'browse' && !state.intent && verified.current) {
        const receipt = verified.current;
        verified.current = null;
        if (receipt.operation === 'create' || receipt.operation === 'update') setNotice({ id: receipt.id });
      }
    };
    observe();
    return controller.subscribe(observe);
  }, [controller]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  return { highlighted: notice?.id ?? null, notice: notice ? <LibraryNotice /> : null };
}
function LibraryNotice() {
  const { colors } = useOwnlevelTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(brandTokens.motion.duration.fast)}
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel="Guardado"
      style={[styles.notice, { backgroundColor: colors.surface }]}
    >
      <AppText variant="subheadline">Guardado</AppText>
    </Animated.View>
  );
}
export const libraryStyles = StyleSheet.create({
  section: { gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  flat: { paddingVertical: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
const styles = StyleSheet.create({
  fill: { flex: 1 },
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.2)' },
  sheet: { height: '94%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  header: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, textAlign: 'center' },
  content: { padding: 16, gap: 20, flexGrow: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  search: {
    borderRadius: 12,
    minHeight: 48,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchInput: { minHeight: 48, fontSize: 17, flex: 1 },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 4 },
  swipe: {
    width: 96,
    height: '100%',
    borderRadius: 14,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  input: { minHeight: 48, padding: 12, borderRadius: 12, fontSize: 17, fontVariant: ['tabular-nums'] },
  number: {
    fontSize: 56,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 48,
    flexShrink: 1,
    textAlign: 'center',
  },
  kcal: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', paddingVertical: 12 },
  macros: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  macro: { flex: 1, minWidth: 90, gap: 4 },
  notice: { padding: 16, borderRadius: 20 },
  menu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
