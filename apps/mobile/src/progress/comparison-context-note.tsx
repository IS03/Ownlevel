import { Alert, Pressable, StyleSheet } from 'react-native';
import type { ComparisonContext } from '@/api/training-times';
import { AppIcon, AppText, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';

export const comparisonContextText = (context: ComparisonContext | undefined, compared: number) => compared === 0
  ? 'Sin comparaciones claras' : context ? `${context.complete} con contexto completo · ${context.partial} parcial${context.partial === 1 ? '' : 'es'}` : 'Contexto sin desglose en esta lectura';

/** One direct explanation, without turning missing provenance into complete evidence. */
export function ComparisonContextNote({ context, compared, testID }: { context?: ComparisonContext; compared: number; testID: string }) {
  const { colors } = useOwnlevelTheme();
  const text = comparisonContextText(context, compared);
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${text}. Ver contexto de la comparación`}
    onPress={() => { haptics.selection(); Alert.alert('Contexto de la comparación',
      `${text}.\n\nCompleto: mismo ejercicio, modo, unidad, implemento y variante registrados.\n\nParcial: falta la variante histórica; no sabemos si cambiaste agarre, banco o posición. Una diferencia puede venir de ahí.\n\nSolo se desglosan resultados claros: subió, igual o bajó. Las señales mixtas y los casos sin referencia quedan aparte.${context === undefined && compared > 0 ? '\n\nEsta lectura no separa ambos contextos; no se supone que sean completos.' : ''}\n\nDescribe lo registrado; no demuestra el efecto del horario ni del intervalo.`, [{ text: 'Listo', style: 'cancel' }]); }}
    style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
    <AppText numeric muted variant="footnote" style={styles.text}>{text}</AppText>
    <AppIcon name="info" size={17} color={colors.textMuted} />
  </Pressable>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: brandTokens.layout.minTouch }, text: { flex: 1 } });
