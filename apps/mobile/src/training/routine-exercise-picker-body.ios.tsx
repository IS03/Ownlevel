import { useRef } from 'react';
import { Button, HStack, Host, Image, LazyVStack, ProgressView, Rectangle, ScrollView, Spacer, Text, TextField, VStack, useNativeState, type TextFieldRef } from '@expo/ui/swift-ui';
import { accessibilityAddTraits, accessibilityHidden, accessibilityLabel, background, buttonStyle, glassEffect, scrollClipDisabled, scrollDismissesKeyboard, tint, contentShape, disabled, fixedSize, font, foregroundStyle, frame, onTapGesture, padding, shapes, submitLabel } from '@expo/ui/swift-ui/modifiers';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { MobileTrainingExercise } from '@/api/exercises';
import { brandTokens, useOwnlevelTheme } from '@/design-system';
import { MUSCLE_GROUP_OPTIONS, exerciseSummary } from './exercise-library-model';
import type { RoutineExercisePickerBodyProps } from './routine-exercise-picker-body.types';

const { layout, radius, space } = brandTokens;
// Results sit on a solid grouped card (brand card radius, no glass) over the sheet background: glass stays on the search and chips only.
const cardShape = (color: string) => background(color, shapes.roundedRectangle({ cornerRadius: radius.card, roundedCornerStyle: 'continuous' }));
const rowPadding = padding({ horizontal: layout.cardPadding, vertical: space.xs });
const rowFrame = frame({ maxWidth: Infinity, minHeight: layout.inputHeight, alignment: 'leading' });

/** «Crear…» as its own quiet group: the only champagne label in the list, so it is not mistaken for an exercise. */
function CreateCard({ label, systemImage, disabled: off, onPress }: { label: string; systemImage: 'square.and.pencil' | 'plus'; disabled: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <Button onPress={onPress} modifiers={[buttonStyle('plain'), disabled(off), accessibilityLabel(label)]}>
    <HStack spacing={12} modifiers={[rowPadding, rowFrame, contentShape(shapes.rectangle()), cardShape(colors.surface)]}>
      <Image systemName={systemImage} color={colors.primary} size={20} modifiers={[accessibilityHidden(true)]} />
      <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(colors.primary), fixedSize({ vertical: true })]}>{label}</Text>
      <Spacer />
    </HStack>
  </Button>;
}

function ExerciseRow({ exercise, last, props }: { exercise: MobileTrainingExercise; last: boolean; props: RoutineExercisePickerBodyProps }) {
  const { colors } = useOwnlevelTheme();
  const existing = props.existing.has(exercise.id), selected = props.selected.includes(exercise.id), summary = exerciseSummary(exercise);
  const stateLabel = props.session ? 'En la sesión' : 'En la rutina';
  const adding = props.adding?.id === exercise.id ? props.adding : null;
  return <VStack spacing={0}>
    <HStack spacing={12} modifiers={[rowPadding, rowFrame, contentShape(shapes.rectangle()),
      disabled(props.disabled || existing), accessibilityAddTraits(['isButton']), onTapGesture(() => { if (!props.disabled && !existing) props.onToggle(exercise.id); }),
      accessibilityLabel(`${exercise.name}${existing ? `, ${stateLabel}` : selected ? ', seleccionado' : ''}`)]}>
      {/* Full name always wraps (never truncated); an exercise already in the list reads muted, and keeps its label. */}
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(existing ? colors.textMuted : colors.text), fixedSize({ vertical: true })]}>{exercise.name}</Text>
        {summary ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(colors.textMuted), fixedSize({ vertical: true })]}>{summary}</Text> : null}
      </VStack>
      <Spacer />
      {adding ? adding.done ? <Image systemName="checkmark.circle.fill" color={colors.primary} size={20} /> : <ProgressView />
        : existing ? <HStack spacing={4} modifiers={[fixedSize({ horizontal: true })]}>
          <Image systemName="checkmark" color={colors.textMuted} size={12} modifiers={[accessibilityHidden(true)]} />
          <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(colors.textMuted)]}>{stateLabel}</Text>
        </HStack>
          : selected ? <Image systemName="checkmark.circle.fill" color={colors.primary} size={20} />
            : props.session ? <Image systemName="plus" color={colors.textMuted} size={17} modifiers={[accessibilityHidden(true)]} /> : null}
    </HStack>
    {/* Hairline inset to the text, not full width. */}
    {last ? null : <Rectangle modifiers={[foregroundStyle(colors.border), frame({ height: 0.5 }), padding({ leading: layout.cardPadding }), accessibilityHidden(true)]} />}
  </VStack>;
}

function EmptyRow({ children }: { children: string }) {
  const { colors } = useOwnlevelTheme();
  return <Text modifiers={[foregroundStyle(colors.textMuted), rowPadding, rowFrame]}>{children}</Text>;
}

export function RoutineExercisePickerBody(props: RoutineExercisePickerBodyProps) {
  const { colors, isDark } = useOwnlevelTheme(), text = useNativeState(props.query);
  const glass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  // Tapping anywhere outside the field (or scrolling) drops the keyboard.
  const field = useRef<TextFieldRef>(null), focused = useRef(false);
  const blur = () => { if (focused.current) void field.current?.blur(); };
  const onFocusChange = (value: boolean) => { focused.current = value; };
  const name = props.query.trim(), empty = props.rows.length === 0;
  // Same conditions as before: the session sheet always offers it; the routine picker only when a search found nothing.
  const createLabel = name ? `Crear “${name}”` : 'Crear ejercicio nuevo';
  const create = props.session && props.canCreate ? <CreateCard label={createLabel} systemImage="square.and.pencil" disabled={props.disabled} onPress={props.onCreate} />
    : empty && props.canCreate && !props.session && name ? <CreateCard label={createLabel} systemImage="plus" disabled={props.disabled} onPress={props.onCreate} /> : null;
  const emptyText = empty ? !props.canCreate ? 'Actualizá la biblioteca para continuar.' : props.session || !name ? 'No hay ejercicios disponibles' : null : null;
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
      {/*
        Results: a plain ScrollView with solid grouped cards instead of a native List. `insetGrouped` draws the rounded group but
        adds an empty header gap above it (#376) and `inset` cannot round the group, so the card is built explicitly.
        The rows stay in a LazyVStack so a long library only instantiates what is on screen.
      */}
      <ScrollView modifiers={[scrollDismissesKeyboard('immediately')]}>
        <VStack spacing={space.sm} modifiers={[padding({ horizontal: layout.screenPadding, bottom: space.lg })]}>
          {create}
          {empty ? emptyText ? <VStack modifiers={[cardShape(colors.surface)]}><EmptyRow>{emptyText}</EmptyRow></VStack> : null
            : <LazyVStack spacing={0} modifiers={[cardShape(colors.surface)]}>
              {props.rows.map((exercise, index) => <ExerciseRow key={exercise.id} exercise={exercise} last={index === props.rows.length - 1} props={props} />)}
            </LazyVStack>}
        </VStack>
      </ScrollView>
    </VStack>
  </Host>;
}
