import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import { palette } from './brand';
import { useOwnlevelTheme } from './theme';

/** Liquid Glass (iOS 26+) is used only when the API exists at runtime (some iOS 26 betas lack it). */
function liquidGlassSupported(): boolean {
  return Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
}

export function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(value => { if (alive) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduced);
    return () => { alive = false; subscription?.remove(); };
  }, []);
  return reduced;
}

const rgbOf = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(',');

/**
 * A floating control's material (IDENTIDAD.md § Vidrio: only on controls). iOS 26: native
 * Liquid Glass. Android, older iOS or Reduce Transparency: the brand surface, nearly opaque
 * (there is no blur fallback), so content passing below never muddies the text.
 *
 * `visible` switches the glass with its own animation: an opacity of 0 on a GlassView (or a
 * parent) stops it rendering, so fades never go through opacity.
 */
export function GlassSurface({ children, style, testID, tint, visible = true, interactive = false }: PropsWithChildren<{
  style?: StyleProp<ViewStyle>; testID?: string; tint?: string; visible?: boolean; interactive?: boolean;
}>) {
  const { isDark } = useOwnlevelTheme();
  const reduceTransparency = useReduceTransparency();
  if (liquidGlassSupported() && !reduceTransparency) {
    return (
      <GlassView colorScheme={isDark ? 'dark' : 'light'} glassEffectStyle={{ animate: true, animationDuration: 0.2, style: visible ? 'regular' : 'none' }}
        style={style} testID={testID} tintColor={tint} isInteractive={interactive}>
        {children}
      </GlassView>
    );
  }
  const surface = rgbOf(palette[isDark ? 'dark' : 'light'].surface);
  return (
    <View style={[{ backgroundColor: visible ? `rgba(${surface},0.94)` : 'transparent' }, style, tint && visible ? { backgroundColor: tint } : null]} testID={testID}>
      {children}
    </View>
  );
}
