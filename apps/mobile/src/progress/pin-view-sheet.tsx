import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMobileApi } from '@/api';
import { createProgressView, viewIntentKey, type ProgressViewDefinition } from '@/api/progress-views';
import { AppIcon, AppText, Button, InlineNotice, TextField, spacing, useOwnlevelTheme, type AppIconName } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { BREAKDOWN_LABELS, DAYS_LABELS } from './explore-model';
import { ExploreSheet } from './explore-sheets';

/** "Proteína por momento de la comida · con entrenamiento", at most 60 characters. */
export function suggestedViewName(label: string, d: ProgressViewDefinition): string {
  const name = `${label}${d.breakdown ? ` por ${BREAKDOWN_LABELS[d.breakdown].toLocaleLowerCase('es-AR')}` : ''}${d.days ? ` · ${DAYS_LABELS[d.days].toLocaleLowerCase('es-AR')}` : ''}`;
  return name.length <= 60 ? name : `${name.slice(0, 59).trimEnd()}…`;
}

/** S6 · pin the current Explorar query. One idempotency key per sheet: a retry never creates a second view. */
export function PinViewSheet({ label, definition, preview, onPinned, onClose }: {
  label: string; definition: ProgressViewDefinition; preview: string; onPinned: () => void; onClose: () => void;
}) {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const [name, setName] = useState(() => suggestedViewName(label, definition));
  // Same name = same intent (a retry reuses the key); a new name is a new intent.
  const [key, setKey] = useState(viewIntentKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const pin = async () => {
    if (!client || busy || !trimmed) return;
    setBusy(true); setError(null);
    const result = await createProgressView(client, { name: trimmed.slice(0, 60), definition, idempotencyKey: key });
    setBusy(false);
    if (result.status === 'ok') { haptics.selection(); onPinned(); onClose(); return; }
    setError(result.status === 'validation' ? result.message : 'No pudimos fijarla. Probá de nuevo.');
  };
  const info: [AppIconName, string, string][] = [['calendar', 'Período', 'El que elijas en Progreso'], ['compare', 'Comparación', 'La de Progreso, si está activa']];
  return <ExploreSheet title="Fijar vista" onClose={onClose}>
    <TextField label="Nombre" value={name} maxLength={60} onChangeText={v => { setName(v); setKey(viewIntentKey()); }} testID="pin-view-name" />
    <View style={styles.preview} testID="pin-view-preview">
      <AppText muted variant="caption">Así va a quedar en Progreso</AppText>
      <AppText muted variant="caption" style={styles.name} numberOfLines={1}>{trimmed || 'Sin nombre'}</AppText>
      <AppText numeric variant="title2">{preview}</AppText>
    </View>
    <View>{info.map(([icon, title, detail], i) => <View key={title} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <AppIcon name={icon} color={colors.textMuted} size={18} />
      <AppText variant="headline" style={styles.grow}>{title}</AppText>
      <AppText muted variant="subheadline">{detail}</AppText>
    </View>)}</View>
    {error ? <InlineNotice tone="neutral" message={error} /> : null}
    <Button label={busy ? 'Fijando…' : 'Fijar'} disabled={busy || !trimmed} onPress={() => void pin()} testID="pin-view-confirm" />
  </ExploreSheet>;
}
const styles = StyleSheet.create({
  preview: { gap: 2 }, name: { fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingVertical: 8 },
  grow: { flex: 1 },
});
