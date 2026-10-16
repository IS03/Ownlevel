import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useMobileApi } from '@/api';
import { deleteAccount } from '@/api/account';
import { useMobileAuth } from '@/auth';
import { AppIcon, AppText, Button, Heading, TextField, brandTokens, useOwnlevelTheme, type AppIconName } from '@/design-system';
import { EditorialScreen } from './editorial';

const WHAT: { icon: AppIconName; text: string }[] = [
  { icon: 'dumbbell', text: 'Entrenamientos, rutinas y récords' },
  { icon: 'nutrition', text: 'Comidas, alimentos y comidas guardadas' },
  { icon: 'scale', text: 'Peso, medidas y métricas' },
  { icon: 'profile', text: 'Tu perfil, tu plan y tus ajustes' },
];
export const DELETED_NOTICE = 'Tu cuenta y todo lo que registraste se eliminaron.';
const EXPIRED_NOTICE = 'Tu sesión venció. Entrá de nuevo para eliminar tu cuenta.';
type Phase = 'idle' | 'deleting' | 'uncertain';

/** AJ7: honest, no guilt. Typing ELIMINAR enables the only red action. Deletion is idempotent server-side. */
export function DeleteAccountScreen() {
  const { client } = useMobileApi();
  const { signOut } = useMobileAuth();
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  // After one uncertain attempt, a rejected token means the account is already gone.
  const attempted = useRef(false);
  const confirmed = text.trim().toLocaleUpperCase('es-AR') === 'ELIMINAR';
  const deleting = phase === 'deleting';
  usePreventRemove(deleting, () => {});

  const remove = async () => {
    if (deleting || !confirmed || !client) return;
    setPhase('deleting');
    setMessage(null);
    const result = await deleteAccount(client);
    const wasAttempted = attempted.current;
    attempted.current = true;
    if (result.status === 'ok') return void signOut(DELETED_NOTICE);
    if (result.status === 'unauthorized' || result.status === 'auth_required')
      return void signOut(wasAttempted ? DELETED_NOTICE : EXPIRED_NOTICE);
    if (result.status === 'validation') {
      attempted.current = wasAttempted;
      setPhase('idle');
      setMessage(result.message);
      return;
    }
    setPhase('uncertain');
  };

  return (
    <EditorialScreen>
      <Heading>Eliminar cuenta</Heading>
      <AppText variant="headline">
        Se borra tu cuenta de OWNLEVEL y todo lo que registraste, en esta app y en la Web.
      </AppText>
      <View style={{ gap: brandTokens.space.md }}>
        {WHAT.map(item => (
          <View key={item.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.md }}>
            <AppIcon name={item.icon} size={20} color={colors.textMuted} />
            <AppText style={{ flex: 1 }}>{item.text}</AppText>
          </View>
        ))}
      </View>
      <AppText muted>No se puede deshacer. Si después querés volver, empezás de cero.</AppText>
      <TextField
        label="Para confirmar, escribí ELIMINAR"
        value={text}
        onChangeText={setText}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        disabled={deleting}
        returnKeyType="done"
      />
      {message ? <AppText accessibilityLiveRegion="polite">{message}</AppText> : null}
      {phase === 'uncertain' ? (
        <Animated.View entering={FadeIn.duration(brandTokens.motion.duration.fast).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(brandTokens.motion.duration.fast).reduceMotion(ReduceMotion.System)}
          accessibilityLiveRegion="polite">
          <AppText>No pudimos confirmar si se eliminó. Probá de nuevo: si ya se borró, no se repite nada.</AppText>
        </Animated.View>
      ) : null}
      <View style={{ gap: brandTokens.space.sm }}>
        <Button
          label={phase === 'uncertain' ? 'Probar de nuevo' : 'Eliminar mi cuenta'}
          accessibilityLabel={deleting ? 'Eliminando tu cuenta' : undefined}
          variant="destructive"
          loading={deleting}
          disabled={!confirmed}
          onPress={() => void remove()}
        />
        <Button label="Mejor no" variant="quiet" disabled={deleting} onPress={() => router.back()} />
      </View>
    </EditorialScreen>
  );
}
