import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { MobileRoutineColorKey } from '@/api/home';
import { AppIcon, AppText, GlassSurface, TextField, brandTokens, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { RoutineColorPicker } from './routine-color-picker';
import { trainingRoutineColor } from './routine-colors';
import { RoutineFormSheet } from './routine-form-sheet';

export type RoutineCreateInput = { name: string; color: MobileRoutineColorKey; idempotencyKey: string };
export function validRoutineName(name: string): boolean { return name.trim().length > 0 && name.trim().length <= 120; }

export function CreateRoutineSheet({ createIdempotencyKey, onClose, onSubmit, open, pending }: {
  createIdempotencyKey: () => string; onClose: () => void; onSubmit: (input: RoutineCreateInput) => Promise<string | null>;
  open: boolean; pending: boolean;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [name, setName] = useState('');
  const [color, setColor] = useState<MobileRoutineColorKey>('violet');
  const [error, setError] = useState<string | null>(null);
  const intent = useRef<string | null>(null);
  const submitting = useRef(false);
  const valid = validRoutineName(name);
  const edit = () => { intent.current = null; setError(null); };
  const submit = async () => {
    if (!valid || pending || submitting.current) return;
    submitting.current = true;
    const key = intent.current ?? createIdempotencyKey();
    intent.current = key;
    try {
      const failure = await onSubmit({ name: name.trim(), color, idempotencyKey: key });
      if (failure) setError(failure);
    } finally { submitting.current = false; }
  };
  return (
    <RoutineFormSheet onClose={onClose} open={open} pending={pending}>
      <View style={[styles.content, { maxHeight: height * 0.8 }]} testID="create-routine-sheet">
        <View style={styles.header}>
          <GlassSurface interactive style={styles.round}>
            <Pressable accessibilityLabel="Cerrar nueva rutina" accessibilityRole="button" accessibilityState={{ disabled: pending }} disabled={pending} onPress={onClose} style={({ pressed }) => [styles.round, pressedStyle(pressed, reduceMotion)]}>
              <AppIcon color={colors.text} name="close" size={20} />
            </Pressable>
          </GlassSurface>
          <AppText accessibilityRole="header" style={styles.title} variant="headline">Nueva rutina</AppText>
          <GlassSurface interactive style={styles.round}>
            <Pressable accessibilityLabel={pending ? 'Creando…' : 'Crear rutina'} accessibilityRole="button" accessibilityState={{ disabled: pending || !valid }} disabled={pending || !valid} onPress={() => void submit()} style={({ pressed }) => [styles.round, { opacity: valid ? 1 : 0.4 }, pressedStyle(pressed, reduceMotion)]}>
              {pending ? <ActivityIndicator color={colors.primary} /> : <AppIcon color={colors.primary} name="checkmark" size={20} />}
            </Pressable>
          </GlassSurface>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form} style={styles.scroll}>
          <View style={styles.group}>
            <AppText muted variant="caption">Así se va a ver</AppText>
            <View style={[styles.preview, { backgroundColor: colors.surface }]} testID="new-routine-preview">
              <View style={[styles.strip, { backgroundColor: trainingRoutineColor(color, isDark) }]} />
              <View style={styles.copy}>
                <AppText muted={!name.trim()} numberOfLines={2} variant="headline">{name.trim() || 'Nombre de la rutina'}</AppText>
                <AppText muted variant="subheadline">Sin ejercicios todavía</AppText>
              </View>
            </View>
          </View>
          <TextField accessibilityLabel="Nombre de la rutina" autoCapitalize="words" autoFocus disabled={pending}
            error={name.trim().length > 120 ? 'Usá un nombre de hasta 120 caracteres.' : undefined} hideLabel label="Nombre"
            onChangeText={value => { setName(value); edit(); }} onSubmitEditing={() => void submit()}
            placeholder="Nombre de la rutina" returnKeyType="done" value={name} />
          <RoutineColorPicker color={color} disabled={pending} onChange={value => { setColor(value); edit(); }} />
          <AppText muted variant="footnote">Los ejercicios los sumás después, en el editor.</AppText>
          {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="footnote">{error}</AppText> : null}
        </ScrollView>
      </View>
    </RoutineFormSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm },
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  form: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xl },
  group: { gap: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  preview: { alignItems: 'center', borderRadius: radius.card, flexDirection: 'row', gap: spacing.md, minHeight: 76, padding: brandTokens.layout.cardPadding },
  round: { alignItems: 'center', borderRadius: radius.full, height: 44, justifyContent: 'center', width: 44 },
  scroll: { flexGrow: 0 },
  strip: { borderRadius: brandTokens.radius.full, height: brandTokens.layout.rowHeight, width: 4 },
  title: { flex: 1, textAlign: 'center' },
});
