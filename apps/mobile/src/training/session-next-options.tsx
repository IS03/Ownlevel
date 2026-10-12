import { Modal, Pressable, StyleSheet, Switch, View } from 'react-native';
import { AppIcon, AppText, Separator, radius, sizes, spacing, useOwnlevelTheme } from '@/design-system';
import type { SessionNextOptionsProps } from './session-next-options.types';

/** Native Modal fallback; iOS uses an anchored SwiftUI popover. */
export function SessionNextOptions(props: SessionNextOptionsProps) {
  const { colors } = useOwnlevelTheme();
  return <Modal visible={props.open} transparent animationType="fade" onRequestClose={props.onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={props.onClose} />
      <View accessibilityViewIsModal onAccessibilityEscape={props.onClose} style={[styles.popup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.titleRow}><AppText style={styles.flex} variant="label">Próxima vez</AppText>
          <Pressable accessibilityLabel="Cerrar opciones de próxima vez" accessibilityRole="button" onPress={props.onClose} style={styles.close}>
            <AppIcon name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View><AppText muted variant="caption">{props.name}</AppText><Separator />
        {([
          ['increase_weight', 'Más peso'], ['increase_reps', 'Más repeticiones'],
          ...(props.decision === 'custom' ? [['custom', props.decisionNote || 'Recordatorio anterior']] : []),
        ] as [SessionNextOptionsProps['decision'], string][]).map(([decision, label]) => <Pressable key={decision} accessibilityRole="checkbox" accessibilityLabel={label}
          accessibilityState={{ checked: props.decision === decision, disabled: !props.editable }} disabled={!props.editable}
          onPress={() => props.onDecision(decision)} style={styles.option}>
          <AppIcon name={props.decision === decision ? 'checkmark' : 'plus'} size={20} color={colors.primary} />
          <AppText style={[styles.flex, { color: colors.primary }]}>{label}</AppText>
        </Pressable>)}
        {props.routineLinked ? <><Separator /><View style={styles.option}>
          <AppText style={styles.flex}>Tomar resultado de hoy</AppText>
          <Switch accessibilityLabel="Tomar resultado de hoy" disabled={!props.editable} value={props.applyToRoutine}
            trackColor={{ true: colors.primary, false: colors.border }} onValueChange={props.onApply} />
        </View></> : null}
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, backgroundColor: 'rgba(0,0,0,0.2)' },
  popup: { width: '100%', maxWidth: 360, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touchTarget, paddingVertical: spacing.sm },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center' }, close: { minHeight: sizes.touchTarget, minWidth: sizes.touchTarget, alignItems: 'center', justifyContent: 'center' },
});
