import { useMemo, type PropsWithChildren, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { AppText, ScrollScreen, SearchField, SheetHandle, brandTokens, useReduceMotion } from '@/design-system';
import { NutritionGlassButton } from './day-controls';
export const mealShown = (n: number | null | undefined, digits = 2): string => n == null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(n);
const motion = brandTokens.motion;
/**
 * Full-height sheet for the loading flows. Swiping down closes it natively when nothing would be lost (`dismissable`);
 * with unsaved changes iOS resists and the close confirmation asks. A swipe from the left edge goes back (or closes).
 */
export function MealSheet({ title, subtitle, children, onClose, onDismiss, back, right, running, embedded, dismissable = false, testID }: PropsWithChildren<{
  title: string; subtitle?: string; onClose: () => void; back?: boolean; right?: ReactNode; running?: boolean; embedded?: boolean;
  /** Nothing to lose: a swipe down dismisses at once (no resistance bounce). */
  dismissable?: boolean;
  /** What a swipe down (or Android back) does when it differs from the header button (which may go back). */
  onDismiss?: () => void; testID: string;
}>) {
  const reduced = useReduceMotion();
  const { width } = useWindowDimensions();
  const shift = useSharedValue(0);
  const edge = useMemo(() => Gesture.Pan().enabled(!running).hitSlop({ left: 0, width: 28 }).activeOffsetX(10).failOffsetY([-20, 20])
    .onUpdate(event => { shift.set(Math.max(0, event.translationX)); })
    .onEnd(event => {
      const go = event.translationX > width * 0.3 || event.velocityX > 800;
      shift.set(withSpring(0, motion.spring));
      if (go) runOnJS(onClose)();
    }), [onClose, running, shift, width]);
  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: reduced ? 0 : shift.value * 0.6 }] }));
  const body = <GestureHandlerRootView style={styles.fill}><GestureDetector gesture={edge}><Animated.View style={[styles.fill, follow]}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
      <ScrollScreen safeAreaEdges={['left', 'right', 'bottom']} contentContainerStyle={styles.content} testID={testID}>
        <SheetHandle />
        <View style={styles.header}>
          <NutritionGlassButton icon={back ? 'chevronLeft' : 'close'} label={back ? 'Volver' : `Cerrar ${title}`} onPress={running ? undefined : onClose} />
          <View style={styles.title}><AppText accessibilityRole="header" variant="headline" style={styles.center}>{title}</AppText>{subtitle ? <AppText muted variant="caption" style={styles.center}>{subtitle}</AppText> : null}</View>
          {right ?? <View style={{ width: 44 }} />}
        </View>
        {children}
      </ScrollScreen>
    </KeyboardAvoidingView>
  </Animated.View></GestureDetector></GestureHandlerRootView>;
  return embedded ? body : <Modal visible animationType={reduced ? 'fade' : 'slide'} presentationStyle="pageSheet" onRequestClose={onDismiss ?? onClose}
    allowSwipeDismissal={dismissable && !running}>{body}</Modal>;
}
export function MealSearch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <SearchField label={label} value={value} onChange={onChange} />;
}
export const mealSheetStyles = StyleSheet.create({
  footer: { marginTop: 'auto', paddingTop: 24, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12 },
  text: { flex: 1, gap: 2 }, totals: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 48, padding: 12, borderRadius: 12, fontSize: brandTokens.typeScale.body.fontSize }, number: { fontSize: brandTokens.typeScale.heroNumber.fontSize, lineHeight: 68, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center', minWidth: 40, marginRight: 6 },
});
const styles = StyleSheet.create({ fill: { flex: 1 }, content: { flexGrow: 1, gap: 20, paddingTop: 8 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, gap: 2 }, center: { textAlign: 'center' } });
