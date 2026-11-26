import { useState, type ComponentType } from 'react';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { StyleSheet, type NativeSyntheticEvent, type ViewProps } from 'react-native';

import { AppText, useOwnlevelTheme } from '@/design-system';
import { traceStartupNative } from '@/entry/first-data';
import type { HomePageControlProps } from './home-page-control.types';

type NativePageControlProps = ViewProps & {
  activeColor: string;
  inactiveColor: string;
  isDark: boolean;
  labels: string[];
  onPageChange: (event: NativeSyntheticEvent<{ page: number }>) => void;
  page: number;
};

/** The native binary must include the local Expo module; never silently imitate UIKit on iOS. */
export function HomePageControl({ labels, onSelect, page }: HomePageControlProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const [NativeControl] = useState<ComponentType<NativePageControlProps> | null>(() => {
    if (!requireOptionalNativeModule('OwnlevelPageControl')) return null;
    return requireNativeView<NativePageControlProps>('OwnlevelPageControl', 'OwnlevelPageControlView');
  });
  if (!NativeControl) return <AppText muted style={styles.notice} testID="home-week-native-rebuild" variant="footnote">
    Recompilá la app para activar el control de páginas nativo.
  </AppText>;
  return <NativeControl activeColor={colors.primary} inactiveColor={colors.textMuted} isDark={isDark} labels={labels}
    onLayout={() => traceStartupNative('page-control-layout')}
    onPageChange={event => {
      traceStartupNative('page-control-change');
      const next = event.nativeEvent.page;
      if (Number.isInteger(next) && next >= 0 && next < labels.length) onSelect(next);
    }} page={page} style={[styles.control, { width: Math.max(132, labels.length * 44) }]} testID="home-week-native-page-control" />;
}

const styles = StyleSheet.create({
  control: { height: 44 },
  notice: { textAlign: 'center' },
});
