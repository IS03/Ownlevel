import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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
  brandTokens,
} from '@/design-system';
import { useTweenedNumber } from '@/nutrition/use-tweened-number';

export const formatNumber = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
/** Keep the same content and controls, but stack pairs before Dynamic Type squeezes their labels. */
export function useEditorialLayout() {
  const { fontScale } = useWindowDimensions();
  return {
    largeText: fontScale > 1.3,
    largeInputStyle: {
      ...brandTokens.typeScale.title1,
      minHeight: Math.max(48, 34 * fontScale + 24),
    },
  };
}
export function EditorialSpread({ children, style, testID }: PropsWithChildren<{ style?: ViewStyle; testID?: string }>) {
  const { largeText } = useEditorialLayout();
  return <View testID={testID} style={[{ flexDirection: largeText ? 'column' : 'row', alignItems: largeText ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 16 }, style]}>{children}</View>;
}
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
export function EditorialScreen({ children,scrollEnabled=true,adjustKeyboardInsets=true }: PropsWithChildren<{scrollEnabled?:boolean;adjustKeyboardInsets?:boolean}>) {
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
        scrollEnabled={scrollEnabled}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={adjustKeyboardInsets}
        keyboardDismissMode="interactive"
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
  expanded,
  arrow = 'down',
}: {
  title: string;
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  large?: boolean;
  hint?: string;
  /** Optional: the row opens a block below it. Shows a down/up arrow and the expanded state instead of the chevron. */
  expanded?: boolean;
  /** With `expanded`: 'down' flips a down arrow up when open; 'right' turns a side arrow to point down (inline pickers). */
  arrow?: 'down' | 'right';
}) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const turn = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    turn.set(reduced ? (expanded ? 1 : 0) : withTiming(expanded ? 1 : 0, { duration: brandTokens.motion.duration.fast }));
  }, [expanded, reduced, turn]);
  const turned = useAnimatedStyle(() => ({ transform: [{ rotate: `${(arrow === 'right' ? 90 : 180) * turn.get()}deg` }] }));
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
      {onPress && expanded !== undefined ? (
        <Animated.View style={turned}><AppIcon name={arrow === 'right' ? 'chevronRight' : 'chevronDown'} size={20} color={colors.textMuted} /></Animated.View>
      ) : onPress ? <AppIcon name="chevronRight" size={20} color={colors.textMuted} /> : null}
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
      accessibilityValue={typeof children === 'string' ? { text: children } : undefined}
      accessibilityState={expanded === undefined ? { disabled } : { disabled, expanded }}
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
