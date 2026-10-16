import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AppIcon, Button, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';

export type SaveButtonState = 'idle' | 'saving' | 'done';
const HEIGHT = brandTokens.layout.buttonHeight;

/**
 * Primary save button that shows the save happening: it narrows into a circle with the native spinner while the
 * request runs, then turns into a check. Visual only: the controller still owns the write and its recovery.
 */
export function SaveButton({ label, state, disabled, onPress, testID }: {
  label: string; state: SaveButtonState; disabled?: boolean; onPress: () => void; testID?: string;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const [width, setWidth] = useState(0);
  const shrink = useSharedValue(0);
  useEffect(() => {
    const target = state === 'idle' ? 0 : 1;
    shrink.set(reduced ? target : withTiming(target, { duration: brandTokens.motion.duration.fast }));
  }, [reduced, shrink, state]);
  const pill = useAnimatedStyle(() => width > 0 ? {
    width: width - (width - HEIGHT) * shrink.value,
    borderRadius: brandTokens.radius.button + (HEIGHT / 2 - brandTokens.radius.button) * shrink.value,
  } : {});
  if (state === 'idle') return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Button label={label} disabled={disabled} onPress={onPress} testID={testID} />
  </View>;
  return <View style={styles.row} onLayout={event => { if (!width) setWidth(event.nativeEvent.layout.width); }}>
    <Animated.View accessible accessibilityRole="button" accessibilityLabel={state === 'saving' ? 'Guardando' : 'Guardado'}
      accessibilityState={{ disabled: true, busy: state === 'saving' }} style={[styles.pill, { backgroundColor: colors.primary }, pill]} testID={testID}>
      {state === 'saving' ? <ActivityIndicator color={colors.onPrimary} /> : <AppIcon name="checkmark" color={colors.onPrimary} size={24} />}
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  row: { alignItems: 'center' },
  pill: { height: HEIGHT, borderRadius: brandTokens.radius.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
