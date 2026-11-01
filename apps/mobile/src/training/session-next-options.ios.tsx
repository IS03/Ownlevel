import { useState } from 'react';
import { requireNativeView } from 'expo';
import { StyleSheet, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import { sizes, spacing, useOwnlevelTheme } from '@/design-system';
import type { SessionNextOptionsProps } from './session-next-options.types';

type NativeProps = ViewProps & {
  openRequest: number; editable: boolean; name: string; decision: string; decisionNote: string;
  applyToRoutine: boolean; applyLabel: string | null; extra: boolean; isDark: boolean;
  accent: string; muted: string; contentPadding: number; contentSpacing: number; minTouch: number;
  onPresentationChange: (event: NativeSyntheticEvent<{ presented: boolean }>) => void;
  onDecision: (event: NativeSyntheticEvent<{ decision: SessionNextOptionsProps['decision'] }>) => void;
  onApply: (event: NativeSyntheticEvent<{ value: boolean }>) => void;
};
const NativeOptions = requireNativeView<NativeProps>('OwnlevelFinishControls', 'NextSessionOptionsView');

/** UIKit owns presentation through completed dismissal. React observes it; each tap is a separate request. */
export function SessionNextOptions(props: SessionNextOptionsProps) {
  const { colors, isDark } = useOwnlevelTheme();
  // Remounting a collapsed card must not replay a request from its previous native view.
  const [baselineRequest] = useState(() => props.open ? 0 : props.openRequest ?? 0);
  const applyLabel = props.routineLinked ? 'Tomar resultado de hoy' : props.addToRoutineName ? `Sumar a ${props.addToRoutineName}` : null;
  return <NativeOptions pointerEvents="none" style={StyleSheet.absoluteFill}
    openRequest={Math.max(0, (props.openRequest ?? 0) - baselineRequest)} editable={props.editable} name={props.name} decision={props.decision}
    decisionNote={props.decisionNote} applyToRoutine={props.applyToRoutine} applyLabel={applyLabel}
    extra={!props.routineLinked} isDark={isDark} accent={colors.primary} muted={colors.textMuted}
    contentPadding={spacing.xl} contentSpacing={spacing.sm} minTouch={sizes.touchTarget}
    onPresentationChange={({ nativeEvent }) => { if (nativeEvent.presented) props.onOpen?.(); else props.onClose(); }}
    onDecision={({ nativeEvent }) => props.onDecision(nativeEvent.decision)}
    onApply={({ nativeEvent }) => props.onApply(nativeEvent.value)} />;
}
