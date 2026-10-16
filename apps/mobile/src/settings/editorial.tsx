import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  AppIcon,
  AppText,
  atmosphere,
  glowGradient,
  SkeletonBlock,
  useOwnlevelTheme,
  useReduceMotion,
  pressedStyle,
  type AppTextVariant,
} from '@/design-system';
import { useTweenedNumber } from '@/nutrition/use-tweened-number';

export const formatNumber = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
export function CountingNumber({
  value,
  variant = 'body',
}: {
  value: number | null;
  variant?: AppTextVariant;
}) {
  const shown = useTweenedNumber(value, 300);
  return (
    <AppText numeric variant={variant} style={{ color: useOwnlevelTheme().colors.primary }}>
      {shown === null ? 'Sin dato' : formatNumber(shown)}
    </AppText>
  );
}
export function EditorialScreen({ children }: PropsWithChildren) {
  const { isDark, colors } = useOwnlevelTheme();
  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: glowGradient(atmosphere[isDark ? 'dark' : 'light'].glow),
          },
        ]}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 40 }}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Reveal({ children, index = 0 }: PropsWithChildren<{ index?: number }>) {
  const reduced = useReduceMotion();
  return (
    <Animated.View
      entering={(reduced ? FadeIn : FadeInDown).duration(200).delay(reduced ? 0 : index * 24)}
    >
      {children}
    </Animated.View>
  );
}
export function EditorialRow({
  title,
  children,
  onPress,
  disabled = false,
  large = false,
  hint,
}: {
  title: string;
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  large?: boolean;
  hint?: string;
}) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const content = (
    <>
      <View style={{ flex: 1, gap: 8 }}>
        <AppText variant={large ? 'title1' : 'headline'}>{title}</AppText>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {typeof children === 'string' ? (
            <AppText numeric style={{ color: colors.primary }}>
              {children}
            </AppText>
          ) : (
            children
          )}
        </View>
        {hint ? (
          <AppText muted variant="footnote">
            {hint}
          </AppText>
        ) : null}
      </View>
      {onPress ? <AppIcon name="chevronRight" size={20} color={colors.textMuted} /> : null}
    </>
  );
  const style = {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 20,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 16,
    minHeight: 64,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [style, pressedStyle(pressed, reduced), disabled && { opacity: 0.5 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
export function EditorialSkeleton() {
  return (
    <View
      accessibilityLabel="Actualizando ajustes"
      accessibilityState={{ busy: true }}
      style={{ gap: 24 }}
      testID="settings-skeleton"
    >
      <SkeletonBlock height={82} width="90%" />
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ gap: 12 }}>
          <SkeletonBlock height={28} width="52%" />
          <SkeletonBlock height={18} width="70%" />
        </View>
      ))}
    </View>
  );
}
