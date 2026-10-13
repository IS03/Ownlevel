import { Button, HStack, Host, Image, List, ScrollView, Spacer, Text, TextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { accessibilityAddTraits, accessibilityLabel, background, buttonStyle, contentShape, disabled, font, foregroundStyle, frame, listRowBackground, listStyle, onTapGesture, padding, scrollContentBackground, shapes, submitLabel } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import { MUSCLE_GROUP_OPTIONS, exerciseSummary } from './exercise-library-model';
import type { RoutineExercisePickerBodyProps } from './routine-exercise-picker-body.types';
export function RoutineExercisePickerBody(props: RoutineExercisePickerBodyProps) {
  const { colors, isDark } = useOwnlevelTheme(), text = useNativeState(props.query);
  return <Host colorScheme={isDark ? 'dark' : 'light'} style={{ flex: 1 }}>
    <VStack spacing={12} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'top' })]}>
      <HStack spacing={8} modifiers={[padding({ horizontal: 16, vertical: 12 }), background(colors.surfaceRaised, shapes.roundedRectangle({ cornerRadius: 12 }))]}>
        <Image systemName="magnifyingglass" color={colors.textMuted} size={20} />
        <TextField text={text} placeholder="Buscar ejercicio" onTextChange={props.onQuery} modifiers={[accessibilityLabel('Buscar ejercicio'), disabled(props.disabled), submitLabel('search')]} />
      </HStack>
      <ScrollView axes="horizontal" showsIndicators={false} modifiers={[frame({ height: 48 })]}>
        <HStack spacing={8}>
          {[{ value: null, label: 'Todos' }, ...MUSCLE_GROUP_OPTIONS].map(option => <Button key={option.value ?? 'all'} label={option.label} onPress={() => props.onGroup(option.value)}
            modifiers={[buttonStyle('plain'), disabled(props.disabled), foregroundStyle(props.group === option.value ? colors.primary : colors.text), padding({ horizontal: 16, vertical: 12 }), background(props.group === option.value ? colors.brandSubtle : colors.surface, shapes.roundedRectangle({ cornerRadius: 10 }))]} />)}
        </HStack>
      </ScrollView>
      <List modifiers={[listStyle('insetGrouped'), scrollContentBackground('hidden')]}>
        {props.rows.map(exercise => <HStack key={exercise.id} spacing={12} modifiers={[listRowBackground(colors.surface), frame({ minHeight: 48 }), contentShape(shapes.rectangle()),
          disabled(props.disabled || props.existing.has(exercise.id)), accessibilityAddTraits(['isButton']), onTapGesture(() => { if (!props.disabled && !props.existing.has(exercise.id)) props.onToggle(exercise.id); }),
          accessibilityLabel(`${exercise.name}${props.existing.has(exercise.id) ? ', En la rutina' : props.selected.includes(exercise.id) ? ', seleccionado' : ''}`)]}>
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(props.existing.has(exercise.id) ? colors.textMuted : colors.text)]}>{exercise.name}</Text>
            {exerciseSummary(exercise) ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(colors.textMuted)]}>{exerciseSummary(exercise)}</Text> : null}
          </VStack>
          <Spacer />
          {props.existing.has(exercise.id) ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(colors.textMuted)]}>En la rutina</Text> : props.selected.includes(exercise.id) ? <Image systemName="checkmark.circle.fill" color={colors.primary} size={20} /> : null}
        </HStack>)}
        {props.rows.length === 0 ? props.query.trim() ? <Button label={`Crear “${props.query.trim()}”`} systemImage="plus" onPress={props.onCreate} modifiers={[disabled(props.disabled), listRowBackground(colors.surface)]} />
          : <Text modifiers={[foregroundStyle(colors.textMuted), listRowBackground(colors.surface)]}>No hay ejercicios disponibles</Text> : null}
      </List>
    </VStack>
  </Host>;
}
