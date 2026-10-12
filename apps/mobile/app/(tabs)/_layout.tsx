import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { StyleSheet, View } from 'react-native';

import { useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { SessionRestAccessory, SessionReturnDock } from '@/training/session-return-dock';
import { supportsNativeSessionNavigation, useSessionNavigation } from '@/training/use-session-navigation';

export default function TabsLayout() {
  const { colors, isDark } = useOwnlevelTheme();
  const sessionNavigation = useSessionNavigation();

  return (
    <View style={styles.root}><NativeTabs
      backgroundColor={colors.surface}
      backBehavior="history"
      blurEffect={isDark ? 'systemMaterialDark' : 'systemMaterialLight'}
      iconColor={{ default: colors.textMuted, selected: colors.primary }}
      indicatorColor={colors.surfaceRaised}
      labelStyle={{
        default: { color: colors.textMuted },
        selected: { color: colors.primary, fontWeight: '600' },
      }}
      rippleColor={colors.surfaceRaised}
      screenListeners={{ tabPress: () => haptics.selection() }}
      shadowColor={colors.border}
      tintColor={colors.primary}
      unstable_nativeProps={{ ios: { bottomAccessoryHidden: !sessionNavigation.showRest } }}
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'home', selected: 'home' }}
          sf={{ default: 'house', selected: 'house.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="train">
        <NativeTabs.Trigger.Label>Entrenar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'fitness_center', selected: 'fitness_center' }}
          sf={{ default: 'dumbbell', selected: 'dumbbell.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="nutrition">
        <NativeTabs.Trigger.Label>Nutrición</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'restaurant', selected: 'restaurant' }}
          sf={{ default: 'fork.knife', selected: 'fork.knife' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>Progreso</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'show_chart', selected: 'show_chart' }}
          sf={{ default: 'chart.line.uptrend.xyaxis', selected: 'chart.line.uptrend.xyaxis' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="active-workout" role="search" disabled
        hidden={!supportsNativeSessionNavigation || !sessionNavigation.showReturn}
        accessibilityLabel={`Volver a la rutina en curso: ${sessionNavigation.session?.name ?? ''}`}
        listeners={{ tabPress: sessionNavigation.openSession }}>
        <NativeTabs.Trigger.Label hidden>En curso</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'dumbbell', selected: 'dumbbell.fill' }} md="fitness_center" />
      </NativeTabs.Trigger>
      {supportsNativeSessionNavigation ? <NativeTabs.BottomAccessory><SessionRestAccessory navigation={sessionNavigation} /></NativeTabs.BottomAccessory> : null}
    </NativeTabs>{supportsNativeSessionNavigation ? null : <SessionReturnDock navigation={sessionNavigation} />}</View>
  );
}
const styles = StyleSheet.create({ root: { flex: 1 } });
