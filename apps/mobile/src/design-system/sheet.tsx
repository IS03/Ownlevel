import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { layout } from './brand';
import { AppIcon, appIconSize } from './icons';
import { AppText, Button } from './primitives';
import { radius, spacing } from './tokens';
import { useOwnlevelTheme } from './theme';

// Sheet foundation for app-drawn sheets (native pageSheet modals keep the system
// chrome): top radius 28, solid surface, optional handle and a standard header.

/** Container for an app-drawn bottom sheet. */
export function SheetSurface({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  const { colors } = useOwnlevelTheme();
  return (
    <View {...props} style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function SheetHandle() {
  const { colors } = useOwnlevelTheme();
  // The system grabber's look: a quiet text tone, not the border color, which almost vanished on the sand background.
  return <View accessibilityElementsHidden style={[styles.handle, { backgroundColor: colors.textMuted }]} />;
}

type SheetHeaderProps = {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  /** Accessibility label of the close button (default "Cerrar {title}"). */
  closeLabel?: string;
  closeDisabled?: boolean;
  onBack?: () => void;
  backLabel?: string;
  /** Screen padding around the header (top of a native sheet). Off inside a SheetSurface. */
  inset?: boolean;
};

/** Title (Title 2) + subtitle, with optional back action and an icon close button. */
export function SheetHeader({ backLabel = 'Volver', closeDisabled = false, closeLabel, inset = true, onBack, onClose, subtitle, title }: SheetHeaderProps) {
  const { colors } = useOwnlevelTheme();
  return (
    <View style={[styles.header, inset && styles.inset]}>
      {onBack ? <Button label={backLabel} onPress={onBack} variant="quiet" /> : null}
      <View style={styles.headerText}>
        <AppText accessibilityRole="header" variant="title2">{title}</AppText>
        {subtitle ? <AppText muted variant="footnote">{subtitle}</AppText> : null}
      </View>
      {onClose ? (
        <Pressable
          accessibilityLabel={closeLabel ?? `Cerrar ${title}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: closeDisabled }}
          disabled={closeDisabled}
          hitSlop={4}
          onPress={onClose}
          style={({ pressed }) => [styles.close, { backgroundColor: pressed ? colors.border : colors.surfaceRaised }, closeDisabled && styles.disabled]}
        >
          <AppIcon color={colors.textMuted} name="close" size={appIconSize.inline} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  handle: { alignSelf: 'center', borderRadius: radius.full, height: 5, width: 36, opacity: 0.35 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  inset: { padding: layout.screenPadding },
  close: { alignItems: 'center', borderRadius: radius.full, height: 36, justifyContent: 'center', margin: (layout.minTouch - 36) / 2, width: 36 },
  disabled: { opacity: 0.45 },
  headerText: { flex: 1, gap: spacing.xs },
});
