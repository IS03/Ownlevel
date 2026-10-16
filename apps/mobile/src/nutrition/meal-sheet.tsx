import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { AppText, ScrollScreen, SearchField, SheetHandle, useReduceMotion } from '@/design-system';
import { NutritionGlassButton } from './day-controls';
export const mealShown = (n: number | null | undefined, digits = 2): string => n == null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(n);
export function MealSheet({ title, subtitle, children, onClose, back, right, running, embedded, testID }: PropsWithChildren<{ title: string; subtitle?: string; onClose: () => void; back?: boolean; right?: ReactNode; running?: boolean; embedded?: boolean; testID: string }>) {
  const reduced = useReduceMotion();
  const body = <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
    <ScrollScreen safeAreaEdges={['left', 'right', 'bottom']} contentContainerStyle={styles.content} testID={testID}>
      <SheetHandle />
      <View style={styles.header}>
        <NutritionGlassButton icon={back ? 'chevronLeft' : 'close'} label={back ? 'Volver' : `Cerrar ${title}`} onPress={running ? undefined : onClose} />
        <View style={styles.title}><AppText accessibilityRole="header" variant="headline" style={styles.center}>{title}</AppText>{subtitle ? <AppText muted variant="caption" style={styles.center}>{subtitle}</AppText> : null}</View>
        {right ?? <View style={{ width: 44 }} />}
      </View>
      {children}
    </ScrollScreen>
  </KeyboardAvoidingView>;
  return embedded ? body : <Modal visible animationType={reduced ? 'fade' : 'slide'} presentationStyle="pageSheet" onRequestClose={onClose} allowSwipeDismissal={false}>{body}</Modal>;
}
export function MealSearch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <SearchField label={label} value={value} onChange={onChange} />;
}
export const mealSheetStyles = StyleSheet.create({
  footer: { marginTop: 'auto', paddingTop: 24, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12 },
  text: { flex: 1, gap: 2 }, totals: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 48, padding: 12, borderRadius: 12, fontSize: 17 }, number: { fontSize: 56, lineHeight: 68, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center', minWidth: 40, marginRight: 6 },
});
const styles = StyleSheet.create({ fill: { flex: 1 }, content: { flexGrow: 1, gap: 20, paddingTop: 8 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, gap: 2 }, center: { textAlign: 'center' } });
