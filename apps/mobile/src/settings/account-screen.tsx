import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import { AppText, Button, Heading, SkeletonBlock, TextField } from '@/design-system';
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
  const provider =
    session?.user.app_metadata.provider === 'google'
      ? 'Google'
      : session?.user.app_metadata.provider === 'apple'
        ? 'Apple'
        : 'tu cuenta';
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
        <View style={{ alignItems: 'center', gap: 12 }}>
          <AccountAvatar name={identity?.displayName ?? null} />
          <AppText muted variant="footnote">
            {provider === 'tu cuenta' ? 'Tu cuenta conectada' : `Tu cuenta de ${provider}`}
          </AppText>
        </View>
        <AppText muted variant="caption">
          CÓMO TE LLAMAMOS
        </AppText>
        {state?.editor ? (
          <View style={{ gap: 12 }}>
            <TextField
              label="Cómo querés que te llamemos"
              autoFocus
              value={state.editor.draft}
              onChangeText={(text) => controller?.change(text)}
              disabled={locked}
              maxLength={80}
            />
            {state.phase === 'idle' || pending ? (
              <SaveButton
                label="Listo"
                state={pending ? 'saving' : 'idle'}
                disabled={locked}
                onPress={() => void controller?.save()}
              />
            ) : null}
            {!locked ? (
              <Button
                label="Cancelar"
                variant="quiet"
                onPress={() =>
                  controller?.dirty()
                    ? Alert.alert(
                        '¿Dejar el nombre como estaba?',
                        'Lo que escribiste todavía no está guardado.',
                        [
                          { text: 'Seguir escribiendo', style: 'cancel' },
                          {
                            text: 'Descartar',
                            style: 'destructive',
                            onPress: () => controller.close(),
                          },
                        ],
                      )
                    : controller?.close()
                }
              />
            ) : null}
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
        <View>
          <EditorialRow title="Email">{session?.user.email ?? 'Sin email'}</EditorialRow>
          <EditorialRow title={`Entrás con ${provider}`}>
            Es la misma cuenta que usás en OWNLEVEL Web.
          </EditorialRow>
        </View>
        {auth.status === 'TRANSIENT_ERROR' ? (
          <AppText accessibilityLiveRegion="polite">
            No pudimos comprobar tu sesión ahora. Seguís en tu cuenta.
          </AppText>
        ) : null}
        {leaving ? (
          <ActivityIndicator accessibilityLabel="Cerrando sesión" />
        ) : (
          <Button label="Cerrar sesión" variant="quiet" onPress={logout} />
        )}
        <EditorialRow
          title="Eliminar cuenta"
          hint="Borra tu cuenta y todo lo que registraste, también en la Web."
          disabled={leaving}
          onPress={() => router.push('/settings/delete-account')}
        />
      </EditorialScreen>
      {state?.notice ? <NutritionToast message="Nombre guardado." state="done" /> : null}
    </View>
  );
}
