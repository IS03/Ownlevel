import { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { KeyRound, Mail } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { AppIcon, brandTokens, GlassSurface, OwnlevelThemeProvider } from '@/design-system';
import { EntryBars, EntryGradient, type EntryMotion } from './artwork';
import { EntryLogo } from './logo';
import { openLegal } from '@/platform/legal';

export type EntryMode = 'bootstrapping' | 'signed-out' | 'signing-in' | 'complete' | 'error';
type EntryViewProps = {
  mode: EntryMode; motion: EntryMotion; notice?: string | null;
  onGoogle?: () => void; onSoon?: () => void; onRetry?: () => void;
};
const { palette: { dark }, layout, radius, space, typeScale, motion: timing } = brandTokens;

function ProviderIcon({ name }: { name: 'apple' | 'google' | 'mail' | 'passkey' }) {
  if (name === 'google') return <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path fill={dark.text} d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.61 4.61 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.31 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.12H3.05v2.59A10 10 0 0 0 12 22ZM6.39 13.92a6.01 6.01 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.34-2.59ZM12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.34 2.59A5.98 5.98 0 0 1 12 5.96Z" />
  </Svg>;
  if (Platform.OS === 'ios') return <SymbolView name={name === 'apple' ? 'apple.logo' : name === 'mail' ? 'envelope' : 'key'}
    size={20} tintColor={name === 'apple' ? '#000000' : dark.textMuted} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
  if (name === 'apple') return <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path fill="#000000" d="M17.05 12.54c.03 3.03 2.66 4.04 2.69 4.05-.02.07-.42 1.44-1.39 2.85-.84 1.22-1.71 2.43-3.08 2.46-1.35.03-1.78-.79-3.32-.79-1.53 0-2.01.76-3.29.82-1.32.05-2.33-1.32-3.18-2.54-1.73-2.5-3.05-7.07-1.27-10.15a4.93 4.93 0 0 1 4.17-2.53c1.3-.03 2.54.88 3.33.88.8 0 2.29-1.09 3.86-.93.66.03 2.51.27 3.7 2.01-.1.06-2.21 1.29-2.22 3.87ZM14.52 5.08c.71-.86 1.19-2.05 1.06-3.24-1.02.04-2.25.68-2.98 1.54-.66.76-1.24 1.97-1.09 3.14 1.14.09 2.3-.58 3.01-1.44Z" />
  </Svg>;
  const Icon = name === 'mail' ? Mail : KeyRound;
  return <Icon size={20} strokeWidth={2} color={dark.textMuted} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

function EntryButton({ label, icon, kind = 'text', disabled, busy, done, onPress, reduced }: {
  label: string; icon?: 'apple' | 'google' | 'mail' | 'passkey'; kind?: 'apple' | 'google' | 'text';
  disabled?: boolean; busy?: boolean; done?: boolean; onPress?: () => void; reduced: boolean;
}) {
  const scale = useSharedValue(1), opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withTiming(disabled && !busy && !done ? 0.4 : 1, { duration: timing.duration.fast, reduceMotion: ReduceMotion.Never }));
  }, [busy, disabled, done, opacity]);
  useEffect(() => { if (reduced) scale.set(1); }, [reduced, scale]);
  const feedback = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const press = (pressed: boolean) => {
    if (reduced) opacity.set(withTiming(pressed ? 0.7 : 1, { duration: timing.duration.fast, reduceMotion: ReduceMotion.Never }));
    else scale.set(withSpring(pressed ? timing.pressScale : 1, timing.spring));
  };
  return <Animated.View style={feedback}>
    <Pressable accessible accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
      disabled={disabled} onPress={onPress} onPressIn={() => press(true)} onPressOut={() => press(false)}
      style={[styles.button, kind === 'apple' && styles.apple, kind === 'google' && styles.google]}>
      {kind === 'google' ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <GlassSurface style={StyleSheet.absoluteFill} visible={!disabled} />
      </View> : null}
      {busy ? <ActivityIndicator color={dark.text} testID="entry-google-indicator" />
        : done ? <AppIcon name="checkmark" size={20} color={dark.text} />
          : icon ? <ProviderIcon name={icon} /> : null}
      <Text style={[styles.buttonText, kind === 'apple' && styles.appleText]}>{label}</Text>
    </Pressable>
  </Animated.View>;
}

export function EntryView({ mode, motion, notice, onGoogle, onSoon, onRetry }: EntryViewProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const busy = mode === 'signing-in' || mode === 'complete';
  const boot = mode === 'bootstrapping';
  const contentOpacity = useSharedValue(1);
  useEffect(() => {
    contentOpacity.set(withTiming(mode === 'complete' ? 0 : 1, { duration: timing.duration.base, reduceMotion: ReduceMotion.Never }));
  }, [contentOpacity, mode]);
  const contentFade = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const logoWidth = Math.min(220, width * 0.56, height * 0.26);
  // Keep the composition usable in landscape, small screens and with enlarged text.
  const top = Math.max(space.xxxl, height * 0.17 - insets.top);
  return <OwnlevelThemeProvider initialMode="dark">
    <View style={styles.screen} testID="native-sign-in-screen">
      <StatusBar style="light" />
      <EntryGradient graphite />
      <EntryBars width={width} height={height} motion={motion} resting={!busy} />
      <ScrollView bounces={false} contentContainerStyle={[styles.content, { minHeight: height, paddingTop: insets.top + top, paddingBottom: insets.bottom + Math.min(176, height * 0.21) }]}
        accessibilityLabel={boot ? 'Comprobando tu sesión' : undefined} accessibilityState={{ busy: boot }}>
        <Animated.View style={[styles.composition, contentFade]}>
        <View style={styles.logo}><EntryLogo width={logoWidth} reduced={motion.reduced} /></View>
        {!boot ? <View style={styles.actions}>
          <View style={styles.noticeSlot}>
            {notice ? <Animated.View key={notice} entering={FadeIn.duration(timing.duration.fast).reduceMotion(ReduceMotion.Never)} exiting={FadeOut.duration(timing.duration.fast).reduceMotion(ReduceMotion.Never)}
              accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.notice} testID="entry-notice">
              <Text style={styles.noticeText}>{notice}</Text>
            </Animated.View> : null}
          </View>
          {mode === 'error' ? <EntryButton label="Reintentar" onPress={onRetry} kind="google" reduced={motion.reduced} /> : <>
            <EntryButton label="Continuar con Apple" icon="apple" kind="apple" disabled={busy} onPress={onSoon} reduced={motion.reduced} />
            <EntryButton label="Continuar con Google" icon="google" kind="google" disabled={busy} busy={mode === 'signing-in'} done={mode === 'complete'} onPress={onGoogle} reduced={motion.reduced} />
            <EntryButton label="Continuar con tu mail" icon="mail" disabled={busy} onPress={onSoon} reduced={motion.reduced} />
            <EntryButton label="Usar una passkey" icon="passkey" disabled={busy} onPress={onSoon} reduced={motion.reduced} />
          </>}
          <Text style={styles.legal}>Al continuar aceptás los{' '}
            <Text accessibilityRole="link" onPress={() => openLegal('terms')} style={styles.link}>Términos</Text>
            {' '}y la{' '}
            <Text accessibilityRole="link" onPress={() => openLegal('privacy')} style={styles.link}>Política de privacidad</Text>.
          </Text>
        </View> : null}
        </Animated.View>
      </ScrollView>
    </View>
  </OwnlevelThemeProvider>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.bg, overflow: 'hidden' },
  content: { paddingHorizontal: space.xl, alignItems: 'center' },
  composition: { width: '100%', alignItems: 'center' },
  logo: { alignItems: 'center' },
  actions: { width: '100%', maxWidth: 400, gap: space.xs },
  noticeSlot: { minHeight: space.xxxl, justifyContent: 'center', marginTop: space.md },
  notice: { backgroundColor: dark.elevated, borderColor: dark.border, borderWidth: 1, borderRadius: radius.inner, padding: space.sm },
  noticeText: { ...typeScale.footnote, color: dark.text, textAlign: 'center' },
  button: { minHeight: layout.buttonHeight, borderRadius: radius.button, paddingHorizontal: space.md, paddingVertical: space.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, overflow: 'hidden' },
  apple: { backgroundColor: '#FFFFFF' },
  google: { backgroundColor: brandTokens.glass.dark.fill, borderColor: brandTokens.glass.dark.border, borderWidth: 1 },
  buttonText: { ...typeScale.headline, color: dark.text, flexShrink: 1, textAlign: 'center' },
  appleText: { color: '#000000' },
  legal: { ...typeScale.caption, color: dark.textMuted, textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.md },
  link: { color: dark.text, textDecorationLine: 'underline' },
});
