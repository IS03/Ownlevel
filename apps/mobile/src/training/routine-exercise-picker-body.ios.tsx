import { useRef } from 'react';
import { Button, HStack, Host, Image, List, ProgressView, ScrollView, Spacer, Text, TextField, VStack, useNativeState, type TextFieldRef } from '@expo/ui/swift-ui';
import { accessibilityAddTraits, accessibilityLabel, background, buttonStyle, glassEffect, scrollClipDisabled, scrollDismissesKeyboard, tint, contentShape, disabled, font, foregroundStyle, frame, listRowBackground, listStyle, onTapGesture, padding, scrollContentBackground, shapes, submitLabel } from '@expo/ui/swift-ui/modifiers';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { brandTokens, useOwnlevelTheme } from '@/design-system';
import { MUSCLE_GROUP_OPTIONS, exerciseSummary } from './exercise-library-model';
import type { RoutineExercisePickerBodyProps } from './routine-exercise-picker-body.types';
export function RoutineExercisePickerBody(props: RoutineExercisePickerBodyProps) {
  const { colors, isDark } = useOwnlevelTheme(), text = useNativeState(props.query);
  const glass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  // Tapping anywhere outside the field (or scrolling) drops the keyboard.
  const field = useRef<TextFieldRef>(null), focused = useRef(false);
  const blur = () => { if (focused.current) void field.current?.blur(); };
  const onFocusChange = (value: boolean) => { focused.current = value; };
  return <Host colorScheme={isDark ? 'dark' : 'light'} style={{ flex: 1 }}>
    {/* eslint-disable-next-line react-hooks/refs -- the tap handler reads refs only when it runs, never during render */}
    <VStack spacing={12} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'top' }), contentShape(shapes.rectangle()), onTapGesture(blur)]}>
      <HStack spacing={8} modifiers={[padding({ horizontal: 16, vertical: 12 }), glass ? glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' }) : background(colors.surfaceRaised, shapes.roundedRectangle({ cornerRadius: 12 })), padding({ horizontal: 16 })]}>
        <Image systemName="magnifyingglass" color={colors.textMuted} size={20} />
        <TextField ref={field} onFocusChange={onFocusChange} text={text} placeholder="Buscar ejercicio" onTextChange={props.onQuery} modifiers={[accessibilityLabel('Buscar ejercicio'), disabled(props.disabled), submitLabel('search')]} />
      </HStack>
      {/* Unclipped so the glass chips can grow when pressed without being cut top and bottom. */}
      <ScrollView axes="horizontal" showsIndicators={false} modifiers={[frame({ height: brandTokens.layout.inputHeight }), scrollClipDisabled()]}>
        <HStack spacing={8} modifiers={[padding({ horizontal: 16 })]}>
          {[{ value: null, label: 'Todos' }, ...MUSCLE_GROUP_OPTIONS].map(option => <Button key={option.value ?? 'all'} label={option.label} onPress={() => props.onGroup(option.value)}
            modifiers={glass
              // iOS 26: native interactive Liquid Glass chips; the selected one carries the champagne tint.
              ? [buttonStyle(props.group === option.value ? 'glassProminent' : 'glass'), tint(props.group === option.value ? colors.brandSubtle : colors.surface), disabled(props.disabled), foregroundStyle(props.group === option.value ? colors.primary : colors.text)]
              : [buttonStyle('plain'), disabled(props.disabled), foregroundStyle(props.group === option.value ? colors.primary : colors.text), padding({ horizontal: 16, vertical: 12 }), background(props.group === option.value ? colors.brandSubtle : colors.surface, shapes.roundedRectangle({ cornerRadius: 10 }))]} />)}
        </HStack>
      </ScrollView>
      <List modifiers={[listStyle('insetGrouped'), scrollContentBackground('hidden'), scrollDismissesKeyboard('immediately')]}>
        {props.session && props.canCreate ? <Button label={props.query.trim() ? `Crear “${props.query.trim()}”` : 'Crear ejercicio nuevo'} systemImage="square.and.pencil" onPress={props.onCreate} modifiers={[disabled(props.disabled), foregroundStyle(colors.primary), listRowBackground(colors.surface)]} /> : null}
        {props.rows.map(exercise => <HStack key={exercise.id} spacing={12} modifiers={[listRowBackground(colors.surface), frame({ minHeight: brandTokens.layout.inputHeight }), contentShape(shapes.rectangle()),
          disabled(props.disabled || props.existing.has(exercise.id)), accessibilityAddTraits(['isButton']), onTapGesture(() => { if (!props.disabled && !props.existing.has(exercise.id)) props.onToggle(exercise.id); }),
          accessibilityLabel(`${exercise.name}${props.existing.has(exercise.id) ? `, En la ${props.session ? 'sesión' : 'rutina'}` : props.selected.includes(exercise.id) ? ', seleccionado' : ''}`)]}>
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(props.existing.has(exercise.id) ? colors.textMuted : colors.text)]}>{exercise.name}</Text>
            {exerciseSummary(exercise) ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(colors.textMuted)]}>{exerciseSummary(exercise)}</Text> : null}
          </VStack>
          <Spacer />
          {props.adding?.id === exercise.id ? props.adding.done ? <Image systemName="checkmark.circle.fill" color={colors.primary} size={20} /> : <ProgressView /> : props.existing.has(exercise.id) ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(colors.textMuted)]}>{props.session ? 'En la sesión' : 'En la rutina'}</Text> : props.selected.includes(exercise.id) ? <Image systemName="checkmark.circle.fill" color={colors.primary} size={20} /> : props.session ? <Image systemName="plus.circle" color={colors.primary} size={20} /> : null}
        </HStack>)}
        {props.rows.length === 0 ? !props.canCreate ? <Text modifiers={[foregroundStyle(colors.textMuted), listRowBackground(colors.surface)]}>Actualizá la biblioteca para continuar.</Text> : !props.session && props.query.trim() ? <Button label={`Crear “${props.query.trim()}”`} systemImage="plus" onPress={props.onCreate} modifiers={[disabled(props.disabled), listRowBackground(colors.surface)]} />
          : <Text modifiers={[foregroundStyle(colors.textMuted), listRowBackground(colors.surface)]}>No hay ejercicios disponibles</Text> : null}
      </List>
    </VStack>
  </Host>;
}
