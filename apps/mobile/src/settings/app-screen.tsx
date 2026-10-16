import { Switch, View } from 'react-native';
import { AppText, Heading, useOwnlevelTheme, type ThemeMode } from '@/design-system';
import { useHapticsPreference } from '@/platform/haptics';
import { SettingsSegmented } from './native-segmented';
import { EditorialRow, EditorialScreen } from './editorial';
const themes: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];
export function AppSettingsScreen() {
  const { mode, setMode, colors } = useOwnlevelTheme();
  const haptics = useHapticsPreference();
  return (
    <EditorialScreen>
      <Heading>App</Heading>
      <AppText muted>En este dispositivo</AppText>
      <EditorialRow title="Apariencia" />
      <SettingsSegmented
        accessibilityLabel="Tema"
        options={themes}
        value={mode}
        onChange={setMode}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="headline">Vibración</AppText>
          <AppText muted variant="footnote">
            Una señal al completar una serie o cambiar un valor.
          </AppText>
        </View>
        <Switch
          accessibilityLabel="Vibración"
          value={haptics.enabled}
          onValueChange={haptics.setEnabled}
          trackColor={{ true: colors.primary }}
        />
      </View>
      {haptics.persistenceFailed ? (
        <AppText accessibilityLiveRegion="polite" muted>
          La vibración cambió, pero no pudimos recordarla para la próxima vez.
        </AppText>
      ) : null}
    </EditorialScreen>
  );
}
