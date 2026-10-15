import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, AppText, useOwnlevelTheme } from '@/design-system';
import type { MetricNotice } from './use-metric-entry';

export function MetricSavedNotice({ notice, disabled, onUndo, onClose, pending = false }: { notice: MetricNotice; disabled: boolean; pending?: boolean; onUndo: () => void; onClose: () => void }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets();
  return <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border, bottom: insets.bottom + 80 }]} testID="nutrition-metric-notice">
    {pending ? <ActivityIndicator color={colors.primary} /> : null}
    <AppText numeric variant="subheadline" style={styles.text}>{notice.message}</AppText>
    {notice.undo ? <Pressable accessibilityRole="button" accessibilityLabel="Deshacer cambio de métrica" accessibilityState={{ disabled }} disabled={disabled} onPress={onUndo}
      style={[styles.undo, { backgroundColor: colors.brandSubtle }, disabled && { opacity: 0.4 }]}><AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Deshacer</AppText></Pressable> : null}
    {!pending ? <Pressable accessibilityLabel="Cerrar aviso de métrica" accessibilityRole="button" onPress={onClose} style={styles.close}><AppIcon name="close" color={colors.textMuted} size={17} /></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 18, paddingRight: 8, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8,
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)' },
  text: { flex: 1 }, undo: { minHeight: 44, borderRadius: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
