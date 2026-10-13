import { StyleSheet } from 'react-native';
import { Divider, Host, Popover, Rectangle, Text, Toggle, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, font, foregroundStyle, frame, padding, tint, toggleStyle } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { SessionNextOptionsProps } from './session-next-options.types';

/** Controlled toggles keep the native popover open; outside taps dismiss it. */
export function SessionNextOptions(props: SessionNextOptionsProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const applyLabel = props.routineLinked ? 'Tomar resultado de hoy' : `Sumar a ${props.addToRoutineName}`;
  return <Host colorScheme={isDark ? 'dark' : 'light'} ignoreSafeArea="all" pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Popover isPresented={props.open} onIsPresentedChange={presented => { if (!presented) props.onClose(); }} attachmentAnchor="center" arrowEdge="trailing">
      <Popover.Trigger><Rectangle modifiers={[foregroundStyle('clear'), frame({ maxWidth: 10_000, maxHeight: 10_000 })]} /></Popover.Trigger>
      <Popover.Content>
        <VStack alignment="leading" spacing={12} modifiers={[padding({ all: 24 }), frame({ width: 300 }), tint(colors.primary), disabled(!props.editable)]}>
          <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: 10_000, alignment: 'leading' })]}>
            <Text modifiers={[font({ textStyle: 'headline' })]}>Próxima vez</Text>
            <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(colors.textMuted)]}>{props.name}</Text>
          </VStack>
          <Divider />
          <Toggle label="Más peso" systemImage={props.decision === 'increase_weight' ? 'checkmark' : 'plus'} isOn={props.decision === 'increase_weight'}
            onIsOnChange={() => props.onDecision('increase_weight')} modifiers={[toggleStyle('button'), buttonStyle('plain'), foregroundStyle(colors.primary), frame({ minHeight: 44, maxWidth: 10_000, alignment: 'leading' })]} />
          <Toggle label="Más repeticiones" systemImage={props.decision === 'increase_reps' ? 'checkmark' : 'plus'} isOn={props.decision === 'increase_reps'}
            onIsOnChange={() => props.onDecision('increase_reps')} modifiers={[toggleStyle('button'), buttonStyle('plain'), foregroundStyle(colors.primary), frame({ minHeight: 44, maxWidth: 10_000, alignment: 'leading' })]} />
          {props.decision === 'custom' ? <Toggle label={props.decisionNote || 'Recordatorio anterior'} systemImage="checkmark" isOn
            onIsOnChange={() => props.onDecision('custom')} modifiers={[toggleStyle('button'), buttonStyle('plain'), foregroundStyle(colors.primary), frame({ minHeight: 44 })]} /> : null}
          {props.routineLinked || props.addToRoutineName ? <><Divider />
            {/* Plain label: the two-Text label never reported the switch change. */}
            <Toggle isOn={props.applyToRoutine} label={applyLabel} onIsOnChange={value => props.onApply(value)} modifiers={[toggleStyle('switch')]} />
            {!props.routineLinked ? <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(colors.textMuted)]}>Al finalizar, se agrega al final de la rutina con las series de hoy.</Text> : null}
          </> : null}
        </VStack>
      </Popover.Content>
    </Popover>
  </Host>;
}
