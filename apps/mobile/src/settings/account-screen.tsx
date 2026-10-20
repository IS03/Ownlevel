import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import {
  AppIcon,
  AppText,
  Button,
  GlassSurface,
  Heading,
  SkeletonBlock,
  brandTokens,
  pressedStyle,
  useOwnlevelTheme,
  useReduceMotion,
} from '@/design-system';
import { NutritionGlassButton } from '@/nutrition/day-controls';
import { SaveButton } from '@/nutrition/save-button';
import { NutritionToast } from '@/nutrition/nutrition-toast';
import { AccountAvatar } from './account-avatar';
import { EditorialRow, EditorialScreen } from './editorial';
import { useDisplayNameController } from './use-display-name-controller';

export function AccountScreen() {
  const { client } = useMobileApi();
  const { session, state: auth, signOut } = useMobileAuth();
  const name = useDisplayNameController(session ? client : null, session?.user.id ?? 'anonymous');
  const state = name?.state,
    controller = name?.controller;
  const identity = state?.read.identity;
  const [leaving, setLeaving] = useState(false);
  const pending = state?.phase === 'pending' || (state?.phase === 'confirmed' && !state.message);
  const locked = state?.phase !== 'idle' || !!state?.intent;
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  useEffect(() => {
    if (!state?.notice) return;
    const timer = setTimeout(() => controller?.dismissNotice(), 2200);
    return () => clearTimeout(timer);
  }, [state?.notice, controller]);
  const navigation = useNavigation();
  const router = useRouter();
  usePreventRemove(
    !!controller && (pending || (controller.dirty() && !state?.intent)),
    ({ data }) => {
      if (pending) return;
      Alert.alert('¿Dejar el nombre como estaba?', 'Lo que escribiste todavía no está guardado.', [
        { text: 'Seguir escribiendo', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => {
            controller?.close();
            navigation.dispatch(data.action);
          },
        },
      ]);
    },
  );
  const cancel = () =>
    controller?.dirty()
      ? Alert.alert('¿Dejar el nombre como estaba?', 'Lo que escribiste todavía no está guardado.', [
          { text: 'Seguir escribiendo', style: 'cancel' },
          { text: 'Descartar', style: 'destructive', onPress: () => controller.close() },
        ])
      : controller?.close();
  const logout = () =>
    Alert.alert('¿Cerrar sesión?', 'Podés volver a entrar cuando quieras.', [
      { text: 'Quedarme', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        onPress: () => {
          setLeaving(true);
          void signOut().finally(() => setLeaving(false));
        },
      },
    ]);
  return (
    <View style={{ flex: 1 }}>
      <EditorialScreen>
        <Heading>Cuenta</Heading>
        <View style={{ alignItems: 'center' }}>
          <AccountAvatar name={identity?.displayName ?? null} />
        </View>
        <AppText muted variant="caption">
          CÓMO TE LLAMAMOS
        </AppText>
        {state?.editor ? (
          // Edited in place, at the same size it is shown; cancel and save as small controls beside it.
          <View style={styles.nameRow}>
            <TextInput
              accessibilityLabel="Cómo querés que te llamemos"
              autoFocus
              value={state.editor.draft}
              onChangeText={(text) => controller?.change(text)}
              editable={!locked}
              maxLength={80}
              // Wraps like the shown name instead of scrolling sideways; Return still saves.
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!locked) void controller?.save();
              }}
              style={[styles.nameInput, { color: colors.text }]}
            />
            {!locked ? <NutritionGlassButton icon="close" label="Cancelar" onPress={cancel} /> : null}
            {pending ? (
              <ActivityIndicator accessibilityLabel="Guardando nombre" color={colors.textMuted} />
            ) : (
              <NutritionGlassButton
                icon="checkmark"
                label="Guardar nombre"
                onPress={locked ? undefined : () => void controller?.save()}
              />
            )}
          </View>
        ) : identity ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Editar nombre"
            disabled={locked}
            onPress={() => controller?.open()}
            style={{ minHeight: 50, justifyContent: 'center' }}
          >
            <Heading>{identity.displayName ?? 'Elegí tu nombre'}</Heading>
          </Pressable>
        ) : state?.read.status === 'unavailable' ? (
          <Button label="Volver a buscar tu nombre" onPress={() => void controller?.load()} />
        ) : (
          <SkeletonBlock height={50} width="70%" />
        )}
        {state?.phase === 'conflict' ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
            {state.read.stale || !identity ? (
              <AppText>El nombre cambió en otro lado. No pudimos traer cómo quedó.</AppText>
            ) : (
              <AppText>
                Cambiaste el nombre en otro lado. Quedó «{identity.displayName ?? 'sin nombre'}».
              </AppText>
            )}
            <Button
              label={state.read.stale || !identity ? 'Actualizar nombre' : 'Volver a escribirlo'}
              onPress={() =>
                state.read.stale || !identity ? void controller?.load() : controller?.reviewTruth()
              }
            />
          </View>
        ) : null}
        {state && !pending && ['uncertain', 'confirmed', 'blocked'].includes(state.phase) ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
            <AppText>
              {state.phase === 'confirmed'
                ? 'Tu nombre se guardó. Falta mostrarlo actualizado.'
                : state.phase === 'blocked'
                  ? 'No pudimos guardar el cambio en este teléfono.'
                  : 'Tu cambio sigue acá. Comprobá si llegó antes de hacer otro.'}
            </AppText>
            <Button label="Comprobar cambio" onPress={() => void controller?.recover()} />
          </View>
        ) : state?.message && state.phase === 'idle' ? (
          <AppText accessibilityLiveRegion="polite">
            {state.message.includes('borrador')
              ? 'Revisá lo que escribiste antes de guardar.'
              : state.message}
          </AppText>
        ) : null}
        {state?.notice ? <SaveButton label="Listo" state="done" onPress={() => {}} /> : null}
        <AppText muted variant="footnote">
          Así te saludamos en Inicio.
        </AppText>
        <EditorialRow title="Email">{session?.user.email ?? 'Sin email'}</EditorialRow>
        {auth.status === 'TRANSIENT_ERROR' ? (
          <AppText accessibilityLiveRegion="polite">
            No pudimos comprobar tu sesión ahora. Seguís en tu cuenta.
          </AppText>
        ) : null}
        {leaving ? (
          <ActivityIndicator accessibilityLabel="Cerrando sesión" />
        ) : (
          // A control, so native glass; destructive color because it takes you out of the app.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            onPress={logout}
            style={({ pressed }) => pressedStyle(pressed, reduced)}
          >
            <GlassSurface interactive style={styles.signOut}>
              <AppText variant="headline" style={{ color: colors.danger }}>
                Cerrar sesión
              </AppText>
            </GlassSurface>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Eliminar cuenta"
          accessibilityHint="Borra tu cuenta y todo lo que registraste, también en la Web."
          accessibilityState={{ disabled: leaving }}
          disabled={leaving}
          onPress={() => router.push('/settings/delete-account')}
          style={({ pressed }) => [styles.delete, pressedStyle(pressed, reduced), leaving && { opacity: 0.5 }]}
        >
          <AppIcon name="warning" size={20} color={colors.danger} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="headline" style={{ color: colors.danger }}>
              Eliminar cuenta
            </AppText>
            <AppText muted variant="footnote">
              Borra tu cuenta y todo lo que registraste, también en la Web. No se puede deshacer.
            </AppText>
          </View>
          <AppIcon name="chevronRight" size={20} color={colors.danger} />
        </Pressable>
      </EditorialScreen>
      {state?.notice ? <NutritionToast message="Nombre guardado." state="done" /> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm, minHeight: 50 },
  nameInput: { ...brandTokens.typeScale.largeTitle, flex: 1, padding: 0 },
  signOut: {
    minHeight: brandTokens.layout.buttonHeight,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: brandTokens.space.xl,
    overflow: 'hidden',
  },
  delete: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.md, paddingVertical: brandTokens.space.lg },
});
