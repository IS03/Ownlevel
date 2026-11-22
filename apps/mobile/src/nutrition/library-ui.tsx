import { useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
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
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, SlideInDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  AppIcon,
  AppText,
  ScreenGlow,
  SearchField,
  SheetHandle,
  brandTokens,
  useOwnlevelTheme,
  useReduceMotion,
  SegmentedControl,
  useFieldSurface,
} from '@/design-system';
import { TrainingContextMenu } from '@/training/routine-context-menu';
import type { TrainingMenuAction } from '@/training/routine-context-menu.types';
import { NutritionGlassButton } from './day-controls';
import { mealShown } from './meal-sheet';
export const libraryMacros = (n: { proteinG: number | null; carbsG: number | null; fatG: number | null }) =>
  `P ${mealShown(n.proteinG)} · C ${mealShown(n.carbsG)} · G ${mealShown(n.fatG)}`;
type LibrarySheetProps = PropsWithChildren<{
  title: string;
  browse?: boolean;
  onClose: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  testID: string;
  running?: boolean;
  embedded?: boolean;
  /** Swiping the sheet down. Defaults to onClose; an editor can keep its draft instead of asking. */
  onSwipeClose?: () => void;
}>;
export function LibrarySheet(props: LibrarySheetProps) {
  return props.embedded ? (
    <LibrarySheetBody {...props} />
  ) : (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose} statusBarTranslucent>
      {/* #306: the modal covers the tab bar, so its insets are the window's, not the tab screen's (home
          indicator + tab bar). Without its own provider the sheet reserved the tab bar below the list.
          A modal is its own native root: the swipe needs its own gesture root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <LibrarySheetBody {...props} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}
function LibrarySheetBody({
  title,
  browse,
  onClose,
  right,
  footer,
  children,
  testID,
  running,
  embedded = false,
  onSwipeClose,
}: LibrarySheetProps) {
  const { colors } = useOwnlevelTheme(),
    reduced = useReduceMotion(),
    insets = useSafeAreaInsets();
  // RN already includes the KeyboardAvoidingView's local y in its overlap formula. Only its parent's
  // screen origin (the sheet) belongs in keyboardVerticalOffset; adding the local y counts it twice.
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  // #306: a browsing list with nothing below it runs to the sheet's bottom edge and keeps the home indicator as
  // its own scroll padding, so rows pass under the indicator instead of being cut by a flat band. A footer, or a
  // sheet embedded in another one, keeps the inset on the sheet.
  const bottomInset = Math.max(insets.bottom, 16),
    scrollsUnder = !embedded && !footer;
  // Swipe down from the grabber or the header, like every other sheet: past a quarter of a screen or a quick flick it
  // closes; otherwise it springs back. The native page sheet (embedded) already has the system gesture.
  const drag = useSharedValue(0);
  const swipe = onSwipeClose ?? onClose;
  const pan = useMemo(() => Gesture.Pan().enabled(!embedded && !running).activeOffsetY(8).failOffsetX([-24, 24])
    .onUpdate((event) => { drag.set(Math.max(0, event.translationY)); })
    .onEnd((event) => {
      const close = event.translationY > 180 || event.velocityY > 900;
      drag.set(withSpring(0, { damping: 20, stiffness: 220 }));
      if (close) runOnJS(swipe)();
    }), [embedded, running, drag, swipe]);
  const dragged = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));
  return (
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
        testID={`${testID}-sheet`}
        onLayout={(e) => setKeyboardOffset(e.nativeEvent.layout.y)}
        style={[
          styles.sheet,
          embedded && { height: '100%' },
          { backgroundColor: colors.background, paddingBottom: scrollsUnder ? 0 : bottomInset },
          dragged,
        ]}
      >
        <ScreenGlow />
        <GestureDetector gesture={pan}>
          <View style={styles.grabArea} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><SheetHandle /></View>
        </GestureDetector>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={embedded ? 0 : keyboardOffset}
          testID={`${testID}-keyboard`}
          style={styles.fill}
        >
          {/* Equal side columns keep the title centered on the sheet, not between unequal buttons. */}
          <GestureDetector gesture={pan}>
          <View style={styles.header}>
            <View style={styles.side} testID={`${testID}-header-start`}>
              <NutritionGlassButton
                icon="close"
                label={browse ? `Cerrar ${title}` : 'Cerrar edición'}
                onPress={running ? undefined : onClose}
              />
            </View>
            <AppText accessibilityRole="header" variant="headline" style={styles.title}>
              {title}
            </AppText>
            <View style={[styles.side, styles.sideEnd]} testID={`${testID}-header-end`}>{right}</View>
          </View>
          </GestureDetector>
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
            testID={testID}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.content, scrollsUnder && { paddingBottom: 16 + bottomInset }]}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer} testID={`${testID}-footer`}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
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
  return <SearchField label={label} value={value} onChange={onChange} />;
}
export function LibraryFilter({
  filter,
  onChange,
}: {
  filter: 'active' | 'archived' | 'all';
  onChange: (v: 'active' | 'archived') => void;
}) {
  // The brand control, not the native one: its SwiftUI host measures itself after mounting, so the list jumped
  // up and down when coming back from a meal, and its selection pill is white.
  return (
    <SegmentedControl
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
          borderRadius: brandTokens.radius.inner,
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
  const fieldSurface = useFieldSurface();
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
        !big && fieldSurface,
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
  grabArea: { paddingTop: 10, paddingBottom: 4 },
  header: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  side: { flexGrow: 1, flexBasis: 0, minWidth: 44, flexDirection: 'row', alignItems: 'center' },
  sideEnd: { justifyContent: 'flex-end' },
  title: { flexShrink: 1, textAlign: 'center' },
  content: { padding: 16, gap: 20, flexGrow: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: brandTokens.space.sm,
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
  input: { minHeight: 48, padding: 12, borderRadius: 12, fontSize: brandTokens.typeScale.body.fontSize, fontVariant: ['tabular-nums'] },
  number: {
    fontSize: brandTokens.typeScale.heroNumber.fontSize,
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
