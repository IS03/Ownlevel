import { useEffect, useState, type ComponentType } from 'react';
import { AccessibilityInfo, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useOwnlevelTheme } from '@/design-system';
import { FinishScaleControl as ScaleFallback, FinishPainControl as PainFallback, type FinishControlProps } from './finish-controls-rn';
export type { FinishControlProps } from './finish-controls-rn';

type Props = ViewProps & { value: number | null; disabled: boolean; label: string; accent: string; trackColor: string; isDark: boolean;
  onValueCommit: (event: NativeSyntheticEvent<{ value: number | null }>) => void };
const available = !!requireOptionalNativeModule('OwnlevelFinishControls') && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
const NativeScale: ComponentType<Props> | null = available ? requireNativeView<Props>('OwnlevelFinishControls', 'FinishScaleView') : null;
const NativePain: ComponentType<Props> | null = available ? requireNativeView<Props>('OwnlevelFinishControls', 'FinishPainView') : null;
function useNativeAllowed() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (alive) setReduced(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => { alive = false; listener.remove(); };
  }, []);
  return !reduced;
}
export function FinishScaleControl(props: FinishControlProps) {
  const allowed = useNativeAllowed(), { colors, isDark } = useOwnlevelTheme();
  return allowed && NativeScale ? <NativeScale {...props} accent={colors.primary} trackColor={colors.surfaceRaised} isDark={isDark}
    onValueCommit={event => props.onChange(event.nativeEvent.value)} style={{ height: 52, width: '100%' }} testID={`summary-${props.field}-native`} /> : <ScaleFallback {...props} />;
}
export function FinishPainControl(props: FinishControlProps) {
  const allowed = useNativeAllowed(), { colors, isDark } = useOwnlevelTheme();
  return allowed && NativePain ? <NativePain {...props} accent={colors.primary} trackColor={colors.surfaceRaised} isDark={isDark}
    onValueCommit={event => props.onChange(event.nativeEvent.value)} style={{ height: 52, width: '100%' }} testID={`summary-${props.field}-native`} /> : <PainFallback {...props} />;
}
