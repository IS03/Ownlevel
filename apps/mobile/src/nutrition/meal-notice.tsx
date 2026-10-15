import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, AppText, useOwnlevelTheme } from '@/design-system';
import type { MealNotice } from './use-meal-notice';
export function MealAddedNotice({ notice, disabled, pending, onUndo, onClose }: { notice: MealNotice; disabled: boolean; pending: boolean; onUndo: () => void; onClose: () => void }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets();
  return <View accessibilityLiveRegion="polite" testID="nutrition-meal-notice" style={{ position: 'absolute', bottom: insets.bottom + 80, left: 16, right: 16, borderRadius: 20, backgroundColor: colors.surface, padding: 8, paddingLeft: 18, flexDirection: 'row', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
    <AppText numeric variant="subheadline" numberOfLines={2} style={{ flex: 1 }}>{pending ? 'Deshaciendo…' : notice.message}</AppText>
    {pending ? <ActivityIndicator color={colors.primary} /> : <Pressable accessibilityRole="button" accessibilityLabel="Deshacer comida agregada" disabled={disabled} accessibilityState={{ disabled }} onPress={onUndo} style={{ paddingHorizontal: 12, minHeight: 44, borderRadius: 14, justifyContent: 'center', backgroundColor: colors.brandSubtle, opacity: disabled ? 0.4 : 1 }}><AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Deshacer</AppText></Pressable>}
    {!pending ? <Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso de comida" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><AppIcon name="close" color={colors.textMuted} size={17} /></Pressable> : null}
  </View>;
}
