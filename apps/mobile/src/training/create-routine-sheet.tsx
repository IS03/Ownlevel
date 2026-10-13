import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { MobileRoutineColorKey } from '@/api/home';
import { AppIcon, AppText, GlassSurface, TextField, brandTokens, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { RoutineColorPicker } from './routine-color-picker';
import { trainingRoutineColor } from './routine-colors';
import { RoutineFormSheet } from './routine-form-sheet';

export type RoutineCreateInput = { name: string; color: MobileRoutineColorKey | null; idempotencyKey: string };
export type DuplicateRoutineSource = {
  id: string; name: string; color: MobileRoutineColorKey | null;
  exerciseCount: number; setCount: number; expectedUpdatedAt: string; expectedTemplateVersion: number;
  unrecognizedColor?: string;
};
export function validRoutineName(name: string): boolean { return name.trim().length > 0 && name.trim().length <= 120; }

export function CreateRoutineSheet({ createIdempotencyKey, onClose, onSubmit, open, pending, duplicate, identity }: {
  createIdempotencyKey: () => string; onClose: () => void; onSubmit: (input: RoutineCreateInput) => Promise<string | null>;
  open: boolean; pending: boolean; duplicate?: DuplicateRoutineSource; identity?: DuplicateRoutineSource;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const source = identity ?? duplicate;
  const [name, setName] = useState(identity ? identity.name : duplicate ? `${duplicate.name} copia` : '');
  const [color, setColor] = useState<MobileRoutineColorKey | null>(source ? source.color : 'violet');
  const [error, setError] = useState<string | null>(null);
  const intent = useRef<string | null>(null);
  const submitting = useRef(false);
  const [colorChosen, setColorChosen] = useState(false);
  const colorReady = !source?.unrecognizedColor || colorChosen;
  const changed = !identity || name.trim() !== identity.name || color !== identity.color || Boolean(identity.unrecognizedColor && colorChosen);
  const valid = validRoutineName(name) && colorReady && changed;
  const title = identity ? 'Editar rutina' : duplicate ? `Duplicar ${duplicate.name}` : 'Nueva rutina';
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
            <Pressable accessibilityLabel={identity ? 'Cerrar identidad' : duplicate ? 'Cerrar duplicación' : 'Cerrar nueva rutina'} accessibilityRole="button" accessibilityState={{ disabled: pending }} disabled={pending} onPress={onClose} style={({ pressed }) => [styles.round, pressedStyle(pressed, reduceMotion)]}>
              <AppIcon color={colors.text} name="close" size={20} />
            </Pressable>
          </GlassSurface>
          <AppText accessibilityRole="header" style={styles.title} variant="headline">{title}</AppText>
          <GlassSurface interactive style={styles.round}>
            <Pressable accessibilityLabel={pending ? identity ? 'Guardando…' : duplicate ? 'Duplicando…' : 'Creando…' : identity ? 'Guardar cambios' : duplicate ? 'Duplicar rutina' : 'Crear rutina'} accessibilityRole="button" accessibilityState={{ disabled: pending || !valid }} disabled={pending || !valid} onPress={() => void submit()} style={({ pressed }) => [styles.round, { opacity: valid ? 1 : 0.4 }, pressedStyle(pressed, reduceMotion)]}>
              {pending ? <ActivityIndicator color={colors.primary} /> : <AppIcon color={colors.primary} name="checkmark" size={20} />}
            </Pressable>
          </GlassSurface>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form} style={styles.scroll}>
          <View style={styles.group}>
            <AppText muted variant="caption">Así se va a ver</AppText>
            <View style={[styles.preview, { backgroundColor: colors.surface }]} testID="new-routine-preview">
              {color ? <View style={[styles.strip, { backgroundColor: trainingRoutineColor(color, isDark) }]} /> : null}
              <View style={styles.copy}>
                <AppText muted={!name.trim()} numberOfLines={2} variant="headline">{name.trim() || 'Nombre de la rutina'}</AppText>
                <AppText muted numeric={Boolean(source)} variant="subheadline">{source
                  ? `${source.exerciseCount} ${source.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'} · ${source.setCount} ${source.setCount === 1 ? 'serie' : 'series'}`
                  : 'Sin ejercicios todavía'}</AppText>
              </View>
            </View>
          </View>
          <TextField accessibilityLabel="Nombre de la rutina" autoCapitalize="words" autoFocus disabled={pending}
            error={name.trim().length > 120 ? 'Usá un nombre de hasta 120 caracteres.' : undefined} hideLabel label="Nombre"
            onChangeText={value => { setName(value); edit(); }} onSubmitEditing={() => void submit()}
            placeholder="Nombre de la rutina" returnKeyType="done" value={name} />
          <RoutineColorPicker color={color} disabled={pending} onChange={value => { setColor(value); setColorChosen(true); edit(); }} />
          {identity ? <Pressable accessibilityRole="radio" accessibilityLabel="Sin color" accessibilityState={{ checked: colorReady && color === null }} disabled={pending}
            onPress={() => { setColor(null); setColorChosen(true); edit(); }} style={[styles.noColor, { borderColor: colorReady && color === null ? colors.primary : colors.border }]}>
            <AppText variant="subheadline">Sin color</AppText>
          </Pressable> : null}
          <AppText muted numeric={Boolean(duplicate)} variant="footnote">{identity ? 'Cambiar el nombre o el color no modifica tus sesiones anteriores.' : duplicate
            ? duplicate.exerciseCount === 0 ? `Se copia la rutina sin ejercicios. ${duplicate.name} queda igual.` : `Se ${duplicate.exerciseCount === 1 ? 'copia el ejercicio' : `copian los ${duplicate.exerciseCount} ejercicios`} con sus series. ${duplicate.name} queda igual.`
            : 'Los ejercicios los sumás después, en el editor.'}</AppText>
          {!colorReady ? <AppText muted variant="footnote">Esta rutina usa un color de una versión más nueva. Elegí un color{identity ? ' o “Sin color”' : ''} para guardar.</AppText> : null}
          {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="footnote">{error}</AppText> : null}
        </ScrollView>
      </View>
    </RoutineFormSheet>
  );
}

const styles = StyleSheet.create({
  noColor: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.chip, borderWidth: 1 },
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
